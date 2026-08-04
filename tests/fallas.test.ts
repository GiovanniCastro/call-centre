// Fase 9 · El vigía de fallas: clasificación por significado, huella y cifras.
//
// La prueba que más vale de este archivo es la primera de todas: el mismo
// `ECONNREFUSED` clasificado de dos maneras según a dónde iba. Si algún día esa
// se cae, el informe de salud seguirá generándose y mandará a quien lo lea a
// arreglar lo que no está roto.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { clasificar, CLASES_DE_FALLA, REMEDIOS } from '../src/core/fallas/clasificar.ts';
import { huella, plantillaDe } from '../src/core/fallas/huella.ts';
import { VigiaDeFallas } from '../src/core/fallas/vigia.ts';
import { observacionDe } from '../src/core/fallas/desde-caso.ts';
import { saludDesde, SALUD } from '../src/core/fallas/config.ts';
import { recolector } from '../src/core/vigias/vigia.ts';

describe('la clasificación es por significado, no por número', () => {
  test('EL MISMO ERROR DE CONEXIÓN, DOS CLASES, SEGÚN DE QUÉ LADO DEL PERÍMETRO', () => {
    // Es la razón de ser del clasificador. `ECONNREFUSED` contra localhost se
    // arregla con `npm run servicios`; contra un proveedor no se arregla desde
    // aquí. Un informe que los agrupara mandaría a leer el código equivocado.
    const dentro = clasificar({
      operacion: 'repos.eventos',
      mensaje: 'connect ECONNREFUSED 127.0.0.1:5432',
      destino: 'postgres://localhost:5432/perimetro',
    });
    const fuera = clasificar({
      operacion: 'inferencia.nube',
      mensaje: 'connect ECONNREFUSED 160.79.104.10:443',
      destino: 'https://api.anthropic.com',
    });

    assert.equal(dentro.clase, 'servicio_local_caido');
    assert.equal(fuera.clase, 'proveedor_caido');
    assert.notEqual(REMEDIOS[dentro.clase].que_hacer, REMEDIOS[fuera.clase].que_hacer);
    assert.equal(REMEDIOS[dentro.clase].esta_en_nuestra_mano, true);
    assert.equal(REMEDIOS[fuera.clase].esta_en_nuestra_mano, false);
  });

  test('429 y 529 no son la misma falla, aunque los dos sean «el proveedor dijo que no»', () => {
    // 429 es cuota nuestra: bajar el ritmo la arregla. 529 es saturación suya:
    // bajar el ritmo no la arregla, solo la espera.
    assert.equal(clasificar({ operacion: 'x', mensaje: 'Too Many Requests', codigo: 429 }).clase, 'cuota');
    assert.equal(clasificar({ operacion: 'x', mensaje: 'overloaded_error', codigo: 529 }).clase, 'proveedor_saturado');
    assert.equal(REMEDIOS.cuota.esta_en_nuestra_mano, true);
    assert.equal(REMEDIOS.proveedor_saturado.esta_en_nuestra_mano, false);
  });

  test('401, 403 y «invalid x-api-key» son la misma falla con tres formas', () => {
    for (const obs of [
      { operacion: 'x', mensaje: 'Unauthorized', codigo: 401 },
      { operacion: 'x', mensaje: 'Forbidden', codigo: 403 },
      { operacion: 'x', mensaje: 'invalid x-api-key' },
      { operacion: 'x', mensaje: 'expired api key' },
    ]) {
      assert.equal(clasificar(obs).clase, 'credencial', `falló con: ${obs.mensaje}`);
    }
  });

  test('la credencial gana aunque el mensaje mencione otra cosa', () => {
    // El orden de las reglas ES la clasificación. Un 401 cuyo cuerpo hable de
    // timeouts sigue siendo un problema de credencial.
    const c = clasificar({ operacion: 'x', mensaje: 'request timed out after 30000ms', codigo: 401 });
    assert.equal(c.clase, 'credencial');
  });

  test('el sustento insuficiente es contrato roto, no un fallo del verificador', () => {
    const c = clasificar({
      operacion: 'caso',
      mensaje: 'sustento 0 % por debajo del umbral de matiz',
    });
    assert.equal(c.clase, 'contrato_roto');
    assert.match(REMEDIOS.contrato_roto.que_hacer, /NO se arregla aflojando el verificador/);
  });

  test('LO QUE NO SE RECONOCE SALE COMO DESCONOCIDA, NO EN EL CAJÓN QUE MÁS SE LE PAREZCA', () => {
    // Un clasificador que siempre encuentra una clase plausible produce un
    // informe que siempre parece saber lo que pasa. El recuento de esta clase es
    // la lista de trabajo del propio clasificador.
    const c = clasificar({ operacion: 'x', mensaje: 'algo rarísimo que nadie ha visto nunca' });
    assert.equal(c.clase, 'desconocida');
    assert.match(c.por_que, /ninguna regla/);
  });

  test('toda clase declara qué hacer y dónde mirar', () => {
    // Es el segundo criterio de aceptación hecho estructura: sin estos dos
    // campos, el informe describe el síntoma y deja el diagnóstico de deberes.
    for (const clase of CLASES_DE_FALLA) {
      const r = REMEDIOS[clase];
      assert.ok(r.que_significa.length > 30, `${clase}: «que_significa» no explica nada`);
      assert.ok(r.que_hacer.length > 30, `${clase}: «que_hacer» no explica nada`);
      assert.ok(r.donde_mirar.length > 0, `${clase}: no dice dónde mirar`);
    }
  });
});

