// El publicador. Lee PostgreSQL dentro del perímetro y escribe la proyección.
//
// Es el **único** componente con permiso de escritura sobre el destino, y corre
// dentro del perímetro. Invariante 8.
//
// Tres propiedades que no son negociables, y por qué cada una:
//
//   1. **Todo lo que se publica pasa por la capa de saneo**, la misma que las
//      llamadas externas. Publicar es salir: un dato que llega a Firestore ha
//      salido del perímetro tanto como uno que va a la API de un proveedor, y
//      tratarlo distinto porque «es nuestro panel» es la excusa con la que se
//      pierden los datos.
//   2. **Nada de lo que se publica lleva un identificador de contacto.** Los
//      agregados no pueden traerlo —lo impide la prueba estructural de
//      `src/repos/`— y las trazas lo pierden aquí.
//   3. **Si el saneo tiene que actuar, se publica lo enmascarado y se avisa
//      fuerte.** No se bloquea. La tentación era detener —es la postura del
//      proyecto ante un límite— pero aquí detener no protege nada: el dato ya
//      está en la tabla de eventos, no publicarlo no lo retira, y lo único que
//      se consigue es que el panel deje de actualizarse sin que nadie sepa por
//      qué. Lo enmascarado es estrictamente más seguro que lo no publicado.
//      Lo que sí es inaceptable es que pase callado, y por eso el resultado
//      lleva qué tipos hubo que enmascarar — nunca sus valores.
//
//      Que el saneo tenga que actuar aquí significa que un dato sensible llegó a
//      la tabla de eventos: es un incidente **del perímetro**, y se arregla
//      aguas arriba, no en el publicador.

import { sanear } from '../src/core/saneo/sanear.ts';
import { derivar, type Agregados, type Proyeccion } from './derivar.ts';
import type { Reproduccion } from './demo.ts';
import type { DestinoDeProyeccion, DocumentoProyectado } from './puerto.ts';

export class ErrorDePublicacion extends Error {
  override readonly name = 'ErrorDePublicacion';
}

/** Una traza de caso, tal como la enseña el panel al rol que ve contenido. */
export type TrazaParaPublicar = {
  readonly caso_id: string;
  readonly marca_tiempo: string;
  readonly canal: string;
  readonly clase_tarea: string;
  readonly clase_sensibilidad: string;
  readonly destino_ejecucion: string;
  readonly desvio_ejecucion: string;
  readonly resultado: string;
  readonly motivo_decision: string;
  readonly motivo_escalado: string | null;
  readonly fuentes: readonly string[];
  readonly hubo_egreso: boolean;
  readonly latencia_ms: number;
  readonly costo: number;
  readonly costo_provisional: boolean;
};

/**
 * Sanea recursivamente todo el texto de un objeto.
 *
 * Recursivo y no campo a campo: una lista de campos que sanear envejece mal —el
 * día que alguien añade uno al esquema, el saneo no lo cubre y nadie se entera
 * hasta que sale publicado. Recorrer todo lo que sea texto no puede olvidarse de
 * un campo nuevo.
 */
function sanearProfundo(valor: unknown, hallazgos: string[]): unknown {
  if (typeof valor === 'string') {
    const resultado = sanear(valor);
    // El `recuento` da tipos y cuántos, nunca los valores — que es exactamente lo
    // que puede salir en un aviso sin volver a filtrar lo que se acaba de tapar.
    for (const [tipo, cuantos] of Object.entries(resultado.recuento)) {
      for (let i = 0; i < (cuantos ?? 0); i += 1) hallazgos.push(tipo);
    }
    return resultado.texto;
  }
  if (Array.isArray(valor)) return valor.map((v) => sanearProfundo(v, hallazgos));
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
        k,
        sanearProfundo(v, hallazgos),
      ]),
    );
  }
  return valor;
}

export type ResultadoDePublicacion = {
  readonly documentos: number;
  readonly proyeccion: Proyeccion;
  /** Qué tipos de identificador se enmascararon al publicar. Nunca los valores. */
  readonly enmascarados: readonly string[];
};

