// Criterio de aceptación central de la fase 0:
//
//   «Existe una prueba que falla si una ruta de ejecución termina sin emitir
//    evento, y otra que falla si emite dos.»
//
// Más las restricciones estructurales del esquema, que son los invariantes 1 y 3
// hechos forma de dato en lugar de prosa.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EsquemaEvento,
  esDesvioDeEjecucion,
  esEscaladoAHumano,
  esSensibilidadAlta,
  esViolacionDePerimetro,
  proporcionDeSustento,
  type Evento,
} from '../src/telemetry/evento.ts';
import { EmisorEnMemoria, ErrorDeEvento } from '../src/telemetry/emisor.ts';
import { ErrorDeInstrumentacion, verificarLote, vigilarCaso } from '../src/telemetry/arnes.ts';

function evento(parches: Partial<Evento> = {}): Evento {
  const base: Evento = {
    version_esquema: 1,
    evento_id: crypto.randomUUID(),
    caso_id: 'caso-1',
    marca_tiempo: '2026-07-31T10:00:00.000Z',
    canal: 'whatsapp',
    clase_tarea: 'catalogo',
    clase_sensibilidad: 'baja',
    destino_ejecucion: 'local',
    desvio_ejecucion: 'ninguno',
    motivo_desvio: null,
    resultado: 'resuelto',
    motivo_escalado: null,
    motivo_decision: 'catálogo con sensibilidad baja: se resuelve en local',
    hubo_egreso: false,
    destinos_egreso: [],
    fuentes: ['frag-7'],
    sustento: { campos_totales: 3, campos_con_procedencia: 3 },
    latencia_ms: 820,
    tokens_entrada: 400,
    tokens_salida: 120,
    modelo: 'llama3.1:8b',
    costo: 0.0004,
    costo_provisional: true,
    precios_actualizados: '2026-07-31',
  };
  return { ...base, ...parches };
}

function rechaza(parches: Partial<Evento>, campo: string): void {
  const resultado = EsquemaEvento.safeParse(evento(parches));
  assert.equal(resultado.success, false, `esperaba que el esquema rechazara ${campo}`);
  if (!resultado.success) {
    assert.ok(
      resultado.error.issues.some((i) => i.path.join('.') === campo),
      `esperaba un problema en «${campo}», llegaron: ${resultado.error.issues
        .map((i) => i.path.join('.'))
        .join(', ')}`,
    );
  }
}

describe('el arnés de instrumentación — invariante 5', () => {
  test('una ruta que emite exactamente un evento pasa y devuelve su resultado', async () => {
    const emisor = new EmisorEnMemoria();

    const salida = await vigilarCaso(emisor, 'caso-1', async (e) => {
      e.emitir(evento());
      return 'listo';
    });

    assert.equal(salida, 'listo');
    assert.equal(emisor.deCaso('caso-1').length, 1);
  });

  test('FALLA si la ruta termina sin emitir su evento', async () => {
    const emisor = new EmisorEnMemoria();

    await assert.rejects(
      vigilarCaso(emisor, 'caso-1', async () => 'terminé sin instrumentar'),
      (error: unknown) =>
        error instanceof ErrorDeInstrumentacion &&
        error.emitidos === 0 &&
        /sin emitir su evento/.test(error.message),
    );
  });

  test('FALLA si la ruta emite dos eventos del mismo caso', async () => {
    const emisor = new EmisorEnMemoria();

    await assert.rejects(
      vigilarCaso(emisor, 'caso-1', async (e) => {
        e.emitir(evento());
        e.emitir(evento({ evento_id: crypto.randomUUID() }));
      }),
      (error: unknown) => error instanceof ErrorDeInstrumentacion && error.emitidos === 2,
    );
  });

  test('FALLA si la ruta revienta sin instrumentar, y conserva el error original', async () => {
    // Las rutas de error son justamente las que se olvidan de emitir.
    const emisor = new EmisorEnMemoria();
    const original = new Error('el proveedor devolvió 503');

    await assert.rejects(
      vigilarCaso(emisor, 'caso-1', async () => {
        throw original;
      }),
      (error: unknown) =>
        error instanceof ErrorDeInstrumentacion &&
        error.emitidos === 0 &&
        error.cause === original,
    );
  });

  test('una ruta que revienta pero sí instrumenta propaga su error tal cual', async () => {
    const emisor = new EmisorEnMemoria();
    const original = new Error('el proveedor devolvió 503');

    await assert.rejects(
      vigilarCaso(emisor, 'caso-1', async (e) => {
        e.emitir(evento({ resultado: 'bloqueado', clase_tarea: 'ambiguo' }));
        throw original;
      }),
      (error: unknown) => error === original,
    );
    assert.equal(emisor.deCaso('caso-1').length, 1);
  });

  test('FALLA si la ruta atribuye su evento a otro caso', async () => {
    const emisor = new EmisorEnMemoria();

    await assert.rejects(
      vigilarCaso(emisor, 'caso-1', async (e) => {
        e.emitir(evento({ caso_id: 'caso-2' }));
      }),
      (error: unknown) =>
        error instanceof ErrorDeInstrumentacion && /otros casos/.test(error.message),
    );
  });

  test('verificarLote detecta ausencias, duplicados e intrusos', () => {
    const uno = evento({ caso_id: 'a' });
    const dos = evento({ caso_id: 'b', evento_id: crypto.randomUUID() });

    assert.doesNotThrow(() => verificarLote([uno, dos], ['a', 'b']));

    assert.throws(() => verificarLote([uno], ['a', 'b']), /sin evento: b/);
    assert.throws(
      () => verificarLote([uno, { ...uno, evento_id: crypto.randomUUID() }], ['a']),
      /duplicados: a×2/,
    );
    assert.throws(() => verificarLote([uno, dos], ['a']), /no esperados: b/);
  });
});

