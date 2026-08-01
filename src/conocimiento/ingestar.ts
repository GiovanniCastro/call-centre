// La ingestión: de la carpeta al índice, sin duplicar y sin perder.
//
// La idempotencia se decide con **dos** comparaciones, no con una:
//
//   · La suma del documento contra la registrada. Si no cambió, no se reindexa.
//     Es lo que hace que reingerir la misma carpeta cueste una lectura y cero
//     llamadas al modelo de embeddings.
//   · El modelo con el que se generaron los vectores vigentes. Si cambió, hay que
//     reindexar aunque el documento sea idéntico: los vectores de dos modelos no
//     son comparables, y mezclarlos produce puntuaciones sin significado.
//
// Y el borrado. Como el `fragmento_id` incluye la suma del documento, los
// fragmentos de la versión nueva no pisan a los de la vieja: sin borrar primero,
// el índice acumularía las dos versiones con la vieja compitiendo por
// recuperarse. Por eso `borrarDocumento` va antes de `guardar` y no después.

import type { ConfigConocimiento } from '../core/conocimiento/config.ts';
import type { DocumentoFuente, Fragmento } from '../core/conocimiento/documento.ts';
import type { AlmacenVectorial, Embeddings } from '../core/conocimiento/puertos.ts';
import { trocear } from '../core/conocimiento/trocear.ts';
import { leerCarpeta, type Leido } from './leer.ts';

/**
 * El gancho que la fase 4C va a rellenar.
 *
 * La fase 2 lo deja **declarado y sin implementar**, que es lo que pide el plan:
 * «gancho de validación previa a la vectorización, sin implementar todavía». Por
 * omisión admite todo. El día que exista el detector de envenenamiento, se pasa
 * aquí y no hay que tocar la ingestión — que es la diferencia entre dejar un
 * punto de extensión y prometer que se dejará.
 */
export type ValidacionPrevia = (
  documento: DocumentoFuente,
  fragmentos: readonly Fragmento[],
) => Promise<{ readonly admitido: true } | { readonly admitido: false; readonly motivo: string }>;

export type RegistroPrevio = {
  readonly suma: string;
  readonly modelo_embeddings: string;
};

export type Persistencia = {
  /** Qué hay registrado, por identificador de documento. */
  registrados(): Promise<ReadonlyMap<string, RegistroPrevio>>;
  registrar(documento: DocumentoFuente, fragmentos: number, bytes: number, modelo: string): Promise<void>;
  olvidar(documentoId: string): Promise<void>;
};

export type OpcionesIngesta = {
  readonly config: ConfigConocimiento;
  readonly embeddings: Embeddings;
  readonly almacen: AlmacenVectorial;
  /** Sin persistencia, la ingestión funciona pero deja de ser incremental. */
  readonly persistencia?: Persistencia | undefined;
  readonly validar?: ValidacionPrevia | undefined;
  /** Cuántos fragmentos se incrustan por llamada. */
  readonly lote?: number | undefined;
  readonly avisar?: ((linea: string) => void) | undefined;
};

export type ResultadoIngesta = {
  readonly leidos: number;
  readonly indexados: number;
  readonly sin_cambios: number;
  readonly retirados: number;
  readonly rechazados: readonly { readonly ruta: string; readonly motivo: string }[];
  readonly fragmentos: number;
  readonly total_en_indice: number;
};

const ADMITE_TODO: ValidacionPrevia = async () => ({ admitido: true });

export async function ingerir(opciones: OpcionesIngesta): Promise<ResultadoIngesta> {
  const { config, embeddings, almacen, persistencia } = opciones;
  const validar = opciones.validar ?? ADMITE_TODO;
  const lote = opciones.lote ?? 16;
  const avisar = opciones.avisar ?? ((): void => {});

  await almacen.asegurarColeccion(embeddings.dimensiones);

  const leidos = await leerCarpeta({
    carpeta: config.ingesta.carpeta,
    extensiones: config.ingesta.extensiones,
    prefijos_excluidos: config.ingesta.prefijos_excluidos,
  });

  const previos = (await persistencia?.registrados()) ?? new Map<string, RegistroPrevio>();

  const rechazados: { ruta: string; motivo: string }[] = [];
  let indexados = 0;
  let sinCambios = 0;
  let fragmentosEscritos = 0;

  for (const leido of leidos) {
    const { documento } = leido;
    const previo = previos.get(documento.documento_id);

    if (previo?.suma === documento.suma && previo.modelo_embeddings === embeddings.nombre) {
      sinCambios += 1;
      continue;
    }

    const fragmentos = trocear(documento, config.troceado);

    const veredicto = await validar(documento, fragmentos);
    if (!veredicto.admitido) {
      // Un documento rechazado no se indexa **y no se olvida**: si ya estaba
      // indexado de antes, sus fragmentos viejos se retiran. Dejarlos sería
      // permitir que la versión anterior de un documento que acaba de ser
      // marcado como hostil siguiera respondiendo consultas.
      await almacen.borrarDocumento(documento.documento_id);
      await persistencia?.olvidar(documento.documento_id);
      rechazados.push({ ruta: documento.procedencia.ruta, motivo: veredicto.motivo });
      avisar(`  ✗ ${documento.procedencia.ruta} — rechazado: ${veredicto.motivo}`);
      continue;
    }

    await almacen.borrarDocumento(documento.documento_id);

    for (let i = 0; i < fragmentos.length; i += lote) {
      const tanda = fragmentos.slice(i, i + lote);
      const vectores = await embeddings.incrustar(tanda.map((f) => f.texto));
      await almacen.guardar(tanda, vectores);
    }

    await persistencia?.registrar(documento, fragmentos.length, leido.bytes, embeddings.nombre);

    indexados += 1;
    fragmentosEscritos += fragmentos.length;
    avisar(`  ✓ ${documento.procedencia.ruta} — ${fragmentos.length} fragmentos`);
  }

  const retirados = await retirar(leidos, previos, almacen, persistencia, avisar);

  return {
    leidos: leidos.length,
    indexados,
    sin_cambios: sinCambios,
    retirados,
    rechazados,
    fragmentos: fragmentosEscritos,
    total_en_indice: await almacen.contar(),
  };
}

/**
 * Los documentos que estaban registrados y ya no están en la carpeta.
 *
 * Sin esto, borrar un archivo del corpus lo deja respondiendo consultas para
 * siempre: el índice no se entera de las ausencias, solo de las presencias.
 */
async function retirar(
  leidos: readonly Leido[],
  previos: ReadonlyMap<string, RegistroPrevio>,
  almacen: AlmacenVectorial,
  persistencia: Persistencia | undefined,
  avisar: (linea: string) => void,
): Promise<number> {
  const presentes = new Set(leidos.map((l) => l.documento.documento_id));
  let retirados = 0;

  for (const id of previos.keys()) {
    if (presentes.has(id)) continue;
    await almacen.borrarDocumento(id);
    await persistencia?.olvidar(id);
    retirados += 1;
    avisar(`  − ${id} — retirado: ya no está en la carpeta`);
  }

  return retirados;
}
