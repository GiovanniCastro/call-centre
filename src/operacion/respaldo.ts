// Respaldo de PostgreSQL, con la restauración incluida.
//
// El criterio de la fase 8 no es «existe un respaldo». Es este:
//
//   > Una restauración de respaldo se ha ejecutado y verificado.
//   > **Un respaldo que no se ha restaurado nunca no es un respaldo.**
//
// Por eso este módulo no tiene una función que vuelca y ya está. Tiene un ciclo:
// volcar, restaurar en una base aparte y **comparar los recuentos tabla por
// tabla**. Lo que se afirma al final no es que el proceso terminó con código
// cero —eso lo cumple un archivo vacío— sino que en la base restaurada hay las
// mismas filas que había en la original.
//
// Tres decisiones que merecen constar:
//
//   1. **La restauración va a una base de verificación, nunca a la de
//      producción.** Y el módulo se niega a arrancar si los dos nombres
//      coinciden. Una comprobación de respaldos que puede borrar la base que
//      pretende proteger es un riesgo mayor que no comprobar nada.
//   2. **Todo viaja por entrada y salida estándar**, no por rutas de archivo que
//      las herramientas abran ellas mismas. Eso es lo que hace que funcione igual
//      con `pg_dump` en el PATH que con `pg_dump` dentro del contenedor de
//      docker-compose: el contenedor no ve el disco del anfitrión, pero sí ve su
//      propia salida estándar.
//   3. **Los recuentos se toman antes y después del volcado.** Si una tabla
//      cambió entre las dos, se marca como volátil y la verificación la acepta
//      dentro del intervalo observado en lugar de exigir un número exacto. Sin
//      esto, respaldar un sistema en marcha daría falsos fallos — y un
//      comprobante que falla cuando todo está bien acaba ignorado, que es la peor
//      forma de perderlo.

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { crearConsultador } from '../repos/cliente.ts';
import { recuentoDeFilas, type RecuentoDeTabla } from '../repos/inventario.ts';
import { ejecutar, type Salida } from './procesos.ts';
import { redactar } from './secretos.ts';

import CONFIG from '../../config/respaldos.json' with { type: 'json' };

export class ErrorDeRespaldo extends Error {
  override readonly name = 'ErrorDeRespaldo';
}

/** Las tres herramientas de PostgreSQL que hacen falta, y cómo se invocan. */
export type Herramienta = 'pg_dump' | 'pg_restore' | 'psql';

/**
 * Por dónde se llama a las herramientas.
 *
 * `ruta` — están instaladas en la máquina. `contenedor` — se invocan dentro del
 * servicio de docker-compose, que es lo normal en una máquina de desarrollo
 * donde PostgreSQL vive en un contenedor y sus herramientas viven con él.
 */
export type Canal = {
  readonly nombre: 'ruta' | 'contenedor';
  readonly version: string;
  argv(herramienta: Herramienta, ...argumentos: readonly string[]): readonly string[];
};

type Ejecutor = (e: Parameters<typeof ejecutar>[0]) => Promise<Salida>;

function canalDeRuta(version: string): Canal {
  return {
    nombre: 'ruta',
    version,
    argv: (herramienta, ...argumentos) => [herramienta, ...argumentos],
  };
}

function canalDeContenedor(servicio: string, version: string): Canal {
  return {
    nombre: 'contenedor',
    version,
    // `-T` desactiva la asignación de pseudoterminal. Sin él, docker mete
    // caracteres de control en el flujo y el volcado sale corrupto de una forma
    // que no se nota hasta que hay que restaurarlo.
    argv: (herramienta, ...argumentos) => [
      'docker',
      'compose',
      'exec',
      '-T',
      servicio,
      herramienta,
      ...argumentos,
    ],
  };
}

/**
 * Averigua por dónde se puede llamar a `pg_dump`.
 *
 * Se prueba, no se supone: se ejecuta `--version` y se mira si contesta. Y se
 * devuelve la versión porque va al manifiesto — restaurar un volcado con una
 * versión de `pg_restore` anterior a la de `pg_dump` que lo creó no funciona, y
 * cuando eso pasa conviene que el archivo diga con qué se hizo.
 */
