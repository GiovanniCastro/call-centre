// `npm run publicar:demo` — la demo pública, desde lo que quedó grabado.
//
// **No pide DATABASE_URL, y eso no es un descuido: es la propiedad.** La demo
// pública se publica desde archivos de resultados, sin tocar el perímetro, sin
// una credencial de nube y sin encender la máquina con Ollama. Si esta orden
// necesitara la base de datos, la demo dejaría de ser reproducible por quien
// clone el repositorio y volveríamos a depender de que algo esté encendido.

import { readFile } from 'node:fs/promises';

import { elegirDestino, nombreDelDestino } from './destino.ts';
import { derivarDemo, type DefinicionDelLote, type ResultadosDelLote } from './demo.ts';
import { publicarDemo } from './publicar.ts';

const RESULTADOS = process.argv[2] ?? 'lote/resultados/fase-7-v1.json';
const CASOS = process.argv[3] ?? 'lote/casos.json';
const carpeta = process.env['PROYECCION_CARPETA'] ?? 'proyeccion/salida';

const resultados = JSON.parse(await readFile(RESULTADOS, 'utf8')) as ResultadosDelLote;
const definicion = JSON.parse(await readFile(CASOS, 'utf8')) as DefinicionDelLote;

console.warn(
  `\nReproduciendo el lote «${resultados.lote}» desde ${RESULTADOS}\n` +
    `  destino: ${nombreDelDestino()}\n`,
);

const reproduccion = derivarDemo(resultados, definicion, new Date().toISOString());
const publicado = await publicarDemo(elegirDestino(carpeta), reproduccion);

for (const modo of reproduccion.modos) {
  // Un modo no corrido sale con su motivo, nunca con ceros. Poner ceros daría una
  // comparación completa y falsa, que es peor que una incompleta y honesta.
  console.warn(
    modo.corrido
      ? `  ${modo.modo.padEnd(8)} ${String(modo.aciertos)}/${String(modo.casos)} aciertos`
      : `  ${modo.modo.padEnd(8)} NO CORRIDO — ${modo.motivo ?? 'sin motivo registrado'}`,
  );
}

console.warn(
  `\n  ${String(publicado.documentos)} documento(s) en ${carpeta}, ` +
    `${String(publicado.casos)} caso(s) reproducidos\n`,
);
