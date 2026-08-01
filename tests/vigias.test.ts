// Fase 4B-1 — los vigías que detienen.
//
// Criterio que gobierna este archivo: **cada vigía tiene una prueba de inyección
// de fallo que demuestra que dispara.** Un vigía sin prueba de disparo es
// decoración — nadie sabe si el umbral está bien puesto hasta que algo lo cruza.
//
// Y el otro: ninguno depende de una llamada a un modelo para decidir. Se ve en
// los imports de este archivo, que no trae ninguno.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { recolector } from '../src/core/vigias/vigia.ts';
import { VigiaDePerimetro } from '../src/core/vigias/perimetro.ts';
import { VigiaDePresupuesto } from '../src/core/vigias/presupuesto.ts';
import { VigiaDeBucle } from '../src/core/vigias/bucle.ts';
import { vigiasDesde, VIGIAS } from '../src/core/vigias/config.ts';

describe('el vigía de perímetro', () => {
  test('DISPARA: un caso de sensibilidad alta que iba a salir se DETIENE', () => {
    const registro = recolector();
    const vigia = new VigiaDePerimetro(registro.registrar);

    const decision = vigia.puedeSalir('alta', true);

    assert.equal(decision.accion, 'detener');
    assert.equal(registro.actuaciones().length, 1);
    // Umbral, valor observado y acción: los tres, o el registro no permite
    // recalcular la decisión a mano.
    const acto = registro.actuaciones()[0];
    assert.equal(acto?.umbral, 0);
    assert.equal(acto?.valor_observado, 1);
    assert.equal(acto?.autoridad, 'detener');
  });

  test('EXPONE SU DENOMINADOR: «31 de 31 retenidos», no «0 fugas»', () => {
    const vigia = new VigiaDePerimetro();
    for (let i = 0; i < 31; i += 1) vigia.puedeSalir('alta', false);

    assert.deepEqual(vigia.recuento(), { altos: 31, retenidos: 31, escapados: 0 });
    assert.equal(vigia.comoTexto(), '31 de 31 retenidos');
  });

  test('sin casos altos NO afirma nada, en vez de decir «100 %»', () => {
    // Un cero con denominador cero puede querer decir «retuve todos» o «no llegó
    // ninguno». Enseñar 100 % sería una afirmación fuerte sacada de ninguna
    // observación.
    const vigia = new VigiaDePerimetro();
    vigia.puedeSalir('baja', true);

    assert.deepEqual(vigia.recuento(), { altos: 0, retenidos: 0, escapados: 0 });
    assert.match(vigia.comoTexto(), /no hay nada que afirmar/);
  });

  test('un caso de sensibilidad baja que sale no es asunto suyo', () => {
    const vigia = new VigiaDePerimetro();
    assert.equal(vigia.puedeSalir('baja', true).accion, 'seguir');
    assert.equal(vigia.recuento().altos, 0);
  });

  test('el umbral es cero y no se puede configurar de otra forma', () => {
    assert.equal(new VigiaDePerimetro().estado().umbral, 0);
    assert.throws(
      () => vigiasDesde({ ...VIGIAS, perimetro: { umbral: 1 } }),
      /no valida/,
    );
  });
});

describe('el vigía de presupuesto', () => {
  const TECHOS = { conversacion: 0.5, contacto: 2, hora: 5, dia: 25 } as const;

  function crear(registrar = recolector()) {
    return {
      registro: registrar,
      vigia: new VigiaDePresupuesto({
        techos: TECHOS,
        fraccion_suave: 0.8,
        registrar: registrar.registrar,
      }),
    };
  }

  test('DISPARA EL UMBRAL SUAVE: al 80 % degrada a local, sin dejar de atender', () => {
    const { vigia, registro } = crear();
    vigia.apuntar({ conversacion: 'c1' }, 0.4); // 80 % de 0.5

    const decision = vigia.puedeGastar({ conversacion: 'c1' });

    assert.equal(decision.accion, 'degradar');
    assert.equal(registro.actuaciones()[0]?.autoridad, 'degradar');
  });

  test('DISPARA EL UMBRAL DURO: al 100 % detiene las llamadas de nube', () => {
    const { vigia } = crear();
    vigia.apuntar({ conversacion: 'c1' }, 0.5);

    assert.equal(vigia.puedeGastar({ conversacion: 'c1' }).accion, 'detener');
  });

  test('UN SOLO CONTACTO NO SE LLEVA EL PRESUPUESTO DE TODOS', () => {
    // El escenario que un techo diario solo no evita: un bucle de un contacto
    // consumiendo el día entero en dos minutos.
    const { vigia } = crear();
    vigia.apuntar({ contacto: 'abusivo', dia: 'hoy' }, 2);

    assert.equal(vigia.puedeGastar({ contacto: 'abusivo', dia: 'hoy' }).accion, 'detener');
    // Y el resto sigue atendido: el techo diario ni se ha rozado.
    assert.equal(vigia.puedeGastar({ contacto: 'normal', dia: 'hoy' }).accion, 'seguir');
  });

  test('gana la ventana más apretada EN PROPORCIÓN, no la de más gasto', () => {
    // 4.5 de 5 por hora (90 %) aprieta más que 5 de 25 al día (20 %).
    const { vigia } = crear();
    vigia.apuntar({ hora: 'h', dia: 'd' }, 4.5);

    const decision = vigia.puedeGastar({ hora: 'h', dia: 'd' });
    assert.equal(decision.accion, 'degradar');
    assert.equal(decision.accion === 'degradar' ? decision.actuacion.contexto['ventana'] : '', 'hora');
  });

  test('la ventana de hora caduca; la de contacto no', () => {
    let reloj = 0;
    const vigia = new VigiaDePresupuesto({
      techos: TECHOS,
      fraccion_suave: 0.8,
      ahora: () => reloj,
    });

    vigia.apuntar({ hora: 'h', contacto: 'c' }, 5);
    assert.equal(vigia.puedeGastar({ hora: 'h' }).accion, 'detener');

    reloj += 3_600_001;
    // La hora se vació sola...
    assert.equal(vigia.gastado('hora', 'h'), 0);
    // ...y el contacto no, que es lo que impide esperar una hora y seguir.
    assert.equal(vigia.gastado('contacto', 'c'), 5);
  });

  test('una fracción suave de 1 no se acepta', () => {
    // Sería pasar de atender con normalidad a no atender sin escalón intermedio.
    assert.throws(
      () => new VigiaDePresupuesto({ techos: TECHOS, fraccion_suave: 1 }),
      /entre 0 y 1/,
    );
  });

  test('techos que no crecen de conversación a día no validan', () => {
    assert.throws(
      () =>
        vigiasDesde({
          ...VIGIAS,
          presupuesto: {
            ...VIGIAS.presupuesto,
            techos_usd: { conversacion: 10, contacto: 2, hora: 5, dia: 25 },
          },
        }),
      /tienen que crecer/,
    );
  });
});