describe('la huella agrupa lo que es el mismo problema', () => {
  test('dos apariciones con identificadores distintos caen en el mismo grupo', () => {
    const a = 'fallo al escribir el evento 3f2a9b1c-1111-4d5e-8a7b-000000000001 tras 1204 ms';
    const b = 'fallo al escribir el evento 7c4e1a2d-2222-4f6a-9b8c-000000000002 tras 87 ms';

    assert.equal(plantillaDe(a), plantillaDe(b));
    assert.equal(
      huella('datos', 'repos.eventos', plantillaDe(a)),
      huella('datos', 'repos.eventos', plantillaDe(b)),
    );
  });

  test('el mismo texto en dos operaciones NO se agrupa junto', () => {
    // «connection refused» en la recuperación es Qdrant; en la inferencia es
    // Ollama. Un contador alto con dos causas es un diagnóstico imposible.
    const p = plantillaDe('connection refused');
    assert.notEqual(huella('x', 'recuperacion', p), huella('x', 'inferencia.local', p));
  });

  test('LA PLANTILLA SE SANEA ANTES DE NORMALIZAR, O EL DATO SE COLARÍA', () => {
    // Si se normalizara primero, «123-45-6789» sería «N-N-N» cuando el saneo lo
    // mirara, no lo reconocería, y el número entraría en el informe.
    const plantilla = plantillaDe('no pude guardar al cliente con ssn 123-45-6789');
    assert.ok(!plantilla.includes('123-45-6789'));
    assert.ok(!plantilla.includes('6789'));
  });

  test('la huella no es reversible', () => {
    const h = huella('datos', 'repos', plantillaDe('secreto'));
    assert.match(h, /^[0-9a-f]{12}$/);
    assert.ok(!h.includes('secreto'));
  });
});

// ── El vigía ─────────────────────────────────────────────────────────────────

const T0 = Date.parse('2026-08-04T10:00:00.000Z');
const en = (segundos: number): string => new Date(T0 + segundos * 1000).toISOString();

function vigiaDePrueba(minimo = 4, objetivo = 0.9): VigiaDeFallas {
  return new VigiaDeFallas({
    config: saludDesde({
      version: 1,
      objetivo_disponibilidad: objetivo,
      minimo_observaciones: minimo,
      umbral_presupuesto_consumido: 1.0,
      ventana_horas: 24,
      grupos_en_el_informe: 12,
    }),
  });
}

