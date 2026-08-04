// La demo pública, como reproducción de ejecuciones registradas.
//
// R-009 y el criterio de la fase 8: **la demo pública no realiza ninguna llamada
// de inferencia.** Sirve lo que el corredor de la fase 7 dejó grabado, y por eso
// no consume presupuesto por visitante, no expone el webhook y no depende de que
// la máquina con Ollama esté encendida.
//
// Dos propiedades que este archivo tiene que garantizar, y cómo:
//
//   1. **No hay inferencia.** No porque nadie la llame, sino porque desde aquí
//      no se puede: este módulo importa un archivo de resultados y nada más. El
//      check `demo-sin-inferencia` de dependency-cruiser lo sostiene sobre el
//      grafo completo, para que no entre por un import de tres saltos.
//   2. **No hay cifras inventadas.** Ninguna cifra se calcula aquí: se reutiliza
//      `resumir` del informe de la fase 7, que es de donde salen las cifras
//      publicables y de ningún otro sitio. Recalcularlas aquí crearía un segundo
//      sitio donde se decide qué es un acierto, y acabaría discrepando del
//      primero — el mismo defecto que la fase 6 arregló con los escalados.
//
// Y una consecuencia del tipo, como en la fase 6: `es_reproduccion` es un
// literal obligatorio y `lote` no admite vacío. El panel no puede enseñar estos
// datos sin la banda que dice qué son, porque para leerlos tiene que pasar por
// el discriminante. La etiqueta no es algo que alguien recuerde poner.

import { resumir, type ResumenDeModo } from '../src/lote/informe.ts';
import type { Ejecucion, ResultadoDeCaso } from '../src/lote/corredor.ts';

/** Un caso del lote, tal como se reproduce. */
export type CasoReproducido = {
  readonly caso_id: string;
  readonly modo: string;
  readonly categoria: string;
  /** La pregunta del lote. Escrita a mano contra el corpus; no es de nadie. */
  readonly pregunta: string;
  readonly resultado: string;
  readonly destino_ejecucion: string;
  readonly desvio_ejecucion: string;
  readonly clase_sensibilidad: string;
  readonly hubo_egreso: boolean;
  readonly fuentes: readonly string[];
  readonly sustento: number | null;
  readonly latencia_ms: number;
  readonly costo: number;
  readonly costo_provisional: boolean;
  readonly vigias_que_actuaron: readonly string[];
  readonly incidentes: readonly string[];
  readonly acerto: boolean;
  readonly por_que_no: string | null;
};

export type Reproduccion = {
  /** Literal, obligatorio: no existe una reproducción que no se declare como tal. */
  readonly es_reproduccion: true;
  /** El identificador del lote, visible. Criterio de la fase 8. */
  readonly lote: string;
  readonly generado_en: string;
  readonly aviso: string;
  readonly modos: readonly ResumenDeModo[];
  readonly casos: readonly CasoReproducido[];
};

/** El archivo que deja el corredor de la fase 7. */
export type ResultadosDelLote = {
  readonly lote: string;
  readonly ejecuciones: readonly Ejecucion[];
};

/** El archivo de casos del lote, del que sale el texto de cada pregunta. */
export type DefinicionDelLote = {
  readonly lote: string;
  readonly casos: readonly { readonly id: string; readonly texto: string }[];
};

export class ErrorDeReproduccion extends Error {
  override readonly name = 'ErrorDeReproduccion';
}

const AVISO =
  'Reproducción de ejecuciones registradas. Cada cifra y cada caso de esta ' +
  'pantalla salieron de una corrida real del lote, guardada en disco. No se ' +
  'ejecuta ningún modelo al visitar esta página.';

function caso(
  resultado: ResultadoDeCaso,
  preguntas: ReadonlyMap<string, string>,
): CasoReproducido {
  return {
    caso_id: resultado.caso_id,
    modo: resultado.modo,
    categoria: resultado.categoria,
    // Sin texto, se dice. Inventar la pregunta para que la pantalla quede
    // completa sería exactamente lo que la regla de «ninguna cifra inventada»
    // prohíbe, aplicado al texto.
    pregunta: preguntas.get(resultado.caso_id) ?? '(el lote no registró el texto de este caso)',
    resultado: resultado.resultado,
    destino_ejecucion: resultado.destino_ejecucion,
    desvio_ejecucion: resultado.desvio_ejecucion,
    clase_sensibilidad: resultado.clase_sensibilidad,
    hubo_egreso: resultado.hubo_egreso,
    fuentes: resultado.fuentes,
    sustento: resultado.sustento,
    latencia_ms: resultado.latencia_ms,
    costo: resultado.costo,
    costo_provisional: resultado.costo_provisional,
    vigias_que_actuaron: resultado.vigias_que_actuaron,
    incidentes: resultado.incidentes,
    acerto: resultado.acerto,
    por_que_no: resultado.por_que_no,
  };
}

/**
 * Convierte lo que grabó el corredor en lo que sirve la demo.
 *
 * Los modos que no se corrieron **se conservan** con su motivo. Quitarlos daría
 * una pantalla donde solo se ve lo que salió bien, y la comparación local/nube
 * —que es el argumento entero del proyecto— parecería completa cuando le falta
 * la mitad.
 */
export function derivarDemo(
  resultados: ResultadosDelLote,
  definicion: DefinicionDelLote,
  generado_en: string,
): Reproduccion {
  if (resultados.lote.trim() === '') {
    throw new ErrorDeReproduccion(
      'Los resultados no dicen de qué lote son. El identificador del lote tiene que ' +
        'estar visible en la demo: una reproducción sin decir qué reproduce no se ' +
        'puede comprobar contra nada.',
    );
  }

  const preguntas = new Map(definicion.casos.map((c) => [c.id, c.texto]));

  const modos = resultados.ejecuciones.map((e) => resumir(e));
  const casos = resultados.ejecuciones
    .filter((e) => e.corrido)
    .flatMap((e) => e.resultados.map((r) => caso(r, preguntas)));

  return {
    es_reproduccion: true,
    lote: resultados.lote,
    generado_en,
    aviso: AVISO,
    modos,
    casos,
  };
}
