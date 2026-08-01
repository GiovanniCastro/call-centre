// Los esquemas de salida, por clase de tarea.
//
// **Esta es la decisión más importante del proyecto**, y está tomada en R-003
// para que no se decidiera en caliente. El plan original pedía un verificador que
// «comprueba que cada afirmación esté respaldada por un fragmento». Eso es
// inferencia de lenguaje natural, y las dos implementaciones obvias rompen el
// preámbulo: un modelo verificador viola la regla 7 —jamás un modelo juzgando a
// otro— y el solapamiento léxico produce una puntuación que no significa nada.
//
// La vía que resuelve la tensión: **el modelo no escribe prosa que luego se
// audita. Emite una estructura donde cada dato lleva su `fragmento_id`.** El
// verificador comprueba tres cosas, todas deterministas, y la redacción final se
// compone en código a partir de la estructura ya verificada.
//
// El efecto secundario importante: la puntuación de sustento deja de ser una
// estimación y pasa a ser una proporción contable — campos con procedencia válida
// sobre campos factuales totales. Se puede sumar, promediar y defender.

import { z } from 'zod';

import type { ClaseTarea } from '../../telemetry/evento.ts';

/**
 * Un dato afirmado por el modelo, con de dónde lo sacó.
 *
 * `valor` es lo que se afirma y `fragmento_id` de dónde. El verificador exige que
 * `valor` aparezca **literalmente** en ese fragmento, así que el modelo no puede
 * parafrasear una cifra: o la copia, o no la afirma. Es incómodo a propósito.
 */
export const EsquemaCampoConProcedencia = z.object({
  valor: z.string().min(1),
  fragmento_id: z.string().min(1),
});

export type CampoConProcedencia = z.infer<typeof EsquemaCampoConProcedencia>;

/**
 * La forma común a todas las clases.
 *
 * `datos` son las afirmaciones verificables; `redaccion_sugerida` es prosa que el
 * modelo propone y que **no se envía tal cual**: la respuesta final se compone en
 * código. Está aquí porque conocer cómo querría decirlo el modelo ayuda a componer
 * mejor, no porque vaya a usarse literalmente.
 */
const Comun = {
  datos: z.array(EsquemaCampoConProcedencia),
  redaccion_sugerida: z.string(),
  /** El modelo declara que no puede responder con lo que tiene. Es una salida legítima. */
  no_puedo_responder: z.boolean().default(false),
};

export const EsquemaSalidaCatalogo = z.object({
  ...Comun,
  clase: z.literal('catalogo'),
});

export const EsquemaSalidaExtraccion = z.object({
  ...Comun,
  clase: z.literal('extraccion'),
  /** Lo que el cliente aportó. No lleva procedencia: lo dijo él, no el corpus. */
  campos_recogidos: z.record(z.string(), z.string()).default({}),
});

export const EsquemaSalidaAgendamiento = z.object({
  ...Comun,
  clase: z.literal('agendamiento'),
  /**
   * Ninguna acción se ejecuta desde aquí. La fase 5 decide, y el destinatario lo
   * fija el sistema, nunca el texto. Esto es solo la intención declarada.
   */
  accion_propuesta: z.string().nullable().default(null),
});

export const EsquemaSalidaSaludo = z.object({
  ...Comun,
  clase: z.literal('saludo'),
});

export const EsquemaSalidaQueja = z.object({
  ...Comun,
  clase: z.literal('queja'),
  /** Una queja casi siempre acaba en un humano; el modelo puede pedirlo. */
  pide_humano: z.boolean().default(false),
});

export const EsquemaSalidaAmbiguo = z.object({
  ...Comun,
  clase: z.literal('ambiguo'),
  /** Qué habría que preguntar para desambiguar. */
  pregunta_de_aclaracion: z.string().nullable().default(null),
});

export const ESQUEMAS_POR_CLASE = {
  catalogo: EsquemaSalidaCatalogo,
  extraccion: EsquemaSalidaExtraccion,
  agendamiento: EsquemaSalidaAgendamiento,
  saludo: EsquemaSalidaSaludo,
  queja: EsquemaSalidaQueja,
  ambiguo: EsquemaSalidaAmbiguo,
} as const satisfies Record<ClaseTarea, z.ZodType>;

export type SalidaEstructurada =
  | z.infer<typeof EsquemaSalidaCatalogo>
  | z.infer<typeof EsquemaSalidaExtraccion>
  | z.infer<typeof EsquemaSalidaAgendamiento>
  | z.infer<typeof EsquemaSalidaSaludo>
  | z.infer<typeof EsquemaSalidaQueja>
  | z.infer<typeof EsquemaSalidaAmbiguo>;

export type ResultadoValidacion =
  | { readonly valida: true; readonly salida: SalidaEstructurada }
  | { readonly valida: false; readonly motivo: string };

/**
 * Valida lo que devolvió el modelo contra el esquema de su clase.
 *
 * No lanza: un fallo de validación es un caso esperado —los modelos devuelven
 * cosas raras— y tratarlo como excepción llena los registros de ruido donde
 * debería haber un contador. Lo que **no** puede pasar es que llegue al usuario,
 * y de eso se encarga quien llama: sin `valida: true` no hay respuesta.
 */
export function validarSalida(clase: ClaseTarea, crudo: unknown): ResultadoValidacion {
  const esquema = ESQUEMAS_POR_CLASE[clase];
  const resultado = esquema.safeParse(crudo);

  if (!resultado.success) {
    return { valida: false, motivo: z.prettifyError(resultado.error) };
  }

  return { valida: true, salida: resultado.data as SalidaEstructurada };
}

/** El esquema en JSON, para pedírselo al proveedor como salida estructurada. */
export function esquemaJson(clase: ClaseTarea): Record<string, unknown> {
  return z.toJSONSchema(ESQUEMAS_POR_CLASE[clase], { io: 'input' }) as Record<string, unknown>;
}
