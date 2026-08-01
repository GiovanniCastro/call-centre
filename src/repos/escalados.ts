// La cola de escalado. Todas las funciones exportadas reciben `AlcanceContacto`
// como primer argumento y filtran por él: la prueba estructural de la fase 1
// recorre esta carpeta y falla si aparece una que no lo haga.
//
// Que la cola esté acotada por contacto no es burocracia. Un operador atendiendo
// un escalado tiene delante la transcripción completa de una persona; poder
// listar la de otra por un `WHERE` que falta es la fuga que el alcance existe
// para impedir.

import { randomUUID } from 'node:crypto';

import { exigirAlcance, type AlcanceContacto } from './alcance.ts';
import type { Consultador } from './cliente.ts';

export const CLASES_DE_ESCALADO = [
  'sin_sustento',
  'esquema_invalido',
  'modelo_no_puede',
  'sin_fuentes',
  'peticion_sensible',
  'fallo_de_ejecucion',
] as const;

export type ClaseDeEscalado = (typeof CLASES_DE_ESCALADO)[number];

/** Una línea del hilo, tal como la vio el agente. */
export type LineaDeHilo = {
  readonly quien: 'cliente' | 'agente' | 'sistema';
  readonly texto: string;
  readonly momento: string;
};

export type EscaladoNuevo = {
  readonly caso_id: string;
  readonly conversacion_id?: string | null;
  readonly motivo: string;
  readonly clase: ClaseDeEscalado;
  /** El hilo COMPLETO. Un resumen no es un escalado, es un aviso. */
  readonly transcripcion: readonly LineaDeHilo[];
  readonly fuentes?: readonly unknown[];
  readonly rechazados?: readonly string[];
  readonly sustento?: number | null;
};

/**
 * Lo que sale de la base.
 *
 * Se declara aparte en vez de extender `EscaladoNuevo` porque ahí `fuentes`,
 * `rechazados` y `sustento` son opcionales —quien encola puede no tenerlos— y
 * aquí no lo son: la base les pone valor por omisión, así que al leer siempre
 * están. Heredar los opcionales obligaría a comprobar en cada lectura algo que
 * no puede faltar.
 */
export type Escalado = {
  readonly id: string;
  readonly contacto_id: string;
  readonly conversacion_id: string | null;
  readonly caso_id: string;
  readonly motivo: string;
  readonly clase: ClaseDeEscalado;
  readonly transcripcion: readonly LineaDeHilo[];
  readonly fuentes: readonly unknown[];
  readonly rechazados: readonly string[];
  readonly sustento: number | null;
  readonly estado: 'pendiente' | 'en_curso' | 'resuelto' | 'descartado';
  readonly creado_en: Date;
};

export class HiloVacio extends Error {
  override readonly name = 'HiloVacio';
}

/**
 * Encola un escalado.
 *
 * Rechaza una transcripción vacía en lugar de guardarla. Un escalado sin hilo
 * llega al operador como una notificación sin contexto, y entonces el criterio
 * «el caso escalado conserva el hilo completo» sería cierto del esquema y falso
 * de la práctica.
 */
export async function encolarEscalado(
  alcance: AlcanceContacto,
  bd: Consultador,
  escalado: EscaladoNuevo,
): Promise<string> {
  const a = exigirAlcance(alcance);

  if (escalado.transcripcion.length === 0) {
    throw new HiloVacio(
      `El escalado del caso «${escalado.caso_id}» no trae transcripción. Un operador que ` +
        'recibe el motivo sin el hilo tiene que reconstruir la conversación para poder ' +
        'juzgarla, y eso es exactamente lo que el escalado venía a evitarle.',
    );
  }

  const id = randomUUID();

  await bd.consultar(
    `INSERT INTO escalados
       (id, contacto_id, conversacion_id, caso_id, motivo, clase, transcripcion,
        fuentes, rechazados, sustento)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)`,
    [
      id,
      a.contacto_id,
      escalado.conversacion_id ?? null,
      escalado.caso_id,
      escalado.motivo,
      escalado.clase,
      JSON.stringify(escalado.transcripcion),
      JSON.stringify(escalado.fuentes ?? []),
      JSON.stringify(escalado.rechazados ?? []),
      escalado.sustento ?? null,
    ],
  );

  return id;
}

type Fila = {
  id: string;
  contacto_id: string;
  conversacion_id: string | null;
  caso_id: string;
  motivo: string;
  clase: string;
  transcripcion: LineaDeHilo[];
  fuentes: unknown[];
  rechazados: string[];
  sustento: number | null;
  estado: string;
  creado_en: Date;
};

/** Los escalados de ESTE contacto. El alcance está en el `WHERE`, no en la fe. */
export async function escaladosDe(
  alcance: AlcanceContacto,
  bd: Consultador,
): Promise<readonly Escalado[]> {
  const a = exigirAlcance(alcance);

  const filas = await bd.consultar<Fila>(
    `SELECT id, contacto_id, conversacion_id, caso_id, motivo, clase, transcripcion,
            fuentes, rechazados, sustento, estado, creado_en
       FROM escalados
      WHERE contacto_id = $1
      ORDER BY creado_en DESC`,
    [a.contacto_id],
  );

  return filas.map((f) => ({
    id: f.id,
    contacto_id: f.contacto_id,
    conversacion_id: f.conversacion_id,
    caso_id: f.caso_id,
    motivo: f.motivo,
    clase: f.clase as ClaseDeEscalado,
    transcripcion: f.transcripcion,
    fuentes: f.fuentes,
    rechazados: f.rechazados,
    sustento: f.sustento,
    estado: f.estado as Escalado['estado'],
    creado_en: f.creado_en,
  }));
}

/**
 * Marca un escalado como atendido.
 *
 * Exige operador: el esquema ya lo impone con un CHECK, y aquí se repite porque
 * la regla que solo vive en la base se descubre con un error de restricción a
 * mitad de una transacción, y el que solo vive en el código se salta con un
 * `psql`. Las dos capas dicen lo mismo a propósito.
 */
export async function resolverEscalado(
  alcance: AlcanceContacto,
  bd: Consultador,
  id: string,
  operador: string,
): Promise<boolean> {
  const a = exigirAlcance(alcance);

  if (operador.trim() === '') {
    throw new Error('Un escalado resuelto sin operador no se puede auditar.');
  }

  const filas = await bd.consultar<{ id: string }>(
    `UPDATE escalados
        SET estado = 'resuelto', operador = $3, resuelto_en = now()
      WHERE id = $2 AND contacto_id = $1
      RETURNING id`,
    [a.contacto_id, id, operador],
  );

  return filas.length > 0;
}

/** Cuántos esperan. Acotado al contacto, como todo lo demás de esta carpeta. */
export async function pendientesDe(
  alcance: AlcanceContacto,
  bd: Consultador,
): Promise<number> {
  const a = exigirAlcance(alcance);

  const filas = await bd.consultar<{ total: string }>(
    `SELECT count(*)::text AS total FROM escalados
      WHERE contacto_id = $1 AND estado = 'pendiente'`,
    [a.contacto_id],
  );

  return Number(filas[0]?.total ?? 0);
}