describe('el esquema del evento — invariantes hechos forma de dato', () => {
  test('un evento bien formado valida', () => {
    assert.equal(EsquemaEvento.safeParse(evento()).success, true);
  });

  test('invariante 1: una tarea factual no se resuelve sin fuentes', () => {
    rechaza({ clase_tarea: 'catalogo', resultado: 'resuelto', fuentes: [] }, 'fuentes');
    rechaza({ clase_tarea: 'extraccion', resultado: 'resuelto', fuentes: [] }, 'fuentes');
    rechaza({ clase_tarea: 'agendamiento', resultado: 'resuelto', fuentes: [] }, 'fuentes');

    // Un saludo sí puede resolverse sin fuentes: no afirma nada del negocio.
    assert.equal(
      EsquemaEvento.safeParse(
        evento({ clase_tarea: 'saludo', resultado: 'resuelto', fuentes: [], sustento: null }),
      ).success,
      true,
    );

    // Y una tarea factual sin fuentes puede escalar: eso es cumplir la regla.
    assert.equal(
      EsquemaEvento.safeParse(
        evento({
          clase_tarea: 'catalogo',
          resultado: 'escalado_humano',
          motivo_escalado: 'sin fuente por encima del umbral',
          fuentes: [],
          sustento: null,
        }),
      ).success,
      true,
    );
  });

  test('invariante 3: no se puede declarar egreso sin decir hacia dónde', () => {
    rechaza({ hubo_egreso: true, destinos_egreso: [] }, 'destinos_egreso');
    rechaza({ hubo_egreso: false, destinos_egreso: ['api.anthropic.com'] }, 'destinos_egreso');
  });

  test('todo desvío lleva su motivo, y sin desvío no hay motivo huérfano', () => {
    rechaza({ desvio_ejecucion: 'local_a_nube', motivo_desvio: null }, 'motivo_desvio');
    rechaza({ desvio_ejecucion: 'ninguno', motivo_desvio: 'porque sí' }, 'motivo_desvio');
  });

  test('un caso escalado a un humano llega con su motivo', () => {
    rechaza({ resultado: 'escalado_humano', motivo_escalado: null }, 'motivo_escalado');
  });

  test('el sustento es una proporción: el numerador no excede al denominador', () => {
    rechaza({ sustento: { campos_totales: 2, campos_con_procedencia: 3 } }, 'sustento');
  });

  test('el emisor rechaza un evento inválido en lugar de guardarlo', () => {
    const emisor = new EmisorEnMemoria();
    assert.throws(
      () => emisor.emitir(evento({ hubo_egreso: true, destinos_egreso: [] })),
      ErrorDeEvento,
    );
    assert.equal(emisor.emitidos.length, 0);
  });
});

