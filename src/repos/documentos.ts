// Procedencia del corpus en PostgreSQL: quién puso cada documento, cuándo, y con
// qué suma de verificación se indexó.
//
// **Este archivo no lleva `AlcanceContacto`, y es el primero de `src/repos/` que
// no lo lleva.** El motivo está en la migración 002 y se repite aquí porque es
// donde alguien lo va a leer: el corpus es común a todos los contactos. No hay
// contacto al que acotarlo, y ponerle uno inventado haría que el filtro de
// alcance afirmara algo falso — que estos documentos pertenecen a alguien.
//
// La exención está declarada por nombre en la prueba estructural de la fase 1, no
// concedida en silencio: añadir un archivo a esa lista es un cambio visible en el
// diff, que es exactamente para lo que la lista existe.

import type { Consultador } from './cliente.ts';

export type RegistroDocumento = {
  readonly id: string;
  readonly ruta: string;
  readonly titulo: string;
  readonly suma: string;
  readonly origen: 'carpeta' | 'cloud_storage';
  readonly subido_por: string;
  readonly fragmentos: number;
  readonly bytes: number;
  readonly modelo_embeddings: string;
};

type Fila = {
  id: string;
  ruta: string;
  titulo: string;
  suma: string;
  origen: string;
  subido_por: string;
  fragmentos: number;
  bytes: number;
  modelo_embeddings: string;
  ingerido_en: Date;
};

/** Lo que hay registrado hoy, por identificador de documento. */
export async function documentosRegistrados(
  bd: Consultador,
): Promise<ReadonlyMap<string, RegistroDocumento & { readonly ingerido_en: Date }>> {
  const filas = await bd.consultar<Fila>(
    `SELECT id, ruta, titulo, suma, origen, subido_por, fragmentos, bytes,
            modelo_embeddings, ingerido_en
       FROM documentos`,
  );

  return new Map(
    filas.map((f) => [
      f.id,
      {
        ...f,
        origen: f.origen === 'cloud_storage' ? ('cloud_storage' as const) : ('carpeta' as const),
      },
    ]),
  );
}

/**
 * Registra o actualiza un documento.
 *
 * El conflicto se resuelve por `id` —derivado de la ruta— y no por suma: un
 * documento editado es el mismo documento con contenido nuevo, no uno distinto.
 * Tratarlo como nuevo dejaría la fila vieja apuntando a fragmentos que ya se
 * borraron del índice.
 */
export async function registrarDocumento(
  bd: Consultador,
  documento: RegistroDocumento,
): Promise<void> {
  await bd.consultar(
    `INSERT INTO documentos
       (id, ruta, titulo, suma, origen, subido_por, fragmentos, bytes, modelo_embeddings,
        ingerido_en, verificado_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       ruta              = EXCLUDED.ruta,
       titulo            = EXCLUDED.titulo,
       suma              = EXCLUDED.suma,
       origen            = EXCLUDED.origen,
       subido_por        = EXCLUDED.subido_por,
       fragmentos        = EXCLUDED.fragmentos,
       bytes             = EXCLUDED.bytes,
       modelo_embeddings = EXCLUDED.modelo_embeddings,
       ingerido_en       = now(),
       verificado_en     = now()`,
    [
      documento.id,
      documento.ruta,
      documento.titulo,
      documento.suma,
      documento.origen,
      documento.subido_por,
      documento.fragmentos,
      documento.bytes,
      documento.modelo_embeddings,
    ],
  );
}

/** Un documento que ya no está en la carpeta deja de estar registrado. */
export async function olvidarDocumento(bd: Consultador, id: string): Promise<void> {
  await bd.consultar('DELETE FROM documentos WHERE id = $1', [id]);
}

export type AlertaDeSuma = {
  readonly id: string;
  readonly ruta: string;
  readonly suma_registrada: string;
  readonly suma_en_disco: string;
};

/**
 * Compara lo registrado con lo que hay en disco.
 *
 * Criterio de aceptación de la fase 2: «un documento modificado fuera del flujo
 * de ingestión dispara alerta de suma de verificación». La comprobación es una
 * comparación de cadenas, no una heurística: o coinciden o no.
 *
 * Se marca `verificado_en` de los que coinciden, para que el vigía de vigencia de
 * la fase 4B-2 sepa cuándo fue la última vez que se miró de verdad.
 */
export async function verificarSumas(
  bd: Consultador,
  enDisco: ReadonlyMap<string, string>,
): Promise<readonly AlertaDeSuma[]> {
  const registrados = await documentosRegistrados(bd);
  const alertas: AlertaDeSuma[] = [];
  const intactos: string[] = [];

  for (const [id, registro] of registrados) {
    const suma = enDisco.get(id);
    // Un documento que ya no está en disco no es una alerta de suma: es un
    // documento retirado, y lo resuelve la ingestión olvidándolo. Confundir las
    // dos cosas llenaría el panel de alertas por cada archivo borrado a
    // propósito.
    if (suma === undefined) continue;

    if (suma === registro.suma) {
      intactos.push(id);
    } else {
      alertas.push({
        id,
        ruta: registro.ruta,
        suma_registrada: registro.suma,
        suma_en_disco: suma,
      });
    }
  }

  if (intactos.length > 0) {
    await bd.consultar('UPDATE documentos SET verificado_en = now() WHERE id = ANY($1)', [
      intactos,
    ]);
  }

  return alertas;
}