export async function descubrirCanal(
  servicioDocker: string = CONFIG.servicio_docker,
  ejecutor: Ejecutor = ejecutar,
): Promise<Canal | null> {
  const enRuta = await ejecutor({ argv: ['pg_dump', '--version'] });
  if (enRuta.codigo === 0) return canalDeRuta(enRuta.stdout.trim());

  const enContenedor = await ejecutor({
    argv: ['docker', 'compose', 'exec', '-T', servicioDocker, 'pg_dump', '--version'],
  });
  if (enContenedor.codigo === 0) return canalDeContenedor(servicioDocker, enContenedor.stdout.trim());

  return null;
}

export type RecuentoRespaldado = {
  readonly tabla: string;
  readonly filas: number;
  /**
   * La tabla cambió mientras se volcaba.
   *
   * Cuando es cierto, `filas` es el recuento previo y `filas_al_terminar` el
   * posterior: la verificación acepta cualquier valor entre los dos.
   */
  readonly volatil: boolean;
  readonly filas_al_terminar: number;
};

export type Manifiesto = {
  readonly version: 1;
  readonly creado_en: string;
  readonly archivo: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly canal: string;
  readonly herramienta: string;
  readonly tablas: readonly RecuentoRespaldado[];
};

/** El nombre del archivo de manifiesto que acompaña a un volcado. */
export function manifiestoDe(archivo: string): string {
  return `${archivo}.manifiesto.json`;
}

async function sha256De(archivo: string): Promise<string> {
  const resumen = createHash('sha256');
  for await (const trozo of createReadStream(archivo)) resumen.update(trozo as Buffer);
  return resumen.digest('hex');
}

/** Cambia el nombre de la base en una cadena de conexión, dejando lo demás igual. */
export function conBase(url: string, base: string): string {
  const analizada = new URL(url);
  analizada.pathname = `/${base}`;
  return analizada.toString();
}

