// El adaptador de CRM sobre PostgreSQL, y la idempotencia por clave de
// operación. Todas las funciones exportadas reciben `AlcanceContacto` primero.
//
// **La idempotencia se registra antes y después.** Registrar solo al terminar
// deja invisible el caso peor: la acción se ejecutó, el proceso murió antes de
// anotarlo, y el reintento la ejecuta otra vez. Con la fila escrita antes, el
// reintento encuentra `iniciada` y sabe que alguien ya estaba en ello — que no
// es lo mismo que «no se ha hecho».

import { randomUUID } from 'node:crypto';

import { exigirAlcance, type AlcanceContacto } from './alcance.ts';
import type { Consultador } from './cliente.ts';
import type { CRM, Hueco, Prospecto } from '../core/crm/crm.ts';

export type ResultadoIdempotente<T> =
  | { readonly estado: 'ejecutada'; readonly valor: T }
  | { readonly estado: 'ya_estaba'; readonly valor: T }
  | { readonly estado: 'en_curso' };

/**
 * Ejecuta `trabajo` una sola vez por clave, pase lo que pase.
 *
 * Tres desenlaces, no dos. `en_curso` es el que suele faltar y el que evita el
 * daño: significa que otra ejecución la reclamó y todavía no ha terminado.
 * Tratarlo como «no hecha» y ejecutar sería crear la segunda cita; tratarlo como
 * «hecha» y devolver éxito sería mentir.
 */
export async function unaSolaVez<T>(
  alcance: AlcanceContacto,
  bd: Consultador,
  clave: string,
  herramienta: string,
  trabajo: () => Promise<T>,
): Promise<ResultadoIdempotente<T>> {
  const a = exigirAlcance(alcance);

  const reclamada = await bd.consultar<{ clave: string }>(
    `INSERT INTO operaciones (clave, contacto_id, herramienta)
     VALUES ($1, $2, $3)
     ON CONFLICT (clave) DO NOTHING
     RETURNING clave`,
    [clave, a.contacto_id, herramienta],
  );

  if (reclamada.length === 0) {
    const previas = await bd.consultar<{ estado: string; resultado: unknown }>(
      'SELECT estado, resultado FROM operaciones WHERE clave = $1 AND contacto_id = $2',
      [clave, a.contacto_id],
    );

    const previa = previas[0];
    // Sin fila para ESTE contacto: la clave existe pero es de otro. No se
    // ejecuta ni se devuelve su resultado — sería una fuga entre contactos por
    // la puerta de la idempotencia.
    if (previa === undefined) return { estado: 'en_curso' };
    if (previa.estado === 'completada') {
      return { estado: 'ya_estaba', valor: previa.resultado as T };
    }
    return { estado: 'en_curso' };
  }

  try {
    const valor = await trabajo();
    await bd.consultar(
      `UPDATE operaciones SET estado = 'completada', resultado = $2::jsonb, terminada_en = now()
        WHERE clave = $1 AND contacto_id = $3`,
      [clave, JSON.stringify(valor), a.contacto_id],
    );
    return { estado: 'ejecutada', valor };
  } catch (error) {
    await bd.consultar(
      `UPDATE operaciones SET estado = 'fallida', error = $2, terminada_en = now()
        WHERE clave = $1 AND contacto_id = $3`,
      [clave, error instanceof Error ? error.message : String(error), a.contacto_id],
    );
    throw error;
  }
}

export type CitaCreada = {
  readonly id: string;
  readonly inicia_en: string;
  readonly termina_en: string;
  readonly motivo: string;
};

/**
 * Agenda una cita en un hueco libre.
 *
 * El hueco se toma con una condición en el propio `UPDATE` —`tomado_por IS
 * NULL`— y no leyendo primero: entre leer «está libre» y escribir «lo tomo»
 * cabe otro proceso, y las dos citas resultantes serían legítimas cada una por
 * su lado.
 */
