// Ejecutor de migraciones.
//
// Aplica en orden los archivos de `migrations/` que aún no estén registrados en
// `esquema_migraciones`. **El ejecutor es el dueño de la transacción**, una por
// archivo: el `.sql` no trae `BEGIN`/`COMMIT` propios. Antes sí los traía, y
// entonces el ejecutor no podía envolverlos sin anidar — que es justo lo que
// hace falta para tomar un cerrojo y sostenerlo durante la migración (ver
// `aplicar`). La propiedad que se buscaba con aquello se conserva igual: un
// fallo a mitad deshace el archivo entero, incluida su fila de control.
//
// Es idempotente a propósito. Un ejecutor que solo funciona sobre una base vacía
// obliga a borrarla para probar, y eso convierte «probar la migración» en algo
// que nadie hace.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Consultador } from './cliente.ts';

const CARPETA = 'migrations';

/**
 * Clave del cerrojo de aviso. Arbitraria pero fija: dos procesos solo se
 * excluyen si piden la misma. No colisiona con nada porque el espacio de claves
 * de `pg_advisory_lock` es del proyecto, no de PostgreSQL.
 */
const CLAVE_DE_CERROJO = 4_812_007;

/** El número que abre el nombre del archivo: `007_lo_que_sea.sql` → 7. */
function versionDe(nombre: string): number | null {
  const coincidencia = /^(\d+)_/.exec(nombre);
  return coincidencia?.[1] === undefined ? null : Number(coincidencia[1]);
}

/**
 * La tabla de control la crea **el ejecutor**, no la migración 001.
 *
 * Tenía que crearla 001, y eso dejaba un hueco sin arbitro: hasta que esa
 * migración termina no hay ninguna tabla contra la que dos procesos puedan
 * ponerse de acuerdo sobre quién la está aplicando. La crea el ejecutor, antes
 * de nada, y a partir de ahí la clave primaria de `version` decide.
 */
async function asegurarTablaDeControl(bd: Consultador): Promise<void> {
  await bd.consultar(
    `CREATE TABLE IF NOT EXISTS esquema_migraciones (
       version      INTEGER     PRIMARY KEY,
       nombre       TEXT        NOT NULL,
       aplicada_en  TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

async function versionesAplicadas(bd: Consultador): Promise<Set<number>> {
  // Sin cualificar con `public.` a propósito: todo el DDL de las migraciones va
  // sin cualificar y se resuelve por `search_path`. Comprobar la existencia en
  // un esquema fijo mientras se crea en otro hace que el ejecutor se responda
  // sobre una base que no es la que está tocando.
  const existe = await bd.consultar<{ existe: boolean }>(
    `SELECT to_regclass('esquema_migraciones') IS NOT NULL AS existe`,
  );

  if (existe[0]?.existe !== true) return new Set();

  const filas = await bd.consultar<{ version: number }>(
    'SELECT version FROM esquema_migraciones',
  );
  return new Set(filas.map((f) => f.version));
}

/**
 * @param carpeta Ruta a `migrations/`. Se pasa para que las pruebas no dependan
 *   del directorio desde el que se lanzó el proceso.
 * @returns Las versiones que ha aplicado esta llamada. Vacío si no había nada
 *   pendiente.
 */
export async function migrar(bd: Consultador, carpeta = CARPETA): Promise<readonly number[]> {
  const aplicadas = await versionesAplicadas(bd);

  const archivos = (await readdir(carpeta))
    .filter((n) => n.endsWith('.sql'))
    .map((n) => ({ nombre: n, version: versionDe(n) }))
    .filter((a): a is { nombre: string; version: number } => a.version !== null)
    .sort((a, b) => a.version - b.version);

  const nuevas: number[] = [];

  for (const archivo of archivos) {
    if (aplicadas.has(archivo.version)) continue;

    const sql = await readFile(join(carpeta, archivo.nombre), 'utf8');
    const nombre = archivo.nombre.replace(/\.sql$/, '');
    if (await aplicar(bd, archivo.version, nombre, sql)) nuevas.push(archivo.version);
  }

  return nuevas;
}

/**
 * La comprobación de arriba —«¿está aplicada?»— y la aplicación de abajo son dos
 * momentos distintos, y entre ellos cabe otro proceso. Dos instancias arrancando
 * a la vez leen las dos que falta la 2, y las dos la aplican: PostgreSQL rechaza
 * la segunda con `duplicate key ... pg_type_typname_nsp_index`, que es su
 * catálogo interno quejándose, no una tabla nuestra — un error que no dice en
 * absoluto lo que pasó. Rompió el CI de `main` el 1-ago-2026.
 *
 * **Quien decide es la clave primaria de `version`, no una lectura previa.** El
 * intento anterior fue un cerrojo de aviso más una relectura dentro de él, y no
 * bastó: el cerrojo serializa —está medido— pero la relectura se apoyaba en que
 * el catálogo del segundo proceso ya viera la tabla del primero, y esa
 * visibilidad no es algo sobre lo que convenga apostar. Un `INSERT` que o entra
 * o choca no depende de ninguna instantánea: o eres tú quien reclama la versión,
 * o no lo eres.
 *
 * El cerrojo se queda igualmente, porque el `INSERT` arbitra la fila pero no el
 * DDL: sin él, dos procesos que reclaman versiones **distintas** a la vez
 * seguirían pudiendo crear tipos a la vez y volver a chocar en el catálogo.
 *
 * @returns Si esta llamada fue la que la aplicó. Falso si otro se adelantó.
 */
async function aplicar(
  bd: Consultador,
  version: number,
  nombre: string,
  sql: string,
): Promise<boolean> {
  return bd.enTransaccion(async (dentro) => {
    // Se libera solo al cerrar la transacción, pase lo que pase dentro. Un
    // cerrojo de sesión sobreviviría a un proceso que revienta a mitad y dejaría
    // la migración bloqueada hasta que alguien lo notara.
    await dentro.consultar('SELECT pg_advisory_xact_lock($1)', [CLAVE_DE_CERROJO]);
    await asegurarTablaDeControl(dentro);

    const reclamada = await dentro.consultar<{ version: number }>(
      `INSERT INTO esquema_migraciones (version, nombre) VALUES ($1, $2)
         ON CONFLICT (version) DO NOTHING
         RETURNING version`,
      [version, nombre],
    );

    // Sin fila devuelta, otro proceso ya la reclamó. No es un error: es el
    // mecanismo funcionando.
    if (reclamada.length === 0) return false;

    await dentro.consultar(sql);
    return true;
  });
}
