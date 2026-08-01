// La respuesta final se compone **en código**, a partir de la estructura ya
// verificada. El modelo redacta; el código decide qué se envía.
//
// Aquí es donde el umbral de sustento se convierte en tres desenlaces distintos,
// y donde el invariante 1 acaba de cerrarse: lo que la fase 2 no podía distinguir
// —«trata de esto» frente a «contiene el dato que se pide»— lo distingue esta
// comprobación, porque un campo sin procedencia válida no llega al texto.

import { z } from 'zod';

import crudo from '../../../config/respuesta.json' with { type: 'json' };
import type { SalidaEstructurada } from './esquemas.ts';
import { proporcionDeSustento, type Veredicto } from './verificar.ts';

const EsquemaConfig = z.object({
  version: z.literal(1),
  umbrales: z.object({
    envia: z.number().min(0).max(1),
    matiza: z.number().min(0).max(1),
  }),
  reintento: z.object({ activo: z.boolean(), maximo: z.number().int().min(0).max(1) }),
  matiz: z.string().min(1),
});

function validar(valor: unknown): z.infer<typeof EsquemaConfig> {
  const resultado = EsquemaConfig.safeParse(valor);
  if (!resultado.success) {
    throw new Error(`config/respuesta.json no valida: ${z.prettifyError(resultado.error)}`);
  }
  if (resultado.data.umbrales.matiza > resultado.data.umbrales.envia) {
    throw new Error(
      'El umbral de matiz no puede ser mayor que el de envío: dejaría una zona en la que ' +
        'una respuesta se matiza y se bloquea a la vez, y cuál gana dependería del orden ' +
        'en que se escribieron los `if`.',
    );
  }
  return resultado.data;
}

export const RESPUESTA = validar(crudo);
export type ConfigRespuesta = z.infer<typeof EsquemaConfig>;

export type Decision =
  | { readonly accion: 'enviar'; readonly texto: string; readonly sustento: number }
  | { readonly accion: 'enviar_con_matiz'; readonly texto: string; readonly sustento: number }
  | {
      readonly accion: 'escalar';
      readonly motivo: string;
      readonly sustento: number;
      /** Qué campos fallaron. Es lo que el operador necesita para juzgar. */
      readonly rechazados: readonly string[];
    };

/**
 * Compone el texto a partir de los campos **verificados**.
 *
 * `redaccion_sugerida` del modelo se usa solo si todos sus campos sobrevivieron:
 * en cuanto uno cae, esa prosa afirma algo sin sustento y no se puede aprovechar
 * ni recortando. Cuando no se puede usar, se compone con los valores válidos.
 */
function texto(salida: SalidaEstructurada, veredicto: Veredicto): string {
  const todosValidos = veredicto.campos.every((c) => c.valido);

  if (todosValidos && salida.redaccion_sugerida.trim() !== '') {
    return salida.redaccion_sugerida.trim();
  }

  const validos = veredicto.campos.filter((c) => c.valido).map((c) => c.campo.valor);
  return validos.join(' ');
}

/**
 * Un mensaje que **no afirma nada del corpus**, o `null` si no lo hay.
 *
 * Lo encontró el lote de la fase 7 (R-025): con cero campos factuales el sustento
 * vale 1 por vacuidad, y con esa nota perfecta se enviaba `redaccion_sugerida` tal
 * cual. Es decir: la prosa cruda del modelo, sin auditar, que es exactamente lo
 * que el esquema estructurado existe para no enviar. Cuatro casos fuera de alcance
 * —«¿cuál es la capital de Francia?»— salieron como resueltos porque el modelo
 * escribió una negativa cortés y nadie tenía nada que verificar en ella.
 *
 * La vacuidad solo es legítima cuando lo que se envía no es una respuesta:
 *
 *   - un **saludo**, que no habla del corpus;
 *   - una **pregunta de aclaración**, que pregunta en vez de afirmar.
 *
 * En los dos casos el texto sale de un campo declarado del esquema, no de la
 * prosa suelta. En cualquier otro, cero campos significa que no hay nada
 * verificado que componer, y sin fuente no hay respuesta.
 */
function mensajeSinAfirmacion(salida: SalidaEstructurada): string | null {
  if (salida.clase === 'saludo') {
    const prosa = salida.redaccion_sugerida.trim();
    return prosa === '' ? null : prosa;
  }

  if (salida.clase === 'ambiguo') {
    const pregunta = salida.pregunta_de_aclaracion?.trim() ?? '';
    return pregunta === '' ? null : pregunta;
  }

  return null;
}

export function decidir(
  salida: SalidaEstructurada,
  veredicto: Veredicto,
  config: ConfigRespuesta = RESPUESTA,
): Decision {
  const sustento = proporcionDeSustento(veredicto);
  const rechazados = veredicto.campos
    .filter((c) => !c.valido)
    .map((c) => `${c.campo.fragmento_id}: ${c.explicacion ?? 'sin explicación'}`);

  // El modelo declarando que no puede responder es una salida legítima y gana a
  // cualquier umbral: no hay nada que matizar en una respuesta que no existe.
  if (salida.no_puedo_responder) {
    return {
      accion: 'escalar',
      motivo: 'el modelo declaró que no puede responder con las fuentes recuperadas',
      sustento,
      rechazados,
    };
  }

  // Cero campos factuales se resuelve ANTES de la escalera de umbrales, porque en
  // la escalera la vacuidad puntúa 1 y pasa por la puerta ancha.
  if (veredicto.sustento.campos_totales === 0) {
    const sinAfirmacion = mensajeSinAfirmacion(salida);
    if (sinAfirmacion === null) {
      return {
        accion: 'escalar',
        motivo:
          `salida de clase «${salida.clase}» sin ningún campo factual: no hay nada ` +
          'verificado que componer, y enviar la prosa del modelo sería responder sin fuente',
        sustento,
        rechazados,
      };
    }
    return { accion: 'enviar', texto: sinAfirmacion, sustento };
  }

  if (sustento >= config.umbrales.envia) {
    return { accion: 'enviar', texto: texto(salida, veredicto), sustento };
  }

  if (sustento >= config.umbrales.matiza) {
    return {
      accion: 'enviar_con_matiz',
      texto: `${texto(salida, veredicto)}\n\n${config.matiz}`,
      sustento,
    };
  }

  return {
    accion: 'escalar',
    motivo:
      `sustento ${(sustento * 100).toFixed(0)} % por debajo del umbral de matiz ` +
      `(${(config.umbrales.matiza * 100).toFixed(0)} %)`,
    sustento,
    rechazados,
  };
}
