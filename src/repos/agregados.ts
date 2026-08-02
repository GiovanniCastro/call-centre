// Las consultas agregadas del panel.
//
// Este es el único archivo de `src/repos/` cuyas funciones NO reciben
// `AlcanceContacto`, y hace falta explicar por qué sin que la explicación sea
// «confiad en nosotros».
//
// Un agregado del panel —cuántos casos se resolvieron, cuánto costó cada uno,
// cuántos casos de sensibilidad alta se retuvieron— cruza contactos por
// definición. Filtrarlo por uno daría la cifra de una persona presentada como la
// del sistema, que es peor que no darla.
//
// La contención no es entonces el alcance, es **la forma de lo que se devuelve**:
//
//   > Ninguna consulta de este archivo puede seleccionar una columna que
//   > identifique a alguien —`contacto_id`, `conversacion_id`, `caso_id`— ni
//   > devolver texto libre de una conversación.
//
// Con esa regla, una consulta sin filtro no puede filtrar datos de nadie: no hay
// por dónde salgan. Y la regla es una prueba estructural que recorre el árbol
// sintáctico, no un comentario — `tests/repos-alcance.test.ts`.
//
// La traza por caso, que sí trae contenido, vive en `eventos.ts` y sí está
// acotada. Son dos capacidades distintas y por eso son dos archivos distintos.

import type { Consultador } from './cliente.ts';
import type { ClaseSensibilidad, DestinoEjecucion, Resultado } from '../telemetry/evento.ts';

/** Una ventana de tiempo. Sin ella, «el costo» no significa nada. */
export type Ventana = {
  readonly desde: string;
  readonly hasta: string;
};

export type RecuentoPorResultado = {
  readonly resultado: Resultado;
  readonly casos: number;
};

/**
 * Casos por desenlace.
 *
 * **Es la fuente única de todo lo que cuente desenlaces.** El criterio de
 * aceptación de la fase 6 exige que dos métricas que cuenten lo mismo se deriven
 * del mismo campo; la forma de garantizarlo no es revisar las dos, es que solo
 * exista una.
 */
export async function porResultado(
  bd: Consultador,
  ventana: Ventana,
): Promise<readonly RecuentoPorResultado[]> {
  return bd.consultar<RecuentoPorResultado>(
    `SELECT resultado, COUNT(*)::int AS casos
       FROM eventos
      WHERE marca_tiempo >= $1 AND marca_tiempo < $2
      GROUP BY resultado
      ORDER BY resultado`,
    [ventana.desde, ventana.hasta],
  );
}

export type RecuentoPorDestino = {
  readonly destino_ejecucion: DestinoEjecucion;
  readonly casos: number;
  readonly costo: string;
  readonly costo_provisional: boolean;
  readonly latencia_media_ms: string;
  readonly tokens_entrada: number;
  readonly tokens_salida: number;
};

/**
 * El reparto local/nube con su costo.
 *
 * `costo_provisional` viaja con la cifra y no aparte. Separarlos permitiría
 * enseñar el número sin la marca, que es exactamente lo que pasó en la primera
 * corrida del lote de la fase 7 — ver R-031.
 */
export async function porDestino(
  bd: Consultador,
  ventana: Ventana,
): Promise<readonly RecuentoPorDestino[]> {
  return bd.consultar<RecuentoPorDestino>(
    `SELECT destino_ejecucion,
            COUNT(*)::int                    AS casos,
            SUM(costo)::text                 AS costo,
            bool_or(costo_provisional)       AS costo_provisional,
            AVG(latencia_ms)::text           AS latencia_media_ms,
            SUM(tokens_entrada)::int         AS tokens_entrada,
            SUM(tokens_salida)::int          AS tokens_salida
       FROM eventos
      WHERE marca_tiempo >= $1 AND marca_tiempo < $2
      GROUP BY destino_ejecucion
      ORDER BY destino_ejecucion`,
    [ventana.desde, ventana.hasta],
  );
}

export type RecuentoDeEgreso = {
  readonly clase_sensibilidad: ClaseSensibilidad;
  /** El DENOMINADOR: casos de esta clase. */
  readonly casos: number;
  /** El numerador: de esos, cuántos produjeron salida externa. */
  readonly con_egreso: number;
};

