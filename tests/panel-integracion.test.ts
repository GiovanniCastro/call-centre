// Criterio de aceptación de la fase 6:
//
//   «Toda cifra del panel se rastrea hasta eventos reales en PostgreSQL.»
//
// Un doble de base de datos no puede probar esto: probaría que el doble devuelve
// lo que le dijimos. Hace falta PostgreSQL de verdad, y por eso estas pruebas
// corren solo cuando hay `DATABASE_URL`.
//
// El recorrido es el completo y a propósito: emitir → volcar → agregar → derivar.
// Comprobar la derivación con agregados a mano dejaría sin probar el trozo donde
// más fácil es equivocarse — el SQL.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { crearConsultador, type Consultador } from '../src/repos/cliente.ts';
import { migrar } from '../src/repos/migrar.ts';
import { alcanceDeContacto } from '../src/repos/alcance.ts';
import { alcanceParaContacto } from '../src/repos/conversaciones.ts';
import { EmisorPostgres } from '../src/telemetry/emisor-postgres.ts';
import {
  egresoPorSensibilidad,
  latencias,
  porDestino,
  porMotivoDeEscalado,
  porResultado,
  sustentoAgregado,
  type Ventana,
} from '../src/repos/agregados.ts';
import { derivar, type Agregados } from '../proyeccion/derivar.ts';
import { decidirAcceso, registrarAcceso, accesosARecurso } from '../src/repos/accesos.ts';
import type { Evento } from '../src/telemetry/evento.ts';

const URL_BD = process.env['DATABASE_URL'];

const SUITE = randomUUID().slice(0, 8);
const VENTANA: Ventana = {
  desde: '2030-01-01T00:00:00.000Z',
  hasta: '2030-02-01T00:00:00.000Z',
};

function evento(n: number, parcial: Partial<Evento> = {}): Evento {
  return {
    evento_id: randomUUID(),
    version_esquema: 1,
    caso_id: `${SUITE}:${n}`,
    marca_tiempo: `2030-01-${String(1 + (n % 27)).padStart(2, '0')}T10:00:00.000Z`,
    canal: 'lote',
    clase_tarea: 'catalogo',
    clase_sensibilidad: 'baja',
    destino_ejecucion: 'local',
    desvio_ejecucion: 'ninguno',
    motivo_desvio: null,
    resultado: 'resuelto',
    motivo_escalado: null,
    motivo_decision: 'regla: catálogo va a local',
    hubo_egreso: false,
    destinos_egreso: [],
    fuentes: ['f141:8f86f9b0:0001'],
    sustento: { campos_totales: 2, campos_con_procedencia: 2 },
    latencia_ms: 1000 + n,
    tokens_entrada: 100,
    tokens_salida: 50,
    modelo: 'gemma4:latest',
    costo: 0,
    costo_provisional: true,
    precios_actualizados: '2026-07-31',
    ...parcial,
  } as Evento;
}

