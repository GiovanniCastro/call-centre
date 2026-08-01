// Fase 4B-2 — los vigías que observan.
//
// Mismo criterio que en 4B-1: cada uno con prueba de disparo. Y uno propio de
// esta fase, que es el que le da sentido al de sustento:
//
//   «se prueba vaciando el índice de Qdrant y comprobando que AVISA Y MARCA EL
//    ÍNDICE COMO SOSPECHOSO, no que el agente empeoró».
//
// Esa distinción es todo el valor del vigía. Las dos cosas se ven igual desde
// fuera —bajan las respuestas bien sustentadas— y piden arreglos opuestos.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { recolector } from '../src/core/vigias/vigia.ts';
import { VigiaDeSustento } from '../src/core/vigias/sustento.ts';
import {
  VigiaDeCola,
  VigiaDeProveedor,
  VigiaDeSilencio,
  VigiaDeVigencia,
} from '../src/core/vigias/observan.ts';

describe('el vigía de sustento', () => {
  const OPCIONES = { ventana: 10, umbral_vacios: 0.5, umbral_sustento: 0.7 };

  test('CON EL ÍNDICE VACÍO AVISA DEL ÍNDICE, no de que el agente empeoró', () => {
    // Es el criterio de aceptación de la fase, literalmente.
    const registro = recolector();
    const vigia = new VigiaDeSustento({ ...OPCIONES, registrar: registro.registrar });

    for (let i = 0; i < 10; i += 1) {
      vigia.observar({ fragmentos_recuperados: 0, sustento: null });
    }

    assert.equal(vigia.indiceSospechoso, true);
    const acto = registro.actuaciones().at(-1);
    assert.equal(acto?.contexto['diagnostico'], 'indice_sospechoso');
    assert.match(acto?.explicacion ?? '', /Mira el índice de Qdrant/);
    // Y NO culpa al agente.
    assert.ok(!/el agente/.test(acto?.explicacion.replace('no es el agente empeorando', '') ?? ''));
  });

  test('con recuperación sana y sustento bajo, señala al modelo — no al índice', () => {
    const registro = recolector();
    const vigia = new VigiaDeSustento({ ...OPCIONES, registrar: registro.registrar });

    for (let i = 0; i < 10; i += 1) {
      vigia.observar({ fragmentos_recuperados: 5, sustento: 0.3 });
    }

    assert.equal(vigia.indiceSospechoso, false);
    const acto = registro.actuaciones().at(-1);
    assert.equal(acto?.contexto['diagnostico'], 'sustento_bajo');
    assert.match(acto?.explicacion ?? '', /El índice está bien/);
  });

  test('no juzga con media ventana', () => {
    // Una racha de tres vacíos al arrancar dispararía una alerta sobre un índice
    // que nadie ha usado todavía.
    const vigia = new VigiaDeSustento(OPCIONES);
    for (let i = 0; i < 3; i += 1) vigia.observar({ fragmentos_recuperados: 0, sustento: null });
    assert.equal(vigia.indiceSospechoso, false);
  });

  test('todo sano no dispara nada', () => {
    const registro = recolector();
    const vigia = new VigiaDeSustento({ ...OPCIONES, registrar: registro.registrar });
    for (let i = 0; i < 10; i += 1) vigia.observar({ fragmentos_recuperados: 4, sustento: 1 });

    assert.equal(registro.actuaciones().length, 0);
  });
});

describe('el vigía de proveedor', () => {
  const OPCIONES = { ventana: 5, umbral_error: 0.4, latencia_lenta_ms: 5000, umbral_lentas: 0.6 };

  test('DISPARA por errores, y manda a mirar credencial y cuota', () => {
    const registro = recolector();
    const vigia = new VigiaDeProveedor({ ...OPCIONES, registrar: registro.registrar });

    for (let i = 0; i < 5; i += 1) vigia.observar({ ok: i > 2, ms: 100 });

    const acto = registro.actuaciones().at(-1);
    assert.equal(acto?.contexto['sintoma'], 'errores');
    assert.match(acto?.explicacion ?? '', /credencial, cuota/);
  });

  test('DISPARA por latencia aunque no falle nada', () => {
    // El proveedor responde, pero tarde: el respaldo a local empezará a
    // dispararse y el reparto del panel se moverá sin que cambie la política.
    const registro = recolector();
    const vigia = new VigiaDeProveedor({ ...OPCIONES, registrar: registro.registrar });

    for (let i = 0; i < 5; i += 1) vigia.observar({ ok: true, ms: 9000 });

    assert.equal(registro.actuaciones().at(-1)?.contexto['sintoma'], 'latencia');
  });
});

