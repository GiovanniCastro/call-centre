// Ejecutar una herramienta externa, con lo que sale y lo que falla.
//
// El respaldo no se implementa en TypeScript: se hace con `pg_dump` y
// `pg_restore`, que son las herramientas que PostgreSQL publica para esto y las
// únicas que garantizan que lo restaurado es lo volcado. Un exportador propio
// escrito a mano sería un formato nuevo que nadie más sabe leer y que nadie ha
// probado contra una base de verdad — justo lo contrario de lo que un respaldo
// tiene que ser.
//
// Este módulo es la envoltura mínima para llamarlas: argumentos como lista
// —nunca una cadena que un intérprete de órdenes vuelva a partir—, y los flujos
// conectados a archivos cuando hace falta, que es lo que permite que el volcado
// funcione igual con las herramientas en el PATH que dentro del contenedor.

import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';

import { redactar } from './secretos.ts';

export type Ejecucion = {
  /** Programa y argumentos, ya separados. Nunca una línea de órdenes. */
  readonly argv: readonly string[];
  /** Si se indica, la salida estándar va a este archivo en lugar de a memoria. */
  readonly haciaArchivo?: string;
  /** Si se indica, este archivo se entrega por la entrada estándar. */
  readonly desdeArchivo?: string;
  readonly entorno?: Readonly<Record<string, string | undefined>>;
};

export type Salida = {
  readonly codigo: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** La orden tal como se puede enseñar: **redactada**. */
  readonly orden: string;
};

export class ErrorDeProceso extends Error {
  override readonly name = 'ErrorDeProceso';
  readonly salida: Salida;

  constructor(mensaje: string, salida: Salida) {
    super(mensaje);
    this.salida = salida;
  }
}

/**
 * Cómo se enseña una orden en un mensaje o en la consola.
 *
 * Siempre redactada, porque las cadenas de conexión de PostgreSQL llevan la
 * contraseña dentro y aquí van como argumento. Este es el motivo por el que la
 * capa de secretos se construyó antes que esta: sin ella, el primer fallo de
 * conexión imprime la contraseña de producción en el registro del anfitrión.
 */
export function comoTexto(argv: readonly string[]): string {
  return redactar(argv.join(' '));
}

/** Ejecuta y espera. No lanza por código distinto de cero: eso lo decide quien llama. */
export function ejecutar(e: Ejecucion): Promise<Salida> {
  const [programa, ...argumentos] = e.argv;
  const orden = comoTexto(e.argv);

  if (programa === undefined) {
    throw new ErrorDeProceso('Ejecución sin programa', {
      codigo: null,
      stdout: '',
      stderr: '',
      orden,
    });
  }

  return new Promise<Salida>((resolver) => {
    const hijo = spawn(programa, argumentos, {
      // `windowsHide` para que no parpadee una consola por cada llamada en
      // Windows, que es la máquina de desarrollo de este proyecto.
      windowsHide: true,
      env: { ...process.env, ...e.entorno } as NodeJS.ProcessEnv,
    });

    let stdout = '';
    let stderr = '';

    if (e.haciaArchivo !== undefined) {
      const archivo = createWriteStream(e.haciaArchivo);
      hijo.stdout.pipe(archivo);
    } else {
      hijo.stdout.on('data', (trozo: Buffer) => {
        stdout += trozo.toString('utf8');
      });
    }

    hijo.stderr.on('data', (trozo: Buffer) => {
      stderr += trozo.toString('utf8');
    });

    if (e.desdeArchivo !== undefined) {
      createReadStream(e.desdeArchivo).pipe(hijo.stdin);
    } else {
      hijo.stdin.end();
    }

    hijo.on('error', (error) => {
      // Programa que no existe. Es un caso normal aquí —así se descubre que
      // `pg_dump` no está en el PATH— y por eso se resuelve con código `null` en
      // lugar de lanzar: quien llama decide si probar por otra vía.
      resolver({ codigo: null, stdout, stderr: `${stderr}${String(error.message)}`, orden });
    });

    // `close` y no `exit`: `exit` salta cuando el proceso termina, pero los
    // flujos pueden seguir vaciándose después. Con un volcado escribiéndose a un
    // archivo, resolver en `exit` devolvería el control con bytes todavía en
    // camino, y lo siguiente que haría quien llama es calcular la suma de
    // verificación de un archivo incompleto.
    hijo.on('close', (codigo) => {
      resolver({ codigo, stdout, stderr: redactar(stderr), orden });
    });
  });
}