describe('los derivadores — reconciliación (R-002)', () => {
  test('un desvío de local a nube NO es un escalado a humano', () => {
    const desviado = evento({
      destino_ejecucion: 'nube',
      desvio_ejecucion: 'local_a_nube',
      motivo_desvio: 'el modelo local excedió el tiempo máximo',
      resultado: 'resuelto',
      hubo_egreso: true,
      destinos_egreso: ['api.anthropic.com'],
      modelo: 'claude-opus-5',
    });

    assert.equal(esDesvioDeEjecucion(desviado), true);
    assert.equal(esEscaladoAHumano(desviado), false);
  });

  test('el enum colapsado producía dos cifras para lo mismo; el desdoblado no puede', () => {
    // Este es el defecto que trae la maqueta del panel: 41 escalados a humano en
    // el KPI y 17 en el reparto del enrutador, sobre los mismos 190 casos. Ambas
    // cifras internamente coherentes y mutuamente incompatibles.
    //
    // La prueba reconstruye el enum anterior a R-002 —uno solo, donde el escalado
    // a humano y el desvío de ejecución caían en el mismo valor— y comprueba que
    // dos lecturas igual de razonables de ese campo dan números distintos. Luego
    // comprueba que sobre los campos desdoblados no hay dos lecturas posibles.
    //
    // Si alguien vuelve a colapsar los campos, la primera mitad deja de fallar y
    // esta prueba se cae.
    const lote: Evento[] = [
      evento({ caso_id: 'a', resultado: 'resuelto' }),
      evento({
        caso_id: 'b',
        resultado: 'escalado_humano',
        motivo_escalado: 'fuera de alcance',
        clase_tarea: 'queja',
        fuentes: [],
        sustento: null,
      }),
      evento({
        caso_id: 'c',
        resultado: 'resuelto',
        destino_ejecucion: 'nube',
        desvio_ejecucion: 'local_a_nube',
        motivo_desvio: 'el modelo local excedió el tiempo máximo',
        hubo_egreso: true,
        destinos_egreso: ['api.anthropic.com'],
        modelo: 'claude-opus-5',
      }),
      evento({
        caso_id: 'd',
        resultado: 'resuelto',
        destino_ejecucion: 'nube',
        desvio_ejecucion: 'local_a_nube',
        motivo_desvio: 'sustento por debajo del umbral en local',
        hubo_egreso: true,
        destinos_egreso: ['api.anthropic.com'],
        modelo: 'claude-opus-5',
      }),
    ];

    // El campo del plan original: `resultado ∈ {resuelto, escalado, descartado}`.
    // Los dos escalados del sistema caen en el mismo valor.
    const comoEnElPlanOriginal = (e: Evento): 'resuelto' | 'escalado' | 'otro' => {
      if (esEscaladoAHumano(e) || esDesvioDeEjecucion(e)) return 'escalado';
      if (e.resultado === 'resuelto') return 'resuelto';
      return 'otro';
    };

    // Dos pantallas leen ese campo. Ninguna se equivoca; el campo es ambiguo.
    const kpiSegunPlanOriginal = lote.filter((e) => comoEnElPlanOriginal(e) === 'escalado').length;
    const repartoSegunPlanOriginal = lote.filter(
      (e) => comoEnElPlanOriginal(e) === 'escalado' && e.destino_ejecucion !== 'nube',
    ).length;

    assert.notEqual(
      kpiSegunPlanOriginal,
      repartoSegunPlanOriginal,
      'con el enum colapsado las dos cifras deberían divergir; si coinciden, ' +
        'el caso de prueba ya no reproduce el defecto que motivó R-002',
    );
    assert.equal(kpiSegunPlanOriginal, 3);
    assert.equal(repartoSegunPlanOriginal, 1);

    // Con los campos desdoblados no hay dos lecturas: cada hecho tiene el suyo.
    assert.equal(lote.filter(esEscaladoAHumano).length, 1);
    assert.equal(lote.filter(esDesvioDeEjecucion).length, 2);

    // Y los dos conjuntos son disjuntos: ningún caso cuenta en ambos.
    assert.equal(lote.filter((e) => esEscaladoAHumano(e) && esDesvioDeEjecucion(e)).length, 0);

    // El total cuadra: cada caso tiene exactamente un `resultado`.
    const porResultado = new Map<string, number>();
    for (const e of lote) porResultado.set(e.resultado, (porResultado.get(e.resultado) ?? 0) + 1);
    assert.equal([...porResultado.values()].reduce((a, b) => a + b, 0), lote.length);
  });

  test('el vigía de perímetro puede expresar su numerador y su denominador', () => {
    // Un contador de fugas en cero con denominador cero no prueba nada. El
    // esquema permite representar una fuga a propósito: si fuera inexpresable,
    // el vigía de la fase 4B-1 tendría un contador que jamás podría subir.
    const retenido = evento({ caso_id: 'a', clase_sensibilidad: 'alta' });
    const fugado = evento({
      caso_id: 'b',
      clase_sensibilidad: 'alta',
      destino_ejecucion: 'nube',
      hubo_egreso: true,
      destinos_egreso: ['api.anthropic.com'],
      modelo: 'claude-opus-5',
    });

    const lote = [retenido, fugado];
    const denominador = lote.filter(esSensibilidadAlta).length;
    const fugas = lote.filter(esViolacionDePerimetro).length;

    assert.equal(denominador, 2);
    assert.equal(fugas, 1);
    assert.equal(esViolacionDePerimetro(retenido), false);
  });

  test('el sustento se lee como proporción y tolera el denominador cero', () => {
    assert.equal(proporcionDeSustento(evento()), 1);
    assert.equal(
      proporcionDeSustento(evento({ sustento: { campos_totales: 4, campos_con_procedencia: 3 } })),
      0.75,
    );
    assert.equal(proporcionDeSustento(evento({ sustento: null })), null);
    assert.equal(
      proporcionDeSustento(evento({ sustento: { campos_totales: 0, campos_con_procedencia: 0 } })),
      null,
    );
  });
});
