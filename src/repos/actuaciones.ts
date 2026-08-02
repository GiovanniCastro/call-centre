// Persistencia de actuaciones de vigía e incidentes de seguridad.
//
// Los dos archivos anteriores de esta carpeta que no llevan alcance lo explican
// cada uno a su manera. Este lleva las dos situaciones a la vez, y por eso se
// separa en dos mitades:
//
//   - **Las actuaciones no son de nadie.** Un techo de presupuesto cruzado es un
//     hecho del sistema. No llevan `contacto_id` y no pueden llevarlo: `huecos`
//     ya sentó que hay una tercera categoría de tabla, ni dato de cliente ni
//     recurso propio, y esta es otra.
//   - **Los incidentes SÍ son de alguien**, y por eso las funciones que los leen
//     reciben alcance y filtran. Un operador mirando incidentes tiene delante lo
//     que escribió una persona.
//
// La mitad de escritura de incidentes no lleva alcance por la misma razón que
// ninguna inserción lo lleva: no se puede filtrar por lo que se está escribiendo.
// Lo que se exige es que la fila quede atribuida, y `contacto_id` está entre las
// columnas.

import { randomUUID } from 'node:crypto';

import { exigirAlcance, type AlcanceContacto } from './alcance.ts';
import type { Consultador } from './cliente.ts';
import type { Actuacion } from '../core/vigias/vigia.ts';

export async function guardarActuacion(bd: Consultador, actuacion: Actuacion): Promise<void> {
  await bd.consultar(
    `INSERT INTO actuaciones_vigia
       (id, momento, vigia, autoridad, umbral, valor_observado, explicacion, contexto)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      randomUUID(),
      actuacion.momento,
      actuacion.vigia,
      actuacion.autoridad,
      actuacion.umbral,
      actuacion.valor_observado,
      actuacion.explicacion,
      JSON.stringify(actuacion.contexto),
    ],
  );
}

export type EstadoDeVigiaProyectado = {
  readonly vigia: string;
  readonly autoridad: string;
  readonly umbral: string;
  readonly valor_observado: string;
  readonly explicacion: string;
  readonly momento: string;
  readonly actuaciones: number;
};

/**
 * El estado de cada vigía para el panel: su última actuación y cuántas lleva.
 *
 * Un vigía sin ninguna actuación **no sale de esta consulta**, y eso es un
 * problema que resuelve quien la llama: la fila «no ha actuado nunca» es tan
 * informativa como la contraria, y una lista que solo enseñe los que dispararon
 * hace pensar que los demás no existen. El publicador completa la lista con los
 * vigías declarados.
 */
export async function ultimaActuacionPorVigia(
  bd: Consultador,
): Promise<readonly EstadoDeVigiaProyectado[]> {
  return bd.consultar<EstadoDeVigiaProyectado>(
    `SELECT DISTINCT ON (vigia)
            vigia, autoridad,
            umbral::text          AS umbral,
            valor_observado::text AS valor_observado,
            explicacion,
            momento::text         AS momento,
            COUNT(*) OVER (PARTITION BY vigia)::int AS actuaciones
       FROM actuaciones_vigia
      ORDER BY vigia, momento DESC`,
  );
}

export type IncidenteNuevo = {
  readonly clase: string;
  readonly nivel: string;
  readonly fragmento: string;
  readonly patron: string;
  readonly momento?: string;
};

/**
 * Registra un incidente.
 *
 * Lleva alcance aunque sea una inserción, y no por simetría: el incidente
 * pertenece al contacto que lo provocó, y el alcance es lo que impide
 * atribuírselo a otro. El detector corre dentro del ciclo de caso, que ya lo
 * tiene — no cuesta nada y cierra la puerta.
 */
export async function guardarIncidente(
  alcance: AlcanceContacto,
  bd: Consultador,
  incidente: IncidenteNuevo,
): Promise<void> {
  exigirAlcance(alcance);
  const contacto_id = alcance.contacto_id;

  await bd.consultar(
    `INSERT INTO incidentes_seguridad
       (id, momento, contacto_id, clase, nivel, fragmento, patron)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      randomUUID(),
      incidente.momento ?? new Date().toISOString(),
      contacto_id,
      incidente.clase,
      incidente.nivel,
      incidente.fragmento,
      incidente.patron,
    ],
  );
}

export type LineaDeIncidente = {
  readonly momento: string;
  readonly clase: string;
  readonly nivel: string;
  readonly fragmento: string;
  readonly patron: string;
};

/** Los incidentes de UN contacto. Llevan lo que escribió una persona. */
export async function incidentesDelContacto(
  alcance: AlcanceContacto,
  bd: Consultador,
  limite = 100,
): Promise<readonly LineaDeIncidente[]> {
  exigirAlcance(alcance);

  return bd.consultar<LineaDeIncidente>(
    `SELECT momento::text AS momento, clase, nivel, fragmento, patron
       FROM incidentes_seguridad
      WHERE contacto_id = $1
      ORDER BY momento DESC
      LIMIT $2`,
    [alcance.contacto_id, limite],
  );
}

// El recuento de incidentes por clase vive en `agregados.ts`, no aquí: es un
// agregado, y allí rige la regla que impide que un agregado devuelva columnas
// identificatorias. Tenerlo en este archivo lo habría dejado fuera de esa
// comprobación, que es la única que lo contiene.
