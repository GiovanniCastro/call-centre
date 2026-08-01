// Conversaciones y mensajes. La persistencia que hace que reiniciar el proceso
// no pierda la conversación en curso.
//
// **Todas las funciones exportadas reciben el alcance como primer argumento y lo
// exigen.** No es estilo: hay una prueba que recorre el árbol sintáctico de esta
// carpeta y falla si aparece una que no lo haga. Ver `src/repos/alcance.ts`.
//
// Y toda consulta filtra por `contacto_id`, incluso cuando ya se busca por clave
// primaria. Parece redundante en `obtenerConversacion` —el identificador ya es
// único— y no lo es: sin ese filtro, conocer un identificador bastaría para leer
// la conversación de otro cliente.

import { randomUUID } from 'node:crypto';

import { exigirAlcance, type AlcanceContacto } from './alcance.ts';
import type { Consultador } from './cliente.ts';
import type { MensajeCanonico } from '../core/mensaje.ts';
import type { NombreCanal } from '../core/canal.ts';

export type Conversacion = {
  readonly id: string;
  readonly contacto_id: string;
  readonly canal: NombreCanal;
  readonly estado: 'abierta' | 'escalada' | 'cerrada';
  readonly abierta_en: Date;
};

export type MensajeGuardado = {
  readonly id: string;
  readonly conversacion_id: string;
  readonly direccion: 'entrante' | 'saliente';
  readonly tipo: string;
  readonly contenido: string;
  readonly procedencia: string;
  readonly marca_tiempo: Date;
};

type FilaContacto = { id: string };
type FilaConversacion = {
  id: string;
  contacto_id: string;
  canal: NombreCanal;
  estado: 'abierta' | 'escalada' | 'cerrada';
  abierta_en: Date;
};

/**
 * Busca el contacto por su identificador de canal, o lo crea.
 *
 * **No recibe alcance, y es la única que puede no recibirlo**: es precisamente la
 * función que lo fabrica. Antes de ella no hay contacto conocido, así que exigir
 * un alcance sería exigir lo que venimos a averiguar. La prueba estructural la
 * exceptúa por nombre, no por casualidad.
 */
export async function alcanceParaContacto(
  bd: Consultador,
  canal: NombreCanal,
  identificador_externo: string,
  nombre_declarado: string | null,
): Promise<AlcanceContacto> {
  const { alcanceDeContacto } = await import('./alcance.ts');

  const filas = await bd.consultar<FilaContacto>(
    `INSERT INTO contactos (id, canal, identificador_externo, nombre_declarado)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (canal, identificador_externo) DO UPDATE
       SET nombre_declarado = COALESCE(EXCLUDED.nombre_declarado, contactos.nombre_declarado),
           actualizado_en = now()
     RETURNING id`,
    [randomUUID(), canal, identificador_externo, nombre_declarado],
  );

  const fila = filas[0];
  if (fila === undefined) {
    throw new Error(`No se pudo obtener el contacto de ${canal}:${identificador_externo}`);
  }

  return alcanceDeContacto(fila.id, canal);
}

/** La conversación abierta del contacto, o una nueva. */
export async function conversacionAbierta(
  alcance: AlcanceContacto,
  bd: Consultador,
): Promise<Conversacion> {
  const a = exigirAlcance(alcance);

  const existentes = await bd.consultar<FilaConversacion>(
    `SELECT id, contacto_id, canal, estado, abierta_en
       FROM conversaciones
      WHERE contacto_id = $1 AND estado <> 'cerrada'
      ORDER BY abierta_en DESC
      LIMIT 1`,
    [a.contacto_id],
  );

  const existente = existentes[0];
  if (existente !== undefined) return existente;

  const creadas = await bd.consultar<FilaConversacion>(
    `INSERT INTO conversaciones (id, contacto_id, canal)
     VALUES ($1, $2, $3)
     RETURNING id, contacto_id, canal, estado, abierta_en`,
    [randomUUID(), a.contacto_id, a.canal],
  );

  const creada = creadas[0];
  if (creada === undefined) throw new Error('No se pudo abrir la conversación');
  return creada;
}

/**
 * Guarda un mensaje entrante.
 *
 * @returns `true` si se guardó, `false` si ya estaba. El índice único sobre
 *   `id_externo` es la segunda línea del rechazo de repetición: si el filtro de
 *   Redis falla —porque se reinició, porque expiró la clave— la base sigue
 *   impidiendo la segunda inserción.
 */
export async function guardarMensajeEntrante(
  alcance: AlcanceContacto,
  bd: Consultador,
  conversacion_id: string,
  mensaje: MensajeCanonico,
): Promise<boolean> {
  const a = exigirAlcance(alcance);

  const filas = await bd.consultar<{ id: string }>(
    `INSERT INTO mensajes
       (id, conversacion_id, contacto_id, direccion, tipo, contenido, procedencia,
        adjuntos, id_externo, marca_tiempo)
     SELECT $1, $2, $3, 'entrante', $4, $5, $6, $7::jsonb, $8, $9
      WHERE EXISTS (
        SELECT 1 FROM conversaciones WHERE id = $2 AND contacto_id = $3
      )
     ON CONFLICT (id_externo) WHERE id_externo IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      conversacion_id,
      a.contacto_id,
      mensaje.tipo,
      mensaje.contenido,
      mensaje.procedencia,
      JSON.stringify(mensaje.adjuntos),
      mensaje.id_externo,
      mensaje.marca_tiempo,
    ],
  );

  return filas.length > 0;
}

/** El hilo de una conversación, en orden. */
export async function mensajesDe(
  alcance: AlcanceContacto,
  bd: Consultador,
  conversacion_id: string,
  limite = 200,
): Promise<readonly MensajeGuardado[]> {
  const a = exigirAlcance(alcance);

  return bd.consultar<MensajeGuardado>(
    `SELECT id, conversacion_id, direccion, tipo, contenido, procedencia, marca_tiempo
       FROM mensajes
      WHERE contacto_id = $1 AND conversacion_id = $2
      ORDER BY marca_tiempo ASC, creado_en ASC
      LIMIT $3`,
    [a.contacto_id, conversacion_id, limite],
  );
}

/**
 * Una conversación por identificador.
 *
 * Filtra por contacto **además** de por clave primaria. Sin ese filtro, conocer
 * un identificador bastaría para leer la conversación de otro cliente.
 */
export async function obtenerConversacion(
  alcance: AlcanceContacto,
  bd: Consultador,
  conversacion_id: string,
): Promise<Conversacion | null> {
  const a = exigirAlcance(alcance);

  const filas = await bd.consultar<FilaConversacion>(
    `SELECT id, contacto_id, canal, estado, abierta_en
       FROM conversaciones
      WHERE contacto_id = $1 AND id = $2`,
    [a.contacto_id, conversacion_id],
  );

  return filas[0] ?? null;
}

export async function cerrarConversacion(
  alcance: AlcanceContacto,
  bd: Consultador,
  conversacion_id: string,
): Promise<void> {
  const a = exigirAlcance(alcance);

  await bd.consultar(
    `UPDATE conversaciones
        SET estado = 'cerrada', cerrada_en = now()
      WHERE contacto_id = $1 AND id = $2`,
    [a.contacto_id, conversacion_id],
  );
}
