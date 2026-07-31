// El contrato de datos de la telemetría.
//
// El enum `resultado` está **desdoblado** (decisión R-002). El sistema tiene dos
// escalados que no son el mismo hecho: el desvío controlado de local a nube,
// cuando el modelo local no alcanza; y la cola de escalado a un operador humano.
// El plan original los metía en un solo valor. Contar sobre ese campo produce
// dos cifras distintas para lo mismo — y no es teórico: ya pasó en la maqueta
// del panel, que muestra 41 escalados a humano en el KPI y 17 en el reparto del
// enrutador sobre los mismos 190 casos.
//
// De ahí también los derivadores del final de este archivo. El criterio de
// reconciliación de la fase 6 —«dos métricas que cuenten lo mismo se derivan del
// mismo campo»— se cumple porque el KPI y el reparto llaman a la misma función,
// no porque dos personas hayan escrito el mismo `filter` dos veces.

import { z } from 'zod';

export const CANALES = ['whatsapp', 'telegram', 'voz', 'lote'] as const;

/** Qué le pasó al caso. Un caso tiene exactamente uno de estos desenlaces. */
export const RESULTADOS = ['resuelto', 'escalado_humano', 'descartado', 'bloqueado'] as const;

/** Dónde acabó ejecutándose. Ortogonal a `resultado`. */
export const DESTINOS_EJECUCION = ['local', 'nube'] as const;

/** Si la ejecución cambió de plano a media marcha. Nunca es un `resultado`. */
export const DESVIOS_EJECUCION = ['ninguno', 'local_a_nube', 'nube_a_local'] as const;

export const CLASES_TAREA = [
  'saludo',
  'catalogo',
  'extraccion',
  'agendamiento',
  'queja',
  'ambiguo',
] as const;

export const CLASES_SENSIBILIDAD = ['baja', 'media', 'alta'] as const;

/**
 * Las clases de tarea cuya respuesta afirma hechos sobre el negocio. Para estas
 * rige el invariante 1: sin fuente recuperada, no hay respuesta resuelta.
 * Un saludo no necesita fuente; un precio sí.
 */
export const CLASES_TAREA_FACTUALES = ['catalogo', 'extraccion', 'agendamiento'] as const;

export type Canal = (typeof CANALES)[number];
export type Resultado = (typeof RESULTADOS)[number];
export type DestinoEjecucion = (typeof DESTINOS_EJECUCION)[number];
export type DesvioEjecucion = (typeof DESVIOS_EJECUCION)[number];
export type ClaseTarea = (typeof CLASES_TAREA)[number];
export type ClaseSensibilidad = (typeof CLASES_SENSIBILIDAD)[number];

const CamposDelEvento = z.object({
  version_esquema: z.literal(1),
  evento_id: z.uuid(),
  caso_id: z.string().min(1),
  marca_tiempo: z.iso.datetime(),
  canal: z.enum(CANALES),

  clase_tarea: z.enum(CLASES_TAREA),
  clase_sensibilidad: z.enum(CLASES_SENSIBILIDAD),

  destino_ejecucion: z.enum(DESTINOS_EJECUCION),
  desvio_ejecucion: z.enum(DESVIOS_EJECUCION),
  motivo_desvio: z.string().min(1).nullable(),

  resultado: z.enum(RESULTADOS),
  /** Obligatorio cuando el caso sale a un humano: la cola necesita saber por qué. */
  motivo_escalado: z.string().min(1).nullable(),
  /** Por qué el enrutador decidió lo que decidió. Legible por una persona. */
  motivo_decision: z.string().min(1),

  /**
   * Salida de datos del perímetro. `hubo_egreso` y `destinos_egreso` se validan
   * el uno contra el otro: no se puede declarar egreso sin decir a dónde, ni
   * negarlo mientras se listan destinos. Invariante 3, «se registra qué salió y
   * hacia dónde», hecho estructura.
   */
  hubo_egreso: z.boolean(),
  destinos_egreso: z.array(z.string().min(1)),

  /** Identificadores de los fragmentos recuperados y citados en esta ejecución. */
  fuentes: z.array(z.string().min(1)),
  /**
   * Sustento como proporción contable, no como estimación: campos con
   * procedencia verificada sobre campos factuales totales. Se llena en la fase 4.
   */
  sustento: z
    .object({
      campos_totales: z.number().int().nonnegative(),
      campos_con_procedencia: z.number().int().nonnegative(),
    })
    .nullable(),

  latencia_ms: z.number().nonnegative(),
  tokens_entrada: z.number().int().nonnegative(),
  tokens_salida: z.number().int().nonnegative(),
  modelo: z.string().min(1).nullable(),

  costo: z.number().nonnegative(),
  /** El costo se apoya en supuestos sin confirmar. El panel está obligado a decirlo. */
  costo_provisional: z.boolean(),
  /** Fecha de la tabla de precios usada, para poder recalcular después. */
  precios_actualizados: z.string().min(1),
});

