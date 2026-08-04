// Fase 8 · «Una restauración de respaldo se ha ejecutado y verificado.»
//
// La prueba que cuenta es la última de este archivo: vuelca PostgreSQL de
// verdad, lo restaura en una base aparte y compara los recuentos tabla por
// tabla. Las demás existen para lo que esa no puede provocar a voluntad —una
// tabla que vuelve vacía, un archivo alterado, una base de verificación sucia—
// y para la que ninguna base debería permitir nunca: restaurar encima de
// producción.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  baseDe,
  compararRecuentos,
  conBase,
  descubrirCanal,
  ErrorDeRespaldo,
  manifiestoDe,
  podar,
  respaldar,
  restaurarYVerificar,
  type Canal,
  type Manifiesto,
  type RecuentoRespaldado,
} from '../src/operacion/respaldo.ts';
import { ejecutar } from '../src/operacion/procesos.ts';
import { crearConsultador } from '../src/repos/cliente.ts';
import { migrar } from '../src/repos/migrar.ts';
import { recuentoDeFilas } from '../src/repos/inventario.ts';

const URL_BD = process.env['DATABASE_URL'];

function respaldada(
  tabla: string,
  filas: number,
  alTerminar = filas,
): RecuentoRespaldado {
  return { tabla, filas, volatil: alTerminar !== filas, filas_al_terminar: alTerminar };
}

describe('la comparación de recuentos — la que decide si un respaldo sirve', () => {
  test('sin diferencias, no hay diferencias', () => {
    const diferencias = compararRecuentos(
      [respaldada('eventos', 120), respaldada('contactos', 4)],
      [
        { tabla: 'eventos', filas: 120 },
        { tabla: 'contactos', filas: 4 },
      ],
    );
    assert.deepEqual(diferencias, []);
  });

  test('DETECTA UNA TABLA QUE VUELVE VACÍA', () => {
    // El fallo más peligroso de una restauración: termina con código cero, el
    // esquema está entero, y una tabla no trae nada. Sin comparar recuentos, eso
    // pasa por éxito.
    const diferencias = compararRecuentos(
      [respaldada('eventos', 120)],
      [{ tabla: 'eventos', filas: 0 }],
    );

    assert.equal(diferencias.length, 1);
    assert.equal(diferencias[0]?.tabla, 'eventos');
    assert.equal(diferencias[0]?.tras_restaurar, 0);
  });

  test('detecta una tabla que no llegó a existir', () => {
    const diferencias = compararRecuentos([respaldada('escalados', 7)], []);
    assert.equal(diferencias[0]?.por_que, 'la tabla no existe tras restaurar');
  });

  test('detecta que la base de verificación no estaba limpia', () => {
    // Una tabla que aparece de la nada significa que quedaban restos de otra
    // ejecución. A partir de ahí la comparación no dice nada del respaldo, así
    // que tiene que fallar en vez de dar un aprobado que no significa nada.
    const diferencias = compararRecuentos(
      [respaldada('eventos', 5)],
      [
        { tabla: 'eventos', filas: 5 },
        { tabla: 'de_otra_ejecucion', filas: 3 },
      ],
    );

    assert.equal(diferencias.length, 1);
    assert.match(String(diferencias[0]?.por_que), /no estaba limpia/);
  });

  test('una tabla que se movió durante el volcado se acepta por intervalo', () => {
    // Respaldar un sistema en marcha no puede dar un fallo falso: el volcado
    // capturó un instante entre los dos recuentos. Un comprobante que falla
    // cuando todo está bien acaba ignorado.
    const enMovimiento = [respaldada('eventos', 100, 140)];

    assert.deepEqual(compararRecuentos(enMovimiento, [{ tabla: 'eventos', filas: 118 }]), []);

    const fuera = compararRecuentos(enMovimiento, [{ tabla: 'eventos', filas: 3 }]);
    assert.equal(fuera.length, 1, 'un valor fuera del intervalo tiene que seguir fallando');
    assert.match(String(fuera[0]?.por_que), /intervalo/);
  });
});