/**
 * Egreso por clase de sensibilidad, con numerador **y** denominador.
 *
 * Los dos, siempre. «0 casos de egreso en sensibilidad alta» puede querer decir
 * «los retuvimos todos» o «no llegó ninguno», y son cosas muy distintas — el
 * mismo defecto que el vigía de perímetro resuelve en la 4B-1 y que el informe
 * de la 7 tuvo que volver a resolver un piso más arriba (R-032). El panel no
 * puede enseñar una fracción sin su parte de abajo.
 */
export async function egresoPorSensibilidad(
  bd: Consultador,
  ventana: Ventana,
): Promise<readonly RecuentoDeEgreso[]> {
  return bd.consultar<RecuentoDeEgreso>(
    `SELECT clase_sensibilidad,
            COUNT(*)::int                                       AS casos,
            COUNT(*) FILTER (WHERE hubo_egreso)::int            AS con_egreso
       FROM eventos
      WHERE marca_tiempo >= $1 AND marca_tiempo < $2
      GROUP BY clase_sensibilidad
      ORDER BY clase_sensibilidad`,
    [ventana.desde, ventana.hasta],
  );
}

export type RecuentoDeEscalado = {
  readonly motivo_escalado: string;
  readonly casos: number;
};

/**
 * Escalados por motivo.
 *
 * El motivo es texto que escribe el perímetro, no el cliente: sale de la lista
 * cerrada de clases de escalado y de los umbrales de los vigías. Aun así pasa
 * por el saneo en el publicador, porque «lo escribe el sistema» es una propiedad
 * que se cumple hasta el día que alguien interpole algo en un mensaje.
 */
export async function porMotivoDeEscalado(
  bd: Consultador,
  ventana: Ventana,
): Promise<readonly RecuentoDeEscalado[]> {
  return bd.consultar<RecuentoDeEscalado>(
    `SELECT COALESCE(motivo_escalado, 'sin motivo') AS motivo_escalado,
            COUNT(*)::int                          AS casos
       FROM eventos
      WHERE marca_tiempo >= $1 AND marca_tiempo < $2
        AND resultado = 'escalado_humano'
      GROUP BY 1
      ORDER BY casos DESC`,
    [ventana.desde, ventana.hasta],
  );
}

export type RecuentoDeSustento = {
  readonly campos_totales: number;
  readonly campos_con_procedencia: number;
  readonly casos_con_sustento: number;
};

/** El sustento agregado: una proporción contable, no un promedio de promedios. */
export async function sustentoAgregado(
  bd: Consultador,
  ventana: Ventana,
): Promise<RecuentoDeSustento> {
  const filas = await bd.consultar<RecuentoDeSustento>(
    `SELECT COALESCE(SUM(sustento_totales), 0)::int  AS campos_totales,
            COALESCE(SUM(sustento_con_proc), 0)::int AS campos_con_procedencia,
            COUNT(*) FILTER (WHERE sustento_totales IS NOT NULL)::int AS casos_con_sustento
       FROM eventos
      WHERE marca_tiempo >= $1 AND marca_tiempo < $2`,
    [ventana.desde, ventana.hasta],
  );

  return filas[0] ?? { campos_totales: 0, campos_con_procedencia: 0, casos_con_sustento: 0 };
}

export type LatenciaDePrimeraRespuesta = {
  readonly casos: number;
  readonly mediana_ms: string | null;
  readonly p95_ms: string | null;
};

/** Tiempo de primera respuesta. Mediana y p95, nunca la media a secas. */
export async function latencias(
  bd: Consultador,
  ventana: Ventana,
): Promise<LatenciaDePrimeraRespuesta> {
  const filas = await bd.consultar<LatenciaDePrimeraRespuesta>(
    `SELECT COUNT(*)::int AS casos,
            (percentile_cont(0.5)  WITHIN GROUP (ORDER BY latencia_ms))::text AS mediana_ms,
            (percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia_ms))::text AS p95_ms
       FROM eventos
      WHERE marca_tiempo >= $1 AND marca_tiempo < $2`,
    [ventana.desde, ventana.hasta],
  );

  return filas[0] ?? { casos: 0, mediana_ms: null, p95_ms: null };
}