describe('el vigía de fallas', () => {
  test('UN ESCALADO POR FALTA DE FUENTE NO ES UNA FALLA', () => {
    // El invariante 1 funcionando. Contarlo como fallo haría que cumplirlo
    // bajara la disponibilidad — y con el tiempo alguien «mejoraría» la cifra
    // aflojando el invariante.
    const v = vigiaDePrueba(1);
    v.observar(
      observacionDe({
        caso_id: 'c1',
        canal: 'lote',
        clase_tarea: 'catalogo',
        resultado: 'escalado_humano',
        clase_escalado: 'sin_fuentes',
        motivo_escalado: 'la recuperación no devolvió ningún fragmento',
        mensaje: '¿cubren daños por meteorito?',
        momento: en(0),
      }),
    );

    assert.equal(v.encabezado().fallidas, 0);
    assert.equal(v.encabezado().disponibilidad, 1);
    assert.equal(v.agrupadas().length, 0);
  });

  test('un caso bloqueado por el vigía de perímetro tampoco', () => {
    const v = vigiaDePrueba(1);
    v.observar(
      observacionDe({
        caso_id: 'c2',
        canal: 'lote',
        clase_tarea: 'extraccion',
        resultado: 'bloqueado',
        clase_escalado: 'peticion_bloqueada',
        motivo_escalado: 'el vigía de perímetro detuvo el caso',
        mensaje: 'mi ssn es 123-45-6789',
        momento: en(0),
      }),
    );
    assert.equal(v.encabezado().fallidas, 0);
  });

  test('un escalado por falta de sustento SÍ lo es, y se clasifica como contrato roto', () => {
    // La distinción con `sin_fuentes`: allí no había nada que citar; aquí se le
    // dieron fragmentos y no los citó.
    const v = vigiaDePrueba(1);
    v.observar(
      observacionDe({
        caso_id: 'c3',
        canal: 'lote',
        clase_tarea: 'catalogo',
        resultado: 'escalado_humano',
        clase_escalado: 'sin_sustento',
        motivo_escalado: 'sustento 0 % por debajo del umbral de matiz',
        mensaje: '¿cuánto cuesta el deducible?',
        momento: en(0),
      }),
    );

    assert.equal(v.encabezado().fallidas, 1);
    assert.equal(v.agrupadas()[0]?.clase, 'contrato_roto');
  });

  test('mil fallos idénticos son un grupo con contador, no mil filas', () => {
    const v = vigiaDePrueba(1);
    for (let i = 0; i < 1000; i += 1) {
      v.observar({
        operacion: 'inferencia.local',
        momento: en(i),
        falla: { mensaje: `el modelo no devolvió JSON analizable (intento ${i})` },
      });
    }

    const grupos = v.agrupadas();
    assert.equal(grupos.length, 1);
    assert.equal(grupos[0]?.veces, 1000);
    assert.equal(grupos[0]?.primera_vez, en(0));
    assert.equal(grupos[0]?.ultima_vez, en(999));
  });

  test('CON POCAS OBSERVACIONES, EL ENCABEZADO NO ES CONCLUYENTE', () => {
    // R-032 aplicado antes de tropezar: un cero con denominador de tres no
    // prueba nada, y publicarlo como «100 %» es peor que no publicarlo.
    const v = vigiaDePrueba(30);
    for (let i = 0; i < 3; i += 1) v.observar({ operacion: 'caso', momento: en(i) });

    const e = v.encabezado();
    assert.equal(e.concluyente, false);
    assert.equal(e.observaciones, 3);
    assert.equal(e.minimo_para_concluir, 30);
  });

  test('EL TIEMPO DE RECUPERACIÓN SE MIDE POR EPISODIOS, NO POR FALLOS', () => {
    // Una racha de fallos es UNA caída. Promediar sobre fallos daría un número
    // que mejora cuanto peor va todo, porque una racha larga aporta muchos
    // intervalos cortos.
    const v = vigiaDePrueba(1);
    v.observar({ operacion: 'caso', momento: en(0) });
    for (const s of [10, 11, 12, 13]) {
      v.observar({ operacion: 'caso', momento: en(s), falla: { mensaje: 'boom' } });
    }
    v.observar({ operacion: 'caso', momento: en(20) });

    const e = v.encabezado();
    assert.equal(e.episodios_cerrados, 1, 'cuatro fallos seguidos son un episodio');
    assert.equal(e.recuperacion_media_ms, 10_000, 'del primer fallo (10 s) al éxito (20 s)');
    assert.equal(e.episodios_abiertos, 0);
  });

  test('un episodio que sigue abierto no entra en la media, y se dice', () => {
    const v = vigiaDePrueba(1);
    v.observar({ operacion: 'caso', momento: en(0) });
    v.observar({ operacion: 'caso', momento: en(5), falla: { mensaje: 'boom' } });

    const e = v.encabezado();
    assert.equal(e.episodios_abiertos, 1);
    assert.equal(e.episodios_cerrados, 0);
    assert.equal(e.recuperacion_media_ms, null, 'no se inventa una recuperación que no ha ocurrido');
  });

  test('EL VIGÍA DISPARA CUANDO EL PRESUPUESTO DE ERROR SE AGOTA', () => {
    // Prueba de inyección de fallo: un vigía sin prueba de disparo es
    // decoración. Objetivo 90 % → margen 10 %. Con 2 de 10 fallidas, la tasa es
    // del 20 %, o sea el doble del margen.
    const recogido = recolector();
    const v = new VigiaDeFallas({
      config: saludDesde({
        version: 1,
        objetivo_disponibilidad: 0.9,
        minimo_observaciones: 10,
        umbral_presupuesto_consumido: 1.0,
        ventana_horas: 24,
        grupos_en_el_informe: 12,
      }),
      registrar: recogido.registrar,
    });

    for (let i = 0; i < 8; i += 1) v.observar({ operacion: 'caso', momento: en(i) });
    assert.equal(recogido.actuaciones().length, 0, 'todavía no hay denominador suficiente');

    v.observar({ operacion: 'caso', momento: en(8), falla: { mensaje: 'boom' } });
    v.observar({ operacion: 'caso', momento: en(9), falla: { mensaje: 'boom' } });

    const actuaciones = recogido.actuaciones();
    assert.equal(actuaciones.length, 1, 'dispara una vez, no una por fallo');
    assert.equal(actuaciones[0]?.vigia, 'fallas');
    assert.equal(actuaciones[0]?.autoridad, 'avisar');
    assert.ok(
      (actuaciones[0]?.valor_observado ?? 0) >= (actuaciones[0]?.umbral ?? 1),
      'una actuación registra un límite CRUZADO',
    );
    // Con tolerancia: 0.2 / (1 - 0.9) da 2.0000000000000004 en coma flotante, y
    // exigir el 2 exacto sería probar la aritmética de IEEE 754, no el vigía.
    assert.ok(Math.abs(v.encabezado().presupuesto_error_consumido - 2) < 1e-9);
  });

  test('el vigía de fallas AVISA; no detiene nada', () => {
    // La fase 4B-1 tiene los que detienen. Este no es uno de ellos, y que su
    // autoridad sea `avisar` es lo que lo dice sin tener que leer el código.
    const v = vigiaDePrueba();
    assert.equal(v.autoridad, 'avisar');
    assert.equal(v.estado().nombre, 'fallas');
  });

  test('y se rearma si el presupuesto vuelve por debajo del umbral', () => {
    // Un vigía que avisa una vez y se calla para siempre deja de vigilar tras el
    // primer incidente.
    const recogido = recolector();
    const v = new VigiaDeFallas({
      config: saludDesde({
        version: 1,
        objetivo_disponibilidad: 0.5,
        minimo_observaciones: 2,
        umbral_presupuesto_consumido: 1.0,
        ventana_horas: 24,
        grupos_en_el_informe: 12,
      }),
      registrar: recogido.registrar,
    });

    v.observar({ operacion: 'c', momento: en(0), falla: { mensaje: 'boom' } });
    v.observar({ operacion: 'c', momento: en(1), falla: { mensaje: 'boom' } });
    assert.equal(recogido.actuaciones().length, 1);

    // Muchos éxitos bajan la tasa por debajo del margen y rearman el aviso.
    for (let i = 2; i < 20; i += 1) v.observar({ operacion: 'c', momento: en(i) });
    assert.ok(v.encabezado().presupuesto_error_consumido < 1);

    for (let i = 20; i < 40; i += 1) {
      v.observar({ operacion: 'c', momento: en(i), falla: { mensaje: 'boom' } });
    }
    assert.equal(recogido.actuaciones().length, 2, 'volvió a avisar tras rearmarse');
  });
});

describe('config/salud.json', () => {
  test('un objetivo del 100 % se rechaza al cargar', () => {
    // Con margen cero el presupuesto de error deja de ser una medida y pasa a
    // ser un interruptor. Que el archivo no pueda declararlo es más barato que
    // explicar luego por qué la cifra se comporta raro.
    assert.throws(
      () => saludDesde({ ...SALUD, objetivo_disponibilidad: 1 }),
      /no valida/,
    );
  });

  test('el objetivo real del proyecto es el que se puede defender', () => {
    // 95 %, no 99.9 %. La única carga medida resolvió 51 de cada 100.
    assert.ok(SALUD.objetivo_disponibilidad <= 0.95);
    assert.ok(SALUD.minimo_observaciones >= 10);
  });
});