/** El nombre de la base al que apunta una cadena de conexión. */
export function baseDe(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

function marcaDeTiempoParaNombre(ahora: Date): string {
  // Los dos puntos del formato ISO no valen como nombre de archivo en Windows —
  // la misma piedra con la que tropezó el destino de proyección de la fase 6.
  return ahora.toISOString().replace(/[:.]/g, '-');
}

export type OpcionesDeRespaldo = {
  readonly url: string;
  readonly carpeta?: string;
  readonly canal: Canal;
  readonly ahora?: Date;
  readonly ejecutor?: Ejecutor;
};

/**
 * Vuelca la base entera y deja el manifiesto al lado.
 *
 * Formato personalizado (`-Fc`): comprimido, restaurable tabla por tabla y —lo
 * que importa aquí— el que `pg_restore` sabe leer desde la entrada estándar.
 */
export async function respaldar(opciones: OpcionesDeRespaldo): Promise<Manifiesto> {
  const ejecutor = opciones.ejecutor ?? ejecutar;
  const carpeta = opciones.carpeta ?? CONFIG.carpeta;
  const ahora = opciones.ahora ?? new Date();

  await mkdir(carpeta, { recursive: true });
  const archivo = join(carpeta, `perimetro_${marcaDeTiempoParaNombre(ahora)}.dump`);

  const bd = crearConsultador(opciones.url);
  try {
    const antes = await recuentoDeFilas(bd);

    const volcado = await ejecutor({
      argv: opciones.canal.argv('pg_dump', '--format=custom', '--dbname', opciones.url),
      haciaArchivo: archivo,
    });

    if (volcado.codigo !== 0) {
      throw new ErrorDeRespaldo(
        `pg_dump terminó con código ${String(volcado.codigo)}.\n` +
          `  orden: ${volcado.orden}\n  ${redactar(volcado.stderr)}`,
      );
    }

    const despues = await recuentoDeFilas(bd);
    const tablas = unirRecuentos(antes, despues);

    const { size } = await stat(archivo);
    if (size === 0) {
      // Un archivo vacío con nombre de respaldo es peor que ningún archivo: el
      // día que haga falta, alguien lo verá en la carpeta y creerá que hay red.
      throw new ErrorDeRespaldo(`El volcado salió vacío: ${archivo}`);
    }

    const manifiesto: Manifiesto = {
      version: 1,
      creado_en: ahora.toISOString(),
      archivo,
      bytes: size,
      sha256: await sha256De(archivo),
      canal: opciones.canal.nombre,
      herramienta: opciones.canal.version,
      tablas,
    };

    await writeFile(manifiestoDe(archivo), JSON.stringify(manifiesto, null, 2), 'utf8');
    return manifiesto;
  } finally {
    await bd.cerrar();
  }
}

/** Cruza los recuentos de antes y después del volcado, marcando lo que se movió. */
function unirRecuentos(
  antes: readonly RecuentoDeTabla[],
  despues: readonly RecuentoDeTabla[],
): readonly RecuentoRespaldado[] {
  const finales = new Map(despues.map((r) => [r.tabla, r.filas]));

  return antes.map((r) => {
    const alTerminar = finales.get(r.tabla) ?? r.filas;
    return {
      tabla: r.tabla,
      filas: r.filas,
      volatil: alTerminar !== r.filas,
      filas_al_terminar: alTerminar,
    };
  });
}

export type Diferencia = {
  readonly tabla: string;
  readonly en_el_respaldo: number | null;
  readonly tras_restaurar: number | null;
  readonly por_que: string;
};

/**
 * Compara lo respaldado con lo restaurado. Función pura: es la que decide.
 *
 * Se separa del proceso a propósito. Es la única parte del ciclo cuyo resultado
 * significa algo, y tenerla aparte permite probarla con casos que en una base de
 * verdad costaría mucho provocar — una tabla que desaparece, una que vuelve a
 * medias, una que se movió mientras se volcaba.
 */
export function compararRecuentos(
  respaldadas: readonly RecuentoRespaldado[],
  restauradas: readonly RecuentoDeTabla[],
): readonly Diferencia[] {
  const diferencias: Diferencia[] = [];
  const tras = new Map(restauradas.map((r) => [r.tabla, r.filas]));

  for (const tabla of respaldadas) {
    const ahora = tras.get(tabla.tabla);

    if (ahora === undefined) {
      diferencias.push({
        tabla: tabla.tabla,
        en_el_respaldo: tabla.filas,
        tras_restaurar: null,
        por_que: 'la tabla no existe tras restaurar',
      });
      continue;
    }

    if (tabla.volatil) {
      // Intervalo, no igualdad: la tabla se movió mientras se volcaba, y el
      // volcado capturó un instante entre los dos recuentos.
      const minimo = Math.min(tabla.filas, tabla.filas_al_terminar);
      const maximo = Math.max(tabla.filas, tabla.filas_al_terminar);
      if (ahora < minimo || ahora > maximo) {
        diferencias.push({
          tabla: tabla.tabla,
          en_el_respaldo: tabla.filas,
          tras_restaurar: ahora,
          por_que: `fuera del intervalo observado durante el volcado (${minimo}–${maximo})`,
        });
      }
      continue;
    }

    if (ahora !== tabla.filas) {
      diferencias.push({
        tabla: tabla.tabla,
        en_el_respaldo: tabla.filas,
        tras_restaurar: ahora,
        por_que: 'el recuento no coincide',
      });
    }
  }

  for (const restaurada of restauradas) {
    if (respaldadas.some((r) => r.tabla === restaurada.tabla)) continue;
    // Una tabla que aparece de la nada al restaurar significa que la base de
    // verificación traía restos de otra ejecución: la comparación siguiente ya
    // no diría nada del respaldo.
    diferencias.push({
      tabla: restaurada.tabla,
      en_el_respaldo: null,
      tras_restaurar: restaurada.filas,
      por_que: 'la tabla no estaba en el respaldo: la base de verificación no estaba limpia',
    });
  }

  return diferencias;
}

export type Verificacion = {
  readonly ok: boolean;
  readonly archivo: string;
  readonly sha256_coincide: boolean;
  readonly base_de_verificacion: string;
  readonly diferencias: readonly Diferencia[];
  readonly tablas_comprobadas: number;
  readonly filas_comprobadas: number;
};

export type OpcionesDeVerificacion = {
  readonly url: string;
  readonly archivo: string;
  readonly canal: Canal;
  readonly baseDeVerificacion?: string;
  readonly ejecutor?: Ejecutor;
};

/**
 * Restaura un respaldo en una base aparte y comprueba que está todo.
 *
 * Esto es lo que convierte un archivo en un respaldo.
 */
export async function restaurarYVerificar(
  opciones: OpcionesDeVerificacion,
): Promise<Verificacion> {
  const ejecutor = opciones.ejecutor ?? ejecutar;
  const verificacion = opciones.baseDeVerificacion ?? CONFIG.base_de_verificacion;
  const produccion = baseDe(opciones.url);

  if (verificacion === produccion) {
    // La comprobación más importante de este archivo. Lo que viene después
    // ejecuta `DROP DATABASE`.
    throw new ErrorDeRespaldo(
      `La base de verificación no puede ser la de producción («${produccion}»). ` +
        'La restauración de prueba borra y recrea la base de destino: apuntarla a ' +
        'producción destruiría exactamente lo que este módulo existe para proteger.',
    );
  }

  const manifiesto = JSON.parse(
    await readFile(manifiestoDe(opciones.archivo), 'utf8'),
  ) as Manifiesto;

  // Antes de restaurar: ¿es este el archivo que se creó? Un volcado alterado en
  // el disco —o truncado por un disco lleno— restauraría menos de lo que dice el
  // manifiesto, y la comparación de recuentos lo detectaría después; comprobarlo
  // aquí dice *por qué* falló, que es lo que hace falta a las tres de la mañana.
  const sha256 = await sha256De(opciones.archivo);
  const sha256_coincide = sha256 === manifiesto.sha256;

  // Las órdenes de base van contra la base de mantenimiento, no contra la que se
  // va a borrar: no se puede soltar una base a la que estás conectado.
  const mantenimiento = conBase(opciones.url, 'postgres');

  const soltar = await ejecutor({
    argv: opciones.canal.argv(
      'psql',
      '--dbname',
      mantenimiento,
      '--quiet',
      '--command',
      `DROP DATABASE IF EXISTS "${verificacion}" WITH (FORCE)`,
    ),
  });
  if (soltar.codigo !== 0) {
    throw new ErrorDeRespaldo(
      `No se pudo preparar la base de verificación.\n  ${redactar(soltar.stderr)}`,
    );
  }

  const crear = await ejecutor({
    argv: opciones.canal.argv(
      'psql',
      '--dbname',
      mantenimiento,
      '--quiet',
      '--command',
      `CREATE DATABASE "${verificacion}"`,
    ),
  });
  if (crear.codigo !== 0) {
    throw new ErrorDeRespaldo(
      `No se pudo crear la base de verificación.\n  ${redactar(crear.stderr)}`,
    );
  }

  const destino = conBase(opciones.url, verificacion);

  const restaurar = await ejecutor({
    argv: opciones.canal.argv('pg_restore', '--dbname', destino, '--no-owner', '--exit-on-error'),
    desdeArchivo: opciones.archivo,
  });

  if (restaurar.codigo !== 0) {
    throw new ErrorDeRespaldo(
      `pg_restore terminó con código ${String(restaurar.codigo)}.\n` +
        `  orden: ${restaurar.orden}\n  ${redactar(restaurar.stderr)}`,
    );
  }

  const bd = crearConsultador(destino);
  try {
    const restauradas = await recuentoDeFilas(bd);
    const diferencias = compararRecuentos(manifiesto.tablas, restauradas);

    return {
      ok: diferencias.length === 0 && sha256_coincide,
      archivo: opciones.archivo,
      sha256_coincide,
      base_de_verificacion: verificacion,
      diferencias,
      tablas_comprobadas: restauradas.length,
      filas_comprobadas: restauradas.reduce((s, r) => s + r.filas, 0),
    };
  } finally {
    await bd.cerrar();
  }
}

/**
 * Borra los respaldos más viejos que la retención.
 *
 * Una carpeta de respaldos que crece sin límite acaba llenando el disco del
 * anfitrión, y el primer síntoma de eso es que PostgreSQL deja de aceptar
 * escrituras. Es decir: el respaldo mal operado provoca la avería.
 */
export async function podar(
  carpeta: string = CONFIG.carpeta,
  retencionDias: number = CONFIG.retencion_dias,
  ahora: Date = new Date(),
): Promise<readonly string[]> {
  let entradas: readonly string[];
  try {
    entradas = await readdir(carpeta);
  } catch {
    return [];
  }

  const limite = ahora.getTime() - retencionDias * 24 * 3600 * 1000;
  const borrados: string[] = [];

  for (const entrada of entradas) {
    if (!entrada.endsWith('.dump')) continue;

    const ruta = join(carpeta, entrada);
    const { mtimeMs } = await stat(ruta);
    if (mtimeMs >= limite) continue;

    await unlink(ruta);
    // El manifiesto se va con su volcado: uno sin el otro no sirve para nada, y
    // dejarlo suelto haría creer que hay un respaldo donde ya no hay.
    await unlink(manifiestoDe(ruta)).catch(() => undefined);
    borrados.push(ruta);
  }

  return borrados;
}

export const RESPALDOS = CONFIG;
