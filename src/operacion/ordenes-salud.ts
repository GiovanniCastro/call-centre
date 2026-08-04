// `npm run salud` — el informe de salud, en sus dos formatos.
//
//   npm run salud                      sobre la corrida más reciente, modo local
//   npm run salud -- --modo nube       otro modo de la misma corrida
//   npm run salud -- --json            solo la estructura, para un agente de código
//   npm run salud -- lote/resultados/fase-7-v1.json
//
// **No pide base de datos, ni Ollama, ni red.** Se compone sobre lo que el
// corredor dejó grabado, igual que la demo pública desde R-009: un informe de
// salud que exigiera el sistema encendido sería inútil justo el día que hace
// falta.
//
// Y no aplica nada. Escribe en la salida estándar y termina.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { componer, enMarkdown } from '../core/fallas/informe.ts';
import type { Encabezado, GrupoDeFallas } from '../core/fallas/vigia.ts';

const CARPETA = 'lote/resultados';

type EjecucionGrabada = {
  readonly modo: string;
  readonly corrido: boolean;
  readonly motivo: string | null;
  readonly salud?: { encabezado: Encabezado; grupos: readonly GrupoDeFallas[] } | null;
};

function argumento(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? null : (process.argv[i + 1] ?? null);
}

const soloJson = process.argv.includes('--json');
const modoPedido = argumento('modo') ?? 'local';
const rutaPedida = process.argv.slice(2).find((a) => a.endsWith('.json') && !a.startsWith('--'));

async function ultimaCorrida(): Promise<string | null> {
  const archivos = (await readdir(CARPETA).catch(() => [] as string[]))
    .filter((n) => n.endsWith('.json'))
    .sort();
  const ultimo = archivos.at(-1);
  return ultimo === undefined ? null : join(CARPETA, ultimo);
}

const ruta = rutaPedida ?? (await ultimaCorrida());

if (ruta === null) {
  console.error(
    `\nNo hay ninguna corrida grabada en ${CARPETA}/.\n\n` +
      '  El informe de salud se compone sobre lo que el corredor dejó registrado.\n' +
      '  Corre `npm run lote` primero.\n',
  );
  process.exit(1);
}

const crudo: unknown = JSON.parse(await readFile(ruta, 'utf8'));
const corrida = crudo as { lote?: string; ejecuciones?: readonly EjecucionGrabada[] };
const ejecuciones = corrida.ejecuciones ?? [];

const ejecucion = ejecuciones.find((e) => e.modo === modoPedido);

if (ejecucion === undefined) {
  console.error(
    `\nEsa corrida no tiene el modo «${modoPedido}». Tiene: ` +
      `${ejecuciones.map((e) => e.modo).join(', ') || '(ninguno)'}.\n`,
  );
  process.exit(1);
}

if (!ejecucion.corrido) {
  // No se compone un informe vacío: un encabezado de ceros sobre un modo que no
  // se ejecutó se lee como «cero fallos», que es lo contrario de lo que pasó.
  console.error(
    `\nEl modo «${modoPedido}» NO se corrió en ${ruta}.\n\n  Motivo: ${ejecucion.motivo ?? 'sin motivo registrado'}\n\n` +
      '  Un informe de salud sobre una ejecución que no ocurrió sería una página de\n' +
      '  ceros que se lee como «ningún fallo». No se genera.\n',
  );
  process.exit(1);
}

if (ejecucion.salud === undefined || ejecucion.salud === null) {
  // El caso de las corridas anteriores a esta fase. Se dice qué falta y cómo se
  // consigue, en vez de derivar fallas de otros campos: la disponibilidad
  // dependería entonces de cómo esté escrito el lote, no de cómo fue la corrida.
  console.error(
    `\n${ruta} es anterior al vigía de fallas: no lleva bloque «salud».\n\n` +
      '  El corredor lo graba desde la fase 9. Vuelve a correr `npm run lote` y el\n' +
      '  informe saldrá sobre esa corrida.\n\n' +
      '  No se deduce de los otros campos a propósito: `por_que_no` es el juicio de\n' +
      '  acierto contra la expectativa del caso, no un registro de fallas, y derivar\n' +
      '  la disponibilidad de ahí la haría depender de lo bien escrito que esté el\n' +
      '  lote en lugar de cómo fue la ejecución.\n',
  );
  process.exit(1);
}

const informe = componer({
  encabezado: ejecucion.salud.encabezado,
  grupos: ejecucion.salud.grupos,
  fuente: `${ruta} · modo ${ejecucion.modo}${corrida.lote === undefined ? '' : ` · lote ${corrida.lote}`}`,
  generado_en: new Date().toISOString(),
});

// Los dos formatos, del mismo objeto. El JSON es el que lee un agente de código;
// el Markdown, una persona. Ninguno recalcula nada del otro.
//
// Va por la salida estándar y no por `console.warn`, que escribe en la de error:
// el informe tiene que poder redirigirse a un archivo o entubarse a otra orden.
// Los avisos de más arriba sí van por la de error, para que no ensucien el
// informe cuando se redirige.
process.stdout.write((soloJson ? JSON.stringify(informe, null, 2) : enMarkdown(informe)) + '\n');