describe('las cadenas de conexión', () => {
  test('cambiar de base no toca lo demás', () => {
    const url = 'postgres://perimetro:clave@localhost:5432/perimetro';
    assert.equal(baseDe(url), 'perimetro');
    assert.equal(baseDe(conBase(url, 'perimetro_verificacion')), 'perimetro_verificacion');
    assert.ok(conBase(url, 'otra').startsWith('postgres://perimetro:clave@localhost:5432/'));
  });
});

describe('la restauración de prueba no puede tocar producción', () => {
  test('SE NIEGA A RESTAURAR SOBRE LA BASE DE ORIGEN', async () => {
    // La comprobación más importante del módulo: lo que viene después de ella
    // ejecuta DROP DATABASE. Un verificador de respaldos capaz de destruir la
    // base que protege sería un riesgo mayor que no verificar nada.
    const canal: Canal = {
      nombre: 'ruta',
      version: 'de mentira',
      argv: (h, ...a) => [h, ...a],
    };

    await assert.rejects(
      () =>
        restaurarYVerificar({
          url: 'postgres://u:c@localhost:5432/produccion',
          archivo: 'da-igual.dump',
          canal,
          baseDeVerificacion: 'produccion',
          // El ejecutor lanzaría si llegara a usarse: si esta prueba pasa por
          // aquí, es que la comprobación no detuvo nada.
          ejecutor: () => {
            throw new Error('no se debería haber ejecutado NADA');
          },
        }),
      (error: unknown) =>
        error instanceof ErrorDeRespaldo && /no puede ser la de producción/.test(error.message),
    );
  });
});

describe('la poda', () => {
  let carpeta = '';

  before(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'respaldos-'));
  });

  after(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  test('borra lo viejo, conserva lo reciente, y se lleva el manifiesto con su volcado', async () => {
    const viejo = join(carpeta, 'viejo.dump');
    const nuevo = join(carpeta, 'nuevo.dump');

    for (const archivo of [viejo, nuevo]) {
      await writeFile(archivo, 'x', 'utf8');
      await writeFile(manifiestoDe(archivo), '{}', 'utf8');
    }

    const hace30dias = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    await utimes(viejo, hace30dias, hace30dias);

    const borrados = await podar(carpeta, 14);

    assert.deepEqual(borrados, [viejo]);
    await assert.rejects(() => stat(viejo));
    // Un manifiesto huérfano haría creer que hay un respaldo donde ya no hay.
    await assert.rejects(() => stat(manifiestoDe(viejo)));
    await stat(nuevo);
    await stat(manifiestoDe(nuevo));
  });
});

// ── La prueba de verdad ─────────────────────────────────────────────────────
//
// Contra PostgreSQL real. Un doble aquí no probaría nada: probaría que el doble
// devuelve lo que le dijimos, y lo que hay que saber es que `pg_dump` y
// `pg_restore` —herramientas ajenas, versiones distintas, un contenedor de por
// medio— devuelven las filas que se llevaron.

