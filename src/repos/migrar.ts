// Ejecutor de migraciones.
//
// Aplica en orden los archivos de `migrations/` que aún no estén registrados en
// `esquema_migraciones`. Cada archivo trae su propio `BEGIN`/`COMMIT`, así que no
// se envuelve en otra transacción: anidarlas haría que un fallo a mitad dejara
// una parte aplicada y la tabla de control diciendo que no.
//
// Es idempotente a propósito. Un ejecutor que solo funciona sobre una base vacía
// obliga a borrarla para probar, y eso convierte «probar la migración» en algo
// que nadie hace.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Consultador } from './cliente.ts';

const CARPETA = 'migrations';

/** El número que abre el nombre del archivo: `007_lo_que_sea.sql` → 7. */
function versionDe(nombre: string): number | null {
  const coincidencia = /^(\d+)_/.exec(nombre);
  return coincidencia?.[1] === undefined ? null : Number(coincidencia[1]);
}

async function versionesAplicadas(bd: Consultador): Promise<Set<number>> {
  const existe = await bd.consultar<{ existe: boolean }>(
    `SELECT to_regclass('public.esquema_migraciones') IS NOT NULL AS existe`,
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
    await bd.consultar(sql);
    nuevas.push(archivo.version);
  }

  return nuevas;
}