export async function agendarCita(
  alcance: AlcanceContacto,
  bd: Consultador,
  clave_operacion: string,
  hueco_id: string,
  motivo: string,
): Promise<CitaCreada> {
  const a = exigirAlcance(alcance);

  const tomados = await bd.consultar<{ id: string; inicia_en: Date; termina_en: Date }>(
    `UPDATE huecos SET tomado_por = $1
      WHERE id = $2 AND tomado_por IS NULL
      RETURNING id, inicia_en, termina_en`,
    [a.contacto_id, hueco_id],
  );

  const hueco = tomados[0];
  if (hueco === undefined) {
    throw new Error(
      `El hueco «${hueco_id}» ya no está libre. No se agenda encima: dos citas en el ` +
        'mismo hueco son dos personas presentándose a la vez.',
    );
  }

  const id = randomUUID();
  await bd.consultar(
    `INSERT INTO citas (id, contacto_id, clave_operacion, motivo, inicia_en, termina_en)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, a.contacto_id, clave_operacion, motivo, hueco.inicia_en, hueco.termina_en],
  );

  return {
    id,
    inicia_en: hueco.inicia_en.toISOString(),
    termina_en: hueco.termina_en.toISOString(),
    motivo,
  };
}

export async function citasDe(
  alcance: AlcanceContacto,
  bd: Consultador,
): Promise<readonly CitaCreada[]> {
  const a = exigirAlcance(alcance);

  const filas = await bd.consultar<{
    id: string;
    inicia_en: Date;
    termina_en: Date;
    motivo: string;
  }>(
    `SELECT id, inicia_en, termina_en, motivo FROM citas
      WHERE contacto_id = $1 AND estado = 'confirmada' ORDER BY inicia_en`,
    [a.contacto_id],
  );

  return filas.map((f) => ({
    id: f.id,
    inicia_en: f.inicia_en.toISOString(),
    termina_en: f.termina_en.toISOString(),
    motivo: f.motivo,
  }));
}

/** El CRM por omisión: PostgreSQL, que ya está en el stack. */
export function crmSobrePostgres(bd: Consultador): CRM {
  return {
    nombre: 'postgres',

    async guardarProspecto(alcance, campos) {
      const a = exigirAlcance(alcance);

      // FUSIONA, no reemplaza, y en UNA sola sentencia. El operador de unión de
      // JSONB junta los dos objetos con el de la derecha ganando. Leer, mezclar
      // en memoria y escribir habría dejado una ventana entre la lectura y la
      // escritura en la que otro campo del mismo cliente se pierde sin ruido.
      const filas = await bd.consultar<{ campos: Record<string, string>; estado: string }>(
        `INSERT INTO prospectos (id, contacto_id, campos)
         VALUES (gen_random_uuid(), $1, $2::jsonb)
         ON CONFLICT (contacto_id)
         DO UPDATE SET campos = prospectos.campos || EXCLUDED.campos,
                       actualizado_en = now()
         RETURNING campos, estado`,
        [a.contacto_id, JSON.stringify(campos)],
      );

      const fila = filas[0];
      if (fila === undefined) throw new Error('No se pudo guardar el prospecto.');

      return {
        contacto_id: a.contacto_id,
        campos: fila.campos,
        estado: fila.estado as Prospecto['estado'],
      };
    },

    async obtenerProspecto(alcance) {
      const a = exigirAlcance(alcance);
      const filas = await bd.consultar<{ campos: Record<string, string>; estado: string }>(
        'SELECT campos, estado FROM prospectos WHERE contacto_id = $1 LIMIT 1',
        [a.contacto_id],
      );

      const fila = filas[0];
      if (fila === undefined) return null;
      return {
        contacto_id: a.contacto_id,
        campos: fila.campos,
        estado: fila.estado as Prospecto['estado'],
      };
    },

    async huecosLibres(alcance, desde, cuantos) {
      exigirAlcance(alcance);
      const filas = await bd.consultar<{ id: string; inicia_en: Date; termina_en: Date }>(
        `SELECT id, inicia_en, termina_en FROM huecos
          WHERE tomado_por IS NULL AND inicia_en >= $1
          ORDER BY inicia_en LIMIT $2`,
        [desde, cuantos],
      );

      return filas.map((f): Hueco => ({
        id: f.id,
        inicia_en: f.inicia_en.toISOString(),
        termina_en: f.termina_en.toISOString(),
      }));
    },
  };
}