describe('el panel sobre histórico real', { skip: URL_BD === undefined }, () => {
  let bd: Consultador;
  let contacto_id: string;

  before(async () => {
    bd = crearConsultador(URL_BD ?? '');
    await migrar(bd);
    const alcance = await alcanceParaContacto(bd, 'lote', `panel-${SUITE}`, null);
    contacto_id = alcance.contacto_id;
  });

  after(async () => {
    // Se limpia lo de esta suite y solo lo de esta suite: borrar la tabla
    // rompería una ejecución en paralelo, que es justo lo que el CI hace.
    await bd.consultar('DELETE FROM eventos WHERE caso_id LIKE $1', [`${SUITE}:%`]);
    await bd.consultar('DELETE FROM accesos_panel WHERE operador = $1', [`op-${SUITE}`]);
    await bd.cerrar();
  });

  test('EMITIR → VOLCAR → AGREGAR → DERIVAR: la cifra llega entera', async () => {
    const alcance = alcanceDeContacto(contacto_id, 'lote');
    const emisor = new EmisorPostgres({ bd, alcance, contacto_id });

    // 6 resueltos, 3 escalados, 1 bloqueado.
    for (let n = 0; n < 6; n += 1) emisor.emitir(evento(n));
    for (let n = 6; n < 9; n += 1) {
      emisor.emitir(
        evento(n, {
          resultado: 'escalado_humano',
          motivo_escalado: 'sustento por debajo del umbral',
        }),
      );
    }
    emisor.emitir(evento(9, { resultado: 'bloqueado' }));

    assert.equal(emisor.pendientes(), 10);
    const volcado = await emisor.volcar();
    assert.equal(volcado.escritos, 10, `errores: ${volcado.errores.join(' | ')}`);
    assert.equal(emisor.pendientes(), 0);

    const agregados = await recoger(bd);
    const p = derivar(agregados, '2030-02-01T00:00:00.000Z');

    // Las cifras del panel, rastreadas hasta las filas que acabamos de escribir.
    assert.equal(p.kpi.resueltos, 6);
    assert.equal(p.kpi.escalados_a_humano, 3);
    assert.equal(p.kpi.bloqueados, 1);
    assert.equal(p.kpi.casos, 10);

    // Y LA RECONCILIACIÓN, contra la base de verdad y no contra un doble.
    assert.equal(p.reparto.escalados_a_humano, p.kpi.escalados_a_humano);
  });

  test('volcar dos veces no duplica: cada caso cuenta una vez', async () => {
    // El arnés garantiza un evento por caso; esto cubre el otro lado — un
    // reintento de escritura tras un corte no puede doblar cada cifra del panel.
    const alcance = alcanceDeContacto(contacto_id, 'lote');
    const emisor = new EmisorPostgres({ bd, alcance, contacto_id });

    const repetido = evento(100);
    emisor.emitir(repetido);
    await emisor.volcar();

    emisor.emitir(repetido);
    const segundo = await emisor.volcar();

    assert.equal(segundo.escritos, 0);
    assert.equal(segundo.repetidos, 1);
  });

  test('UN AGREGADO NO PUEDE DEVOLVER UN IDENTIFICADOR, NI CONTRA LA BASE REAL', async () => {
    // La prueba estructural mira el SQL; esta mira lo que sale. Las dos hacen
    // falta: una consulta puede seleccionar solo columnas permitidas y aun así
    // devolver un `caso_id` si alguien lo mete en un alias.
    const filas = [
      ...(await porResultado(bd, VENTANA)),
      ...(await porDestino(bd, VENTANA)),
      ...(await egresoPorSensibilidad(bd, VENTANA)),
    ] as unknown as Record<string, unknown>[];

    assert.ok(filas.length > 0, 'no hay filas que comprobar');

    for (const fila of filas) {
      for (const columna of ['caso_id', 'contacto_id', 'conversacion_id', 'motivo_decision']) {
        assert.ok(!(columna in fila), `un agregado devolvió «${columna}»`);
      }
    }
  });

  test('el perímetro sale con denominador desde la base', async () => {
    const alcance = alcanceDeContacto(contacto_id, 'lote');
    const emisor = new EmisorPostgres({ bd, alcance, contacto_id });

    for (let n = 200; n < 204; n += 1) {
      emisor.emitir(evento(n, { clase_sensibilidad: 'alta' }));
    }
    await emisor.volcar();

    const p = derivar(await recoger(bd), '2030-02-01T00:00:00.000Z');
    const alta = p.perimetro.find((x) => x.clase_sensibilidad === 'alta');

    assert.equal(alta?.casos, 4);
    assert.equal(alta?.con_egreso, 0);
    assert.equal(alta?.como_texto, '4 de 4 retenidos');
  });

  test('EL ACCESO DE LECTURA QUEDA REGISTRADO, Y LA DENEGACIÓN TAMBIÉN', async () => {
    // El panel no tiene escrituras: si mirar no deja rastro, el registro está
    // vacío por construcción y no responde quién vio la conversación de quién.
    const concedido = await registrarAcceso(bd, {
      operador: `op-${SUITE}`,
      rol: 'trazas',
      accion: 'leer_traza',
      recurso: `trazas/${SUITE}:0`,
    });
    assert.equal(concedido.concedido, true);

    const denegado = await registrarAcceso(bd, {
      operador: `op-${SUITE}`,
      rol: 'metricas',
      accion: 'leer_traza',
      recurso: `trazas/${SUITE}:0`,
    });
    assert.equal(denegado.concedido, false);

    // «Quién miró esta conversación» — la pregunta que más importa.
    const quienes = await accesosARecurso(bd, `trazas/${SUITE}:0`);
    assert.equal(quienes.length, 2);
    assert.deepEqual(
      quienes.map((x) => x.concedido).sort(),
      [false, true],
    );
  });

  test('la decisión y el registro no pueden discrepar', async () => {
    // `registrarAcceso` devuelve el veredicto que anota: no hay forma de obtener
    // la decisión sin pasar por la función que la escribe.
    const intento = {
      operador: `op-${SUITE}`,
      rol: 'metricas' as const,
      accion: 'leer_traza' as const,
      recurso: `trazas/${SUITE}:1`,
    };

    const registrado = await registrarAcceso(bd, intento);
    assert.equal(registrado.concedido, decidirAcceso(intento).concedido);
  });
});

async function recoger(bd: Consultador): Promise<Agregados> {
  const [resultado, destino, egreso, escalados, sustento, latencia] = await Promise.all([
    porResultado(bd, VENTANA),
    porDestino(bd, VENTANA),
    egresoPorSensibilidad(bd, VENTANA),
    porMotivoDeEscalado(bd, VENTANA),
    sustentoAgregado(bd, VENTANA),
    latencias(bd, VENTANA),
  ]);

  return {
    ventana: VENTANA,
    por_resultado: resultado,
    por_destino: destino,
    egreso,
    escalados,
    sustento,
    latencias: latencia,
    supuestos_costeo: { estado: 'PROVISIONAL' },
    costo_provisional: destino.some((d) => d.costo_provisional),
  };
}