export const EsquemaEvento = CamposDelEvento.check((ctx) => {
  const e = ctx.value;

  if (e.desvio_ejecucion === 'ninguno' && e.motivo_desvio !== null) {
    ctx.issues.push({
      code: 'custom',
      input: e.motivo_desvio,
      path: ['motivo_desvio'],
      message: 'Sin desvío no hay motivo de desvío. Un motivo huérfano falsea el reparto.',
    });
  }

  if (e.desvio_ejecucion !== 'ninguno' && e.motivo_desvio === null) {
    ctx.issues.push({
      code: 'custom',
      input: e.motivo_desvio,
      path: ['motivo_desvio'],
      message:
        'Todo desvío de ejecución lleva su motivo. Un desvío sin causa registrada no se ' +
        'puede diagnosticar después.',
    });
  }

  if (e.resultado === 'escalado_humano' && e.motivo_escalado === null) {
    ctx.issues.push({
      code: 'custom',
      input: e.motivo_escalado,
      path: ['motivo_escalado'],
      message: 'Un caso escalado a un humano llega a la cola con su motivo.',
    });
  }

  if (e.hubo_egreso !== e.destinos_egreso.length > 0) {
    ctx.issues.push({
      code: 'custom',
      input: e.destinos_egreso,
      path: ['destinos_egreso'],
      message:
        'Invariante 3: `hubo_egreso` y `destinos_egreso` tienen que concordar. Se registra ' +
        'qué salió y hacia dónde, o no salió nada.',
    });
  }

  const esFactual = (CLASES_TAREA_FACTUALES as readonly string[]).includes(e.clase_tarea);
  if (esFactual && e.resultado === 'resuelto' && e.fuentes.length === 0) {
    ctx.issues.push({
      code: 'custom',
      input: e.fuentes,
      path: ['fuentes'],
      message:
        `Invariante 1: una tarea de clase «${e.clase_tarea}» no puede resolverse sin fuentes. ` +
        'Sin fragmento recuperado, el agente escala; no completa con conocimiento del modelo.',
    });
  }

  if (e.sustento !== null && e.sustento.campos_con_procedencia > e.sustento.campos_totales) {
    ctx.issues.push({
      code: 'custom',
      input: e.sustento,
      path: ['sustento'],
      message: 'El sustento es una proporción: el numerador no puede exceder al denominador.',
    });
  }
});

export type Evento = z.infer<typeof EsquemaEvento>;

// ── Derivadores ───────────────────────────────────────────────────────────────
// Toda métrica que cuente estos hechos pasa por aquí. Si el panel quiere saber
// cuántos casos se escalaron a un humano, llama a `esEscaladoAHumano`; no
// escribe su propio filtro. Es lo que hace verificable el criterio de
// reconciliación de la fase 6.

/** El caso salió a la cola de un operador. */
export function esEscaladoAHumano(e: Evento): boolean {
  return e.resultado === 'escalado_humano';
}

/** El caso cambió de plano de ejecución. No es un escalado. */
export function esDesvioDeEjecucion(e: Evento): boolean {
  return e.desvio_ejecucion !== 'ninguno';
}

/** El caso se resolvió sin intervención humana. */
export function seResolvioSinIntervencion(e: Evento): boolean {
  return e.resultado === 'resuelto';
}

/**
 * El caso estaba clasificado como sensibilidad alta **y aun así salió del
 * perímetro**. El esquema permite representarlo a propósito: si fuera
 * inexpresable, el vigía de perímetro de la fase 4B‑1 tendría un contador que
 * jamás podría subir, y «0 fugas» sobre un contador que no puede contar no
 * prueba nada.
 */
export function esViolacionDePerimetro(e: Evento): boolean {
  return e.clase_sensibilidad === 'alta' && e.hubo_egreso;
}

/** Denominador del vigía de perímetro: casos que estuvieron en riesgo de fuga. */
export function esSensibilidadAlta(e: Evento): boolean {
  return e.clase_sensibilidad === 'alta';
}

/** Proporción de campos con procedencia verificada. `null` si no aplica. */
export function proporcionDeSustento(e: Evento): number | null {
  if (e.sustento === null || e.sustento.campos_totales === 0) return null;
  return e.sustento.campos_con_procedencia / e.sustento.campos_totales;
}