describe('el vigía de vigencia', () => {
  const AYER = new Date('2026-08-01T00:00:00.000Z').getTime();

  test('DISPARA con algo caducado, y dice por qué el verificador NO lo atrapa', () => {
    const registro = recolector();
    const vigia = new VigiaDeVigencia({
      aviso_dias_antes: 30,
      registrar: registro.registrar,
      ahora: () => AYER,
    });

    const problemas = vigia.revisar([
      { que: 'tarifas de corpus/07-precios-y-deducibles.md', vigente_hasta: '2026-01-31' },
    ]);

    assert.equal(problemas.length, 1);
    const acto = registro.actuaciones().at(-1);
    assert.equal(acto?.contexto['caducado'], 1);
    // La razón de existir de este vigía: una cita perfectamente verificable
    // sobre un dato que ya no vale.
    assert.match(acto?.explicacion ?? '', /el valor aparece literalmente en el/);
  });

  test('avisa ANTES de caducar, con margen', () => {
    const registro = recolector();
    const vigia = new VigiaDeVigencia({
      aviso_dias_antes: 30,
      registrar: registro.registrar,
      ahora: () => AYER,
    });

    vigia.revisar([{ que: 'tarifas 2026', vigente_hasta: '2026-08-20' }]);
    assert.equal(registro.actuaciones().at(-1)?.contexto['caducado'], 0);
  });

  test('lo que está lejos de caducar no genera ruido', () => {
    const registro = recolector();
    const vigia = new VigiaDeVigencia({
      aviso_dias_antes: 30,
      registrar: registro.registrar,
      ahora: () => AYER,
    });

    vigia.revisar([{ que: 'tarifas 2026', vigente_hasta: '2026-12-31' }]);
    assert.equal(registro.actuaciones().length, 0);
  });
});

describe('el vigía de cola', () => {
  const OPCIONES = { profundidad_maxima: 50, antiguedad_maxima_ms: 30_000 };

  test('DISPARA por antigüedad ANTES que por profundidad', () => {
    // Una cola corta que no avanza es peor que una larga que sí: apunta a un
    // despachador parado, no a exceso de tráfico.
    const registro = recolector();
    const vigia = new VigiaDeCola({ ...OPCIONES, registrar: registro.registrar });

    vigia.observar({ profundidad: 3, mas_antiguo_ms: 45_000 });

    const acto = registro.actuaciones().at(-1);
    assert.equal(acto?.contexto['sintoma'], 'antiguedad');
    assert.equal(acto?.contexto['profundidad'], 3);
  });

  test('DISPARA por profundidad cuando la cola avanza pero entra más de lo que sale', () => {
    const registro = recolector();
    const vigia = new VigiaDeCola({ ...OPCIONES, registrar: registro.registrar });

    vigia.observar({ profundidad: 80, mas_antiguo_ms: 1000 });
    assert.equal(registro.actuaciones().at(-1)?.contexto['sintoma'], 'profundidad');
  });
});