describe('el vigía de bucle', () => {
  const LIMITES = { pasos: 3, herramientas: 2, reintentos: 1, tiempo_ms: 1000 };

  test('DISPARA POR PASOS: corta al superar el límite', () => {
    const registro = recolector();
    const vigia = new VigiaDeBucle({ limites: LIMITES, registrar: registro.registrar });
    const caso = vigia.vigilar('caso-1');

    assert.equal(caso.paso().accion, 'seguir');
    assert.equal(caso.paso().accion, 'seguir');
    assert.equal(caso.paso().accion, 'seguir');
    assert.equal(caso.paso().accion, 'detener');
    assert.equal(registro.actuaciones().length, 1);
  });

  test('DISPARA POR HERRAMIENTAS aunque los pasos no se agoten', () => {
    // Un caso que alterna dos herramientas eternamente no supera el límite de
    // pasos si nadie cuenta las herramientas.
    const vigia = new VigiaDeBucle({ limites: LIMITES });
    const caso = vigia.vigilar('caso-2');

    assert.equal(caso.paso('herramientas').accion, 'seguir');
    assert.equal(caso.paso('herramientas').accion, 'seguir');
    assert.equal(caso.paso('herramientas').accion, 'detener');
    assert.equal(caso.cuenta('pasos'), 0);
  });

  test('DISPARA POR TIEMPO, y CANCELA lo que estuviera en vuelo', () => {
    let reloj = 0;
    const vigia = new VigiaDeBucle({ limites: LIMITES, ahora: () => reloj });
    const caso = vigia.vigilar('caso-3');

    assert.equal(caso.senal.aborted, false);
    reloj = 1001;

    assert.equal(caso.paso().accion, 'detener');
    // El vigía aborta ÉL: si dependiera de que el llamante se acuerde, un
    // llamante distraído dejaría la petición consumiendo presupuesto después
    // de que el vigía dijera que parara.
    assert.equal(caso.senal.aborted, true);
  });

  test('DOS CASOS A LA VEZ NO COMPARTEN CONTADORES', () => {
    // Con un contador global, el segundo caso heredaría los pasos del primero:
    // cortaría casos sanos y dejaría pasar bucles.
    const vigia = new VigiaDeBucle({ limites: LIMITES });
    const uno = vigia.vigilar('caso-a');
    const dos = vigia.vigilar('caso-b');

    uno.paso();
    uno.paso();
    uno.paso();

    assert.equal(dos.cuenta('pasos'), 0);
    assert.equal(dos.paso().accion, 'seguir');
    assert.equal(uno.paso().accion, 'detener');
  });

  test('la actuación dice qué contador lo disparó', () => {
    const vigia = new VigiaDeBucle({ limites: LIMITES });
    const caso = vigia.vigilar('caso-4');

    caso.paso('reintentos');
    const decision = caso.paso('reintentos');

    assert.equal(decision.accion, 'detener');
    assert.equal(
      decision.accion === 'detener' ? decision.actuacion.contexto['contador'] : '',
      'reintentos',
    );
  });
});

describe('los tres, juntos', () => {
  test('LOS TRES PUEDEN DETENER, no solo avisar', () => {
    const vigias = [
      new VigiaDePerimetro(),
      new VigiaDePresupuesto({ techos: { conversacion: 1, contacto: 1, hora: 1, dia: 1 }, fraccion_suave: 0.8 }),
      new VigiaDeBucle({ limites: { pasos: 1, herramientas: 1, reintentos: 1, tiempo_ms: 1 } }),
    ];

    for (const vigia of vigias) {
      assert.equal(vigia.autoridad, 'detener', `${vigia.nombre} no puede detener`);
    }
  });

  test('todos exponen umbral, valor actual y última actuación para el panel', () => {
    const vigia = new VigiaDePerimetro();
    vigia.puedeSalir('alta', true);

    const estado = vigia.estado();
    assert.equal(typeof estado.umbral, 'number');
    assert.equal(typeof estado.valor_actual, 'number');
    assert.ok(estado.ultima_actuacion !== null);
    assert.ok((estado.ultima_actuacion?.explicacion.length ?? 0) > 20);
  });
});
