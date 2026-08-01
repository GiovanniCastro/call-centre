// El detector de envenenamiento, enchufado al gancho que dejó la fase 2.
//
// La fase 2 dejó `ValidacionPrevia` declarada y sin implementar, con una prueba
// que comprobaba que el punto de extensión existía de verdad. Esto es lo que se
// enchufa ahí: la ingestión no cambia ni una línea.
//
// **Se valida el documento ENTERO, no fragmento a fragmento.** Un texto hostil
// partido por el troceado puede dejar cada mitad por debajo de cualquier patrón
// y seguir funcionando una vez el modelo lo lee junto. El troceado es una
// decisión de recuperación, no de seguridad, y hacer depender la seguridad de él
// sería atarla a un parámetro que alguien puede cambiar por otras razones.

import type { ValidacionPrevia } from './ingestar.ts';
import { detectarEnvenenamiento } from '../core/seguridad/detectores.ts';
import type { RespuestaGraduada } from '../core/seguridad/graduada.ts';

export type OpcionesValidacion = {
  /** Dónde se anotan los incidentes. Sin él, un documento rechazado no deja rastro. */
  readonly graduada?: RespuestaGraduada;
  /**
   * Rutas que se admiten aun con hallazgos.
   *
   * Existe por un caso concreto: `corpus/14-documento-con-instruccion-incrustada.md`
   * es el documento de prueba del corpus, y está ahí para que ESTE detector lo
   * rechace. Si algún día hiciera falta indexarlo a propósito, se pone aquí — con
   * su nombre completo, para que sea un acto visible en el diff y no una regla
   * amplia que deje pasar otros.
   */
  readonly admitidos?: readonly string[];
};

export function detectorDeEnvenenamiento(opciones: OpcionesValidacion = {}): ValidacionPrevia {
  const admitidos = new Set(opciones.admitidos ?? []);

  return async (documento) => {
    if (admitidos.has(documento.procedencia.ruta)) return { admitido: true };

    const deteccion = detectarEnvenenamiento(documento.texto);
    if (!deteccion.hay) return { admitido: true };

    // Uno por hallazgo, no uno por documento: un documento con tres inyecciones
    // distintas son tres cosas que alguien escribió, y contarlas como una
    // escondería el alcance del intento.
    for (const hallazgo of deteccion.hallazgos) {
      opciones.graduada?.registrar(
        'envenenamiento',
        // Un documento no tiene contacto: no lo escribió un cliente en una
        // conversación. Atribuirlo a uno pondría en cuarentena a quien no fue.
        null,
        hallazgo.fragmento,
        hallazgo.patron,
      );
    }

    const patrones = [...new Set(deteccion.hallazgos.map((h) => h.patron))];
    return {
      admitido: false,
      motivo:
        `contiene ${deteccion.hallazgos.length} patrón(es) de instrucción incrustada ` +
        `(${patrones.join(', ')}). No se indexa: un documento hostil en el índice ` +
        'afecta a TODAS las conversaciones, no a una.',
    };
  };
}
