// `npm run respaldo` — el ciclo entero, de una vez.
//
// Una sola orden que vuelca, restaura en una base aparte, compara y poda. No dos
// órdenes con la verificación aparte, y es deliberado: un comprobante que hay que
// acordarse de ejecutar es un comprobante que dentro de tres meses nadie ejecuta,
// y entonces la carpeta de respaldos se llena de archivos que nadie ha abierto
// nunca. El respaldo y su prueba son la misma tarea.
//
//   npm run respaldo             volcar, restaurar, verificar y podar
//   npm run respaldo -- --solo-volcar     volcar sin restaurar (para un cron aparte)

import { baseDe, descubrirCanal, podar, respaldar, restaurarYVerificar, RESPALDOS } from './respaldo.ts';

const url = process.env['DATABASE_URL'];
if (url === undefined || url === '') {
  console.error(
    '\nFalta DATABASE_URL. No hay nada que respaldar.\n\n' +
      '  Copia .env.ejemplo a .env y descomenta DATABASE_URL, o levanta los\n' +
      '  servicios con `npm run servicios`.\n',
  );
  process.exit(1);
}

const soloVolcar = process.argv.includes('--solo-volcar');

const canal = await descubrirCanal();
if (canal === null) {
  console.error(
    '\nNo se encontró `pg_dump`, ni en el PATH ni dentro del contenedor.\n\n' +
      '  Dos vías, cualquiera sirve:\n' +
      '    · `npm run servicios` — PostgreSQL en contenedor, con sus herramientas dentro.\n' +
      '    · instalar el cliente de PostgreSQL en la máquina.\n\n' +
      '  No se implementa un exportador propio a propósito: un formato que solo\n' +
      '  entiende este proyecto no es un respaldo, es un archivo.\n',
  );
  process.exit(1);
}

// El nombre de la base sale del camino de la URL, no de su contraseña, y no se
// redacta: es lo que hace falta para saber qué se está respaldando. La primera
// versión sí lo redactaba, y en desarrollo salía tapado —la contraseña de
// docker-compose es `perimetro`, igual que el nombre de la base, así que la capa
// de valor lo tapaba por coincidencia—. La redacción hacía lo correcto; taparlo
// aquí era pedirle que adivinara.
console.warn(`\nRespaldando «${baseDe(url)}» — ${canal.version} (vía ${canal.nombre})\n`);

const manifiesto = await respaldar({ url, canal });
const filas = manifiesto.tablas.reduce((s, t) => s + t.filas, 0);

console.warn(`  volcado: ${manifiesto.archivo}`);
console.warn(`  ${(manifiesto.bytes / 1024).toFixed(1)} KiB · sha256 ${manifiesto.sha256.slice(0, 16)}…`);
console.warn(`  ${manifiesto.tablas.length} tabla(s), ${filas} fila(s)`);

const volatiles = manifiesto.tablas.filter((t) => t.volatil);
if (volatiles.length > 0) {
  console.warn(
    `  ${volatiles.length} tabla(s) cambiaron durante el volcado: ` +
      `${volatiles.map((t) => t.tabla).join(', ')}. Se verifican por intervalo.`,
  );
}

if (soloVolcar) {
  console.warn(
    '\n  --solo-volcar: NO se ha restaurado.\n' +
      '  Este archivo todavía no es un respaldo: es un archivo. Verifícalo con\n' +
      '  `npm run respaldo` antes de contar con él.\n',
  );
  process.exit(0);
}

console.warn(`\nRestaurando en «${RESPALDOS.base_de_verificacion}» para comprobar que sirve…\n`);

const verificacion = await restaurarYVerificar({ url, archivo: manifiesto.archivo, canal });

if (!verificacion.sha256_coincide) {
  console.error('  ✗ la suma de verificación NO coincide: el archivo cambió tras crearse');
}

for (const d of verificacion.diferencias) {
  console.error(
    `  ✗ ${d.tabla}: ${String(d.en_el_respaldo)} → ${String(d.tras_restaurar)} — ${d.por_que}`,
  );
}

if (!verificacion.ok) {
  console.error(
    '\n  RESTAURACIÓN NO VERIFICADA. Este archivo no cuenta como respaldo.\n',
  );
  process.exit(1);
}

console.warn(
  `  ✓ restaurado y verificado: ${verificacion.tablas_comprobadas} tabla(s), ` +
    `${verificacion.filas_comprobadas} fila(s) recuperadas`,
);

const borrados = await podar();
if (borrados.length > 0) {
  console.warn(`  ${borrados.length} respaldo(s) por encima de ${RESPALDOS.retencion_dias} días, borrados`);
}

console.warn('');
