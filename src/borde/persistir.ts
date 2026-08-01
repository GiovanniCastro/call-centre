// De grupo despachado a conversación persistida.
//
// Es lo que hace verdadero el criterio «reiniciar el proceso no pierde la
// conversación en curso»: hasta aquí el mensaje solo vivía en Redis, que es
// memoria de corto plazo del borde, no el hilo de la conversación.
//
// Todo el trabajo va en **una transacción por grupo**. Si se guardara mensaje a
// mensaje, un fallo a mitad dejaría media conversación escrita, y el agente
// respondería a un cliente que dijo tres cosas habiendo leído solo dos.

import { alcanceParaContacto, conversacionAbierta, guardarMensajeEntrante } from '../repos/conversaciones.ts';
import type { Consultador } from '../repos/cliente.ts';
import type { Grupo } from './almacen.ts';

export type ResultadoPersistencia = {
  readonly conversacion_id: string;
  readonly guardados: number;
  /** Los que ya estaban: el índice único los rechazó. */
  readonly repetidos: number;
};

/**
 * Guarda un grupo como parte de la conversación de su contacto.
 *
 * @throws Si el grupo está vacío. Un grupo sin mensajes no debería llegar hasta
 *   aquí —el despachador lo descarta— y si llega significa que algo se perdió por
 *   el camino, que es peor que un error.
 */
export async function persistirGrupo(
  bd: Consultador,
  grupo: Grupo,
): Promise<ResultadoPersistencia> {
  const primero = grupo.mensajes[0];
  if (primero === undefined) {
    throw new Error(`El grupo «${grupo.clave}» no tiene mensajes.`);
  }

  return bd.enTransaccion(async (dentro) => {
    const alcance = await alcanceParaContacto(
      dentro,
      primero.canal,
      primero.contacto.identificador_externo,
      primero.contacto.nombre_declarado,
    );

    const conversacion = await conversacionAbierta(alcance, dentro);

    let guardados = 0;
    let repetidos = 0;

    for (const mensaje of grupo.mensajes) {
      const nuevo = await guardarMensajeEntrante(alcance, dentro, conversacion.id, mensaje);
      if (nuevo) guardados += 1;
      else repetidos += 1;
    }

    return { conversacion_id: conversacion.id, guardados, repetidos };
  });
}