describe('el vigía de silencio', () => {
  /** Tráfico esperado: nada de madrugada, actividad de 9 a 20. */
  const ESPERADO = Array.from({ length: 24 }, (_, h) => (h >= 9 && h < 20 ? 20 : 0));

  function aLas(hora: number): number {
    const d = new Date('2026-08-04T00:00:00');
    d.setHours(hora, 0, 0, 0);
    return d.getTime();
  }

  test('DISPARA en una franja con tráfico esperado tras el silencio tolerado', () => {
    const registro = recolector();
    let reloj = aLas(11);
    const vigia = new VigiaDeSilencio({
      esperado_por_hora: ESPERADO,
      tolerancia_min: 15,
      registrar: registro.registrar,
      ahora: () => reloj,
    });

    vigia.hubo();
    reloj += 16 * 60_000;

    assert.equal(vigia.comprobar(), true);
    // El motivo por el que este vigía existe: nada más se entera.
    assert.match(registro.actuaciones().at(-1)?.explicacion ?? '', /no genera ningún error/);
  });

  test('EL SILENCIO DE MADRUGADA NO ES UNA ANOMALÍA', () => {
    // «Nada» solo es información si antes había algo. Sin tráfico esperado, este
    // vigía llenaría el panel de alertas todas las noches.
    let reloj = aLas(4);
    const vigia = new VigiaDeSilencio({
      esperado_por_hora: ESPERADO,
      tolerancia_min: 15,
      ahora: () => reloj,
    });

    vigia.hubo();
    reloj += 3 * 60 * 60_000; // sigue de madrugada

    assert.equal(vigia.comprobar(), false);
  });

  test('EL SILENCIO NOCTURNO NO SE ACUMULA CONTRA LA FRANJA DE LA MAÑANA', () => {
    // Cinco horas de silencio de madrugada son lo normal. Si contaran, la alarma
    // saltaría a las nueve en punto todos los días, cuando la franja acaba de
    // abrir y nadie ha tenido tiempo de escribir. Una alerta que salta cada
    // mañana es una alerta que se desactiva, y entonces no vigila nada.
    let reloj = aLas(4);
    const vigia = new VigiaDeSilencio({
      esperado_por_hora: ESPERADO,
      tolerancia_min: 15,
      ahora: () => reloj,
    });

    vigia.hubo();
    reloj = aLas(9); // abre la franja, cinco horas calladas detrás

    assert.equal(vigia.comprobar(), false);

    // Y a los dieciséis minutos de franja abierta sin nada, sí.
    reloj += 16 * 60_000;
    assert.equal(vigia.comprobar(), true);
  });

  test('un mensaje reinicia la cuenta', () => {
    let reloj = aLas(11);
    const vigia = new VigiaDeSilencio({
      esperado_por_hora: ESPERADO,
      tolerancia_min: 15,
      ahora: () => reloj,
    });

    reloj += 14 * 60_000;
    vigia.hubo();
    reloj += 14 * 60_000;

    assert.equal(vigia.comprobar(), false);
  });

  test('un tráfico esperado sin las 24 horas no se acepta', () => {
    // Sin una hora, esa hora no se vigila — y sería la que fallara.
    assert.throws(
      () => new VigiaDeSilencio({ esperado_por_hora: [1, 2, 3], tolerancia_min: 15 }),
      /24 horas/,
    );
  });
});

describe('los cinco, juntos', () => {
  test('TODOS OBSERVAN: ninguno detiene', () => {
    // La diferencia entre 4B-1 y 4B-2 no es de importancia sino de autoridad.
    const vigias = [
      new VigiaDeSustento({ ventana: 5, umbral_vacios: 0.5, umbral_sustento: 0.7 }),
      new VigiaDeProveedor({ ventana: 5, umbral_error: 0.4, latencia_lenta_ms: 5000, umbral_lentas: 0.6 }),
      new VigiaDeVigencia({ aviso_dias_antes: 30 }),
      new VigiaDeCola({ profundidad_maxima: 50, antiguedad_maxima_ms: 30_000 }),
      new VigiaDeSilencio({ esperado_por_hora: Array(24).fill(1), tolerancia_min: 15 }),
    ];

    for (const vigia of vigias) {
      assert.equal(vigia.autoridad, 'avisar', `${vigia.nombre} no debería poder detener`);
      const estado = vigia.estado();
      assert.equal(typeof estado.umbral, 'number');
      assert.equal(typeof estado.valor_actual, 'number');
    }
  });
});