describe(
  'el ciclo completo contra PostgreSQL',
  { skip: URL_BD === undefined ? 'no hay DATABASE_URL' : false },
  () => {
    let carpeta = '';
    let canal: Canal | null = null;

    /**
     * Base propia para esta prueba, y no la de desarrollo.
     *
     * La primera versión respaldaba `DATABASE_URL` directamente y falló de una
     * forma que merece constar: `node --test` corre los archivos en paralelo, y
     * la prueba de migraciones concurrentes crea y borra esquemas temporales.
     * `pg_dump` tomó su instantánea, fue a leer `migracion_concurrente_36320` y
     * ya no existía.
     *
     * Reintentar habría tapado el síntoma dejando la causa: dos pruebas
     * escribiendo sobre la misma base. Y bajarle el alcance a `pg_dump` para
     * esquivar esos esquemas sería peor todavía — un respaldo que ignora parte
     * de la base es exactamente el fallo que este módulo existe para no tener.
     * La base es de esta prueba y de nadie más.
     */
    const url = URL_BD === undefined ? '' : conBase(URL_BD, 'perimetro_respaldo_pruebas');

    before(async () => {
      carpeta = await mkdtemp(join(tmpdir(), 'respaldo-ciclo-'));
      canal = await descubrirCanal();
      if (canal === null || URL_BD === undefined) return;

      // Se crea desde cero en cada corrida: una base que arrastra el estado de
      // la anterior haría que los recuentos dijeran cosas distintas según qué
      // hubiera pasado antes.
      const mantenimiento = conBase(URL_BD, 'postgres');
      for (const orden of [
        `DROP DATABASE IF EXISTS "perimetro_respaldo_pruebas" WITH (FORCE)`,
        `CREATE DATABASE "perimetro_respaldo_pruebas"`,
      ]) {
        await ejecutar({
          argv: canal.argv('psql', '--dbname', mantenimiento, '--quiet', '--command', orden),
        });
      }

      const bd = crearConsultador(url);
      try {
        await migrar(bd);
      } finally {
        await bd.cerrar();
      }
    });

    after(async () => {
      await rm(carpeta, { recursive: true, force: true });
    });

    test('se encuentra pg_dump, en el PATH o en el contenedor', () => {
      assert.ok(
        canal !== null,
        'no hay pg_dump por ninguna vía: levanta los servicios con `npm run servicios`',
      );
      assert.match(canal?.version ?? '', /PostgreSQL/);
    });

    test('EL RESPALDO SE RESTAURA Y LAS FILAS ESTÁN TODAS', async () => {
      if (canal === null) return;

      // Una fila reconocible, para no depender de lo que hubiera en la base: si
      // esta aparece al otro lado, el ciclo movió datos de verdad.
      const marca = `respaldo-prueba-${String(Date.now())}`;
      const identidad = randomUUID();
      const bd = crearConsultador(url);
      try {
        await bd.consultar(
          `INSERT INTO contactos (id, canal, identificador_externo)
             VALUES ($1::uuid, 'lote', $2)
             ON CONFLICT (canal, identificador_externo) DO NOTHING`,
          [identidad, marca],
        );
      } finally {
        await bd.cerrar();
      }

      const manifiesto = await respaldar({ url, carpeta, canal });

      assert.ok(manifiesto.bytes > 0, 'el volcado salió vacío');
      assert.ok(manifiesto.tablas.length > 0, 'el manifiesto no registró ninguna tabla');
      assert.match(manifiesto.sha256, /^[0-9a-f]{64}$/);

      const verificacion = await restaurarYVerificar({
        url,
        archivo: manifiesto.archivo,
        canal,
        baseDeVerificacion: 'perimetro_verificacion_pruebas',
      });

      assert.deepEqual(
        verificacion.diferencias,
        [],
        'la restauración no devolvió las mismas filas que el respaldo se llevó',
      );
      assert.ok(verificacion.sha256_coincide);
      assert.ok(verificacion.ok);

      // Y la fila reconocible, del otro lado.
      const restaurada = crearConsultador(conBase(url, 'perimetro_verificacion_pruebas'));
      try {
        const filas = await restaurada.consultar<{ id: string }>(
          'SELECT id FROM contactos WHERE identificador_externo = $1',
          [marca],
        );
        assert.equal(filas.length, 1, 'la fila que se insertó antes del volcado no se restauró');

        // Y el inventario ve las mismas tablas por los dos lados.
        const tablas = await recuentoDeFilas(restaurada);
        assert.ok(tablas.some((t) => t.tabla === 'eventos'));
      } finally {
        await restaurada.cerrar();
      }
    });

    test('un volcado alterado en el disco se detecta antes de restaurarlo', async () => {
      if (canal === null) return;

      const manifiesto = await respaldar({ url, carpeta, canal });

      // Se altera el manifiesto en vez del volcado: cambiar el volcado haría
      // fallar a `pg_restore` por su cuenta, y entonces esta prueba no sabría si
      // lo que actuó fue la suma de verificación o la herramienta.
      const crudo = JSON.parse(await readFile(manifiestoDe(manifiesto.archivo), 'utf8')) as Manifiesto;
      await writeFile(
        manifiestoDe(manifiesto.archivo),
        JSON.stringify({ ...crudo, sha256: 'f'.repeat(64) }, null, 2),
        'utf8',
      );

      const verificacion = await restaurarYVerificar({
        url,
        archivo: manifiesto.archivo,
        canal,
        baseDeVerificacion: 'perimetro_verificacion_pruebas',
      });

      assert.equal(verificacion.sha256_coincide, false);
      assert.equal(verificacion.ok, false, 'un archivo que no es el que se creó no puede dar «ok»');
    });
  },
);
