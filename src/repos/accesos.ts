// El registro de acceso al panel.
//
// Este archivo es una excepción razonada a la regla del alcance de contacto, y
// la razón es distinta de la de `agregados.ts`: aquí no es que el dato no
// pertenezca a nadie, es que **el sujeto del registro es el operador, no el
// cliente**. Un acceso lo genera quien mira, no quien es mirado.
//
// Lo que sí se cumple, y es lo que hace que la excepción no abra un hueco: este
// archivo **no lee datos de conversaciones**. Escribe quién miró qué, y lee ese
// mismo registro. Ninguna de sus consultas toca `eventos`, `mensajes` ni
// `escalados`.

import { randomUUID } from 'node:crypto';

import type { Consultador } from './cliente.ts';

export const ROLES_DE_PANEL = ['metricas', 'trazas'] as const;
export type RolDePanel = (typeof ROLES_DE_PANEL)[number];

export const ACCIONES_DE_PANEL = [
  'leer_agregados',
  'leer_traza',
  'leer_vigias',
  'listar_trazas',
] as const;
export type AccionDePanel = (typeof ACCIONES_DE_PANEL)[number];

/**
 * Qué rol hace falta para cada acción.
 *
 * Tabla y no condicional: es la misma separación que declaran las reglas de
 * Firestore, y tenerla en un dato permite compararla con ellas en una prueba.
 * Dos sitios donde se decide lo mismo con código distinto acaban divergiendo.
 *
 * **Tener `metricas` no da acceso a trazas.** No son dos niveles de un rango —un
 * rango invita a suponer que el de arriba incluye al de abajo— sino dos permisos
 * distintos: ver cuántos casos se escalaron no es ver lo que decían.
 */
export const ROL_NECESARIO: Readonly<Record<AccionDePanel, readonly RolDePanel[]>> = {
  leer_agregados: ['metricas', 'trazas'],
  leer_vigias: ['metricas', 'trazas'],
  leer_traza: ['trazas'],
  listar_trazas: ['trazas'],
};

export type IntentoDeAcceso = {
  readonly operador: string;
  readonly rol: RolDePanel;
  readonly accion: AccionDePanel;
  readonly recurso: string;
  readonly origen?: string | null;
};

export type Veredicto =
  | { readonly concedido: true }
  | { readonly concedido: false; readonly motivo: string };

/** Decide, en código determinista. Ningún modelo, ninguna condición implícita. */
export function decidirAcceso(intento: IntentoDeAcceso): Veredicto {
  const permitidos = ROL_NECESARIO[intento.accion];
  if (permitidos.includes(intento.rol)) return { concedido: true };

  return {
    concedido: false,
    motivo:
      `el rol «${intento.rol}» no puede «${intento.accion}»: exige ` +
      `${permitidos.join(' o ')}. Ver métricas agregadas no implica ver el contenido ` +
      'de las conversaciones que las produjeron.',
  };
}

/**
 * Registra el acceso. **Las lecturas también, y las denegaciones sobre todo.**
 *
 * Devuelve el veredicto para que quien llama no pueda registrar una cosa y hacer
 * otra: la única forma de obtener la decisión es pasando por la función que la
 * anota.
 */
export async function registrarAcceso(
  bd: Consultador,
  intento: IntentoDeAcceso,
): Promise<Veredicto> {
  const veredicto = decidirAcceso(intento);

  await bd.consultar(
    `INSERT INTO accesos_panel (id, operador, rol, accion, recurso, concedido, motivo_denegacion, origen)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      randomUUID(),
      intento.operador,
      intento.rol,
      intento.accion,
      intento.recurso,
      veredicto.concedido,
      veredicto.concedido ? null : veredicto.motivo,
      intento.origen ?? null,
    ],
  );

  return veredicto;
}

export type LineaDeAcceso = {
  readonly momento: string;
  readonly operador: string;
  readonly rol: string;
  readonly accion: string;
  readonly recurso: string;
  readonly concedido: boolean;
};

/** Quién miró qué. Una de las dos preguntas que se le hacen a este registro. */
export async function accesosDeOperador(
  bd: Consultador,
  operador: string,
  limite = 200,
): Promise<readonly LineaDeAcceso[]> {
  return bd.consultar<LineaDeAcceso>(
    `SELECT momento, operador, rol, accion, recurso, concedido
       FROM accesos_panel
      WHERE operador = $1
      ORDER BY momento DESC
      LIMIT $2`,
    [operador, limite],
  );
}

/** Quién miró esta conversación. La otra pregunta, y la que más importa. */
export async function accesosARecurso(
  bd: Consultador,
  recurso: string,
  limite = 200,
): Promise<readonly LineaDeAcceso[]> {
  return bd.consultar<LineaDeAcceso>(
    `SELECT momento, operador, rol, accion, recurso, concedido
       FROM accesos_panel
      WHERE recurso = $1
      ORDER BY momento DESC
      LIMIT $2`,
    [recurso, limite],
  );
}
