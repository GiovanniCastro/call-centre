// Fase 4 — la cola de escalado, contra PostgreSQL de verdad.
//
// Criterio de aceptación: **el caso escalado conserva el hilo completo**. Eso no
// se puede probar con un doble: probaría que el doble guarda lo que le dimos. Lo
// que hay que saber es que el hilo entero sobrevive al viaje de ida y vuelta por
// JSONB, con su orden y sin perder líneas.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearConsultador, type Consultador } from '../src/repos/cliente.ts';
import { migrar } from '../src/repos/migrar.ts';
import { alcanceDeContacto } from '../src/repos/alcance.ts';
import { alcanceParaContacto } from '../src/repos/conversaciones.ts';
import {
  encolarEscalado,
  escaladosDe,
  HiloVacio,
  pendientesDe,
  resolverEscalado,
  type LineaDeHilo,
} from '../src/repos/escalados.ts';

const URL_BD = process.env['DATABASE_URL'];

const HILO: readonly LineaDeHilo[] = [
  { quien: 'cliente', texto: 'Hola, ¿cuánto cuesta el seguro de inquilino?', momento: '2026-08-01T10:00:00.000Z' },
  { quien: 'agente', texto: 'Desde $5 al mes.', momento: '2026-08-01T10:00:04.000Z' },
  { quien: 'cliente', texto: '¿Y si tengo una moto en el garaje?', momento: '2026-08-01T10:00:30.000Z' },
  { quien: 'sistema', texto: 'verificador: sin fuente para «motocicletas»', momento: '2026-08-01T10:00:31.000Z' },
];

describe(
  'la cola de escalado',
  { skip: URL_BD === undefined ? 'no hay DATABASE_URL' : false },
  () => {
    let bd: Consultador;

    before(async () => {
      bd = crearConsultador(URL_BD ?? '');
      await migrar(bd);
    });

    after(async () => {
      await bd.cerrar();
    });

    async function alcanceNuevo(sufijo: string) {
      return alcanceParaContacto(bd, 'telegram', `escalado-${process.pid}-${sufijo}`, 'Ana');
    }

    test('EL CASO ESCALADO CONSERVA EL HILO COMPLETO', async () => {
      const alcance = await alcanceNuevo('hilo');

      await encolarEscalado(alcance, bd, {
        caso_id: 'caso-001',
        motivo: 'sustento 50 % por debajo del umbral',
        clase: 'sin_sustento',
        transcripcion: HILO,
        fuentes: [{ fragmento_id: 'x:1:0', puntuacion: 0.71 }],
        rechazados: ['x:1:0: el valor «motocicletas» no aparece literalmente'],
        sustento: 0.5,
      });

      const cola = await escaladosDe(alcance, bd);
      assert.equal(cola.length, 1);

      // El hilo entero, en orden, sin perder líneas. Un resumen no es un
      // escalado, es un aviso.
      const primero = cola[0];
      assert.ok(primero !== undefined);
      assert.deepEqual(primero.transcripcion, HILO);
      assert.equal(primero.sustento, 0.5);
      assert.equal(primero.rechazados.length, 1);
    });

    test('un escalado SIN hilo se rechaza en vez de guardarse', async () => {
      const alcance = await alcanceNuevo('vacio');

      await assert.rejects(
        () =>
          encolarEscalado(alcance, bd, {
            caso_id: 'caso-002',
            motivo: 'x',
            clase: 'sin_sustento',
            transcripcion: [],
          }),
        HiloVacio,
      );
    });

    test('UN CONTACTO NO VE LA COLA DE OTRO', async () => {
      const mia = await alcanceNuevo('mia');
      const ajena = await alcanceNuevo('ajena');

      await encolarEscalado(mia, bd, {
        caso_id: 'solo-mio',
        motivo: 'x',
        clase: 'sin_sustento',
        transcripcion: HILO,
      });

      const deOtro = await escaladosDe(ajena, bd);
      assert.ok(!deOtro.some((e) => e.caso_id === 'solo-mio'));
    });

    test('un alcance fabricado a mano con otro identificador no sirve', async () => {
      const mia = await alcanceNuevo('fabricado');
      await encolarEscalado(mia, bd, {
        caso_id: 'protegido',
        motivo: 'x',
        clase: 'sin_sustento',
        transcripcion: HILO,
      });

      const inventado = alcanceDeContacto('00000000-0000-4000-8000-000000000000', 'telegram');
      assert.deepEqual([...(await escaladosDe(inventado, bd))], []);
    });

    test('resolver exige operador, y solo dentro del propio alcance', async () => {
      const alcance = await alcanceNuevo('resolver');
      const id = await encolarEscalado(alcance, bd, {
        caso_id: 'caso-003',
        motivo: 'x',
        clase: 'sin_sustento',
        transcripcion: HILO,
      });

      await assert.rejects(() => resolverEscalado(alcance, bd, id, '  '), /no se puede auditar/);

      const ajena = await alcanceNuevo('ajena-resolver');
      assert.equal(await resolverEscalado(ajena, bd, id, 'operador-1'), false);
      assert.equal(await resolverEscalado(alcance, bd, id, 'operador-1'), true);
      assert.equal(await pendientesDe(alcance, bd), 0);
    });

    test('las clases de escalado del código y de la base coinciden', async () => {
      const alcance = await alcanceNuevo('clase');

      // La base tiene su propio CHECK. Si el código admitiera una clase que la
      // base no, el fallo llegaría como error de restricción a mitad de una
      // transacción y no diría lo que pasó.
      await assert.rejects(
        () =>
          bd.consultar(
            `INSERT INTO escalados (id, contacto_id, caso_id, motivo, clase, transcripcion)
             VALUES (gen_random_uuid(), $1, 'x', 'y', 'clase_inventada', '[]'::jsonb)`,
            [alcance.contacto_id],
          ),
        /escalados_clase_valida/,
      );
    });
  },
);