/**
 * Publica la demo pública: la reproducción del lote de la fase 7.
 *
 * Va por el mismo saneo que todo lo demás y por el mismo puerto, aunque su
 * origen sea un archivo y no PostgreSQL. Es la colección que las reglas de
 * Firestore abren a lectura anónima —`match /demo/{documento}`— y por eso es
 * justo la que menos se puede publicar sin pasar por aquí.
 *
 * Dos documentos y no uno: el resumen se lee en cada visita y los casos solo al
 * abrir la lista. Partirlos evita que el visitante que solo mira las cifras se
 * descargue las tres corridas enteras.
 */
export type ResultadoDePublicacionDemo = {
  readonly documentos: number;
  readonly casos: number;
  readonly enmascarados: readonly string[];
};

export async function publicarDemo(
  destino: DestinoDeProyeccion,
  reproduccion: Reproduccion,
  avisar: (linea: string) => void = (l) => console.warn(l),
): Promise<ResultadoDePublicacionDemo> {
  const hallazgos: string[] = [];
  const { casos, ...resumen } = reproduccion;

  const documentos: DocumentoProyectado[] = [
    { ruta: 'demo/lote', contenido: sanearProfundo(resumen, hallazgos) as Record<string, unknown> },
    {
      ruta: 'demo/casos',
      contenido: sanearProfundo({ lote: reproduccion.lote, casos }, hallazgos) as Record<
        string,
        unknown
      >,
    },
  ];

  const enmascarados = [...new Set(hallazgos)];
  if (enmascarados.length > 0) {
    // Aquí el aviso pesa más que en la proyección de agregados: esto se publica
    // a lectura anónima. Que el saneo tenga que actuar significa que un caso del
    // lote traía algo con forma de identificador, y hay que mirarlo.
    avisar(
      `INCIDENTE DE PERÍMETRO en la demo pública: ${hallazgos.length} identificador(es) ` +
        `de tipo(s) ${enmascarados.join(', ')} en el lote. Se publican enmascarados.`,
    );
  }

  await destino.publicar(documentos);

  return { documentos: documentos.length, casos: casos.length, enmascarados };
}

export async function publicar(
  destino: DestinoDeProyeccion,
  agregados: Agregados,
  trazas: readonly TrazaParaPublicar[],
  generado_en: string,
  avisar: (linea: string) => void = (l) => console.warn(l),
): Promise<ResultadoDePublicacion> {
  const proyeccion = derivar(agregados, generado_en);
  const hallazgos: string[] = [];

  const documentos: DocumentoProyectado[] = [
    {
      ruta: `agregados/${agregados.ventana.desde}_${agregados.ventana.hasta}`,
      contenido: sanearProfundo(proyeccion, hallazgos) as Record<string, unknown>,
    },
  ];

  for (const traza of trazas) {
    // El `caso_id` va en la RUTA, no en el contenido saneado: es la llave con la
    // que el panel pide una traza concreta, y saneándolo dejaría de servir para
    // eso. Que sea una llave y no un dato es justo la razón por la que ningún
    // agregado puede devolverlo — un agregado con identificadores de caso sería
    // un índice de las conversaciones que hay detrás.
    documentos.push({
      ruta: `trazas/${traza.caso_id}`,
      contenido: sanearProfundo(traza, hallazgos) as Record<string, unknown>,
    });
  }

  const enmascarados = [...new Set(hallazgos)];

  if (enmascarados.length > 0) {
    // Ruidoso, no fatal. Lo que se publica ya va enmascarado; lo que no puede
    // pasar es que nadie se entere de que hizo falta.
    avisar(
      `INCIDENTE DE PERÍMETRO: la proyección traía ${hallazgos.length} identificador(es) ` +
        `de tipo(s) ${enmascarados.join(', ')}. Se publican enmascarados. ` +
        'Que el saneo tenga que actuar aquí significa que un dato sensible llegó a la ' +
        'tabla de eventos: se arregla aguas arriba, no aquí.',
    );
  }

  await destino.publicar(documentos);

  return { documentos: documentos.length, proyeccion, enmascarados };
}
