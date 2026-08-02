// La persistencia de los eventos de telemetría.
//
// Hasta la fase 6 los eventos solo vivían en memoria: se emitían, el arnés
// comprobaba que fueran exactamente uno, y se perdían al terminar el proceso.
// Suficiente para probar el invariante 5, insuficiente para el panel — cuyo
// criterio de aceptación dice que **toda cifra se rastrea hasta eventos reales
// en PostgreSQL**.
//
// Escribir aquí está acotado por contacto, como todo en esta carpeta. Leer para
// agregar NO puede estarlo, y por eso vive en `agregados.ts` con su propia
// regla: allí ninguna consulta puede seleccionar una columna que identifique a
// nadie. La separación en dos archivos es deliberada — un solo módulo con las
// dos capacidades acabaría teniendo una función que lee sin filtro «solo para
// este caso».

import { exigirAlcance, type AlcanceContacto } from './alcance.ts';
import type { Consultador } from './cliente.ts';
import type { Evento } from '../telemetry/evento.ts';

/**
 * Guarda un evento.
 *
 * Idempotente por `evento_id`: el arnés garantiza un evento por caso, pero un
 * reintento de escritura tras un corte de red no puede convertirse en dos filas
 * y duplicar cada cifra del panel. `ON CONFLICT DO NOTHING` lo resuelve en la
 * base, que es donde la carrera ocurre de verdad.
 */
export async function guardarEvento(
  alcance: AlcanceContacto,
  bd: Consultador,
  evento: Evento,
  contacto_id: string | null = null,
  conversacion_id: string | null = null,
): Promise<{ guardado: boolean }> {
  exigirAlcance(alcance);

  const filas = await bd.consultar<{ evento_id: string }>(
    `INSERT INTO eventos (
       evento_id, version_esquema, caso_id, conversacion_id, contacto_id,
       marca_tiempo, canal, clase_tarea, clase_sensibilidad,
       destino_ejecucion, desvio_ejecucion, motivo_desvio,
       resultado, motivo_escalado, motivo_decision,
       hubo_egreso, destinos_egreso, fuentes,
       sustento_totales, sustento_con_proc,
       latencia_ms, tokens_entrada, tokens_salida, modelo,
       costo, costo_provisional, precios_actualizados
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
       $21,$22,$23,$24,$25,$26,$27
     )
     ON CONFLICT (evento_id) DO NOTHING
     RETURNING evento_id`,
    [
      evento.evento_id,
      evento.version_esquema,
      evento.caso_id,
      conversacion_id,
      // El alcance manda sobre el argumento: si alguien pasara el contacto de
      // otro, la fila quedaría atribuida a quien no la generó y el panel
      // contaría el caso en el cliente equivocado.
      contacto_id ?? alcance.contacto_id,
      evento.marca_tiempo,
      evento.canal,
      evento.clase_tarea,
      evento.clase_sensibilidad,
      evento.destino_ejecucion,
      evento.desvio_ejecucion,
      evento.motivo_desvio,
      evento.resultado,
      evento.motivo_escalado,
      evento.motivo_decision,
      evento.hubo_egreso,
      evento.destinos_egreso,
      evento.fuentes,
      evento.sustento?.campos_totales ?? null,
      evento.sustento?.campos_con_procedencia ?? null,
      evento.latencia_ms,
      evento.tokens_entrada,
      evento.tokens_salida,
      evento.modelo,
      evento.costo,
      evento.costo_provisional,
      evento.precios_actualizados,
    ],
  );

  return { guardado: filas.length > 0 };
}

/**
 * Los eventos de UN contacto, para la vista de traza del panel.
 *
 * Acotado, y no por prudencia: la traza trae el motivo de decisión y las fuentes
 * citadas, que es información de la conversación de alguien. El panel la enseña
 * solo al rol que puede ver contenido, y esta función es la que impide que el
 * otro rol pueda pedirla aunque el panel se equivoque.
 */
export async function eventosDelContacto(
  alcance: AlcanceContacto,
  bd: Consultador,
  limite = 100,
): Promise<readonly Record<string, unknown>[]> {
  exigirAlcance(alcance);

  return bd.consultar<Record<string, unknown>>(
    `SELECT * FROM eventos
      WHERE contacto_id = $1
      ORDER BY marca_tiempo DESC
      LIMIT $2`,
    [alcance.contacto_id, limite],
  );
}
