// Fase 3 — la frontera de salida.
//
// Criterio de aceptación: «una llamada a un dominio no declarado se bloquea
// aunque el código la intente». La palabra que importa es **aunque**: no se
// prueba que el código bien escrito no lo intente, se prueba que intentarlo no
// sirve de nada.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DestinoBloqueado,
  evaluarDestino,
  fetchDelPerimetro,
  observarSalidas,
  salir,
  type RegistroDeSalida,
} from '../src/salida/salir.ts';
import { listaDesde } from '../src/salida/destinos.ts';

const CONFIG = {
  version: 1 as const,
  destinos: {
    'api.anthropic.com': {
      clase: 'externo' as const,
      para: 'inferencia',
      esquemas: ['https' as const],
      egreso: true,
    },
    localhost: {
      clase: 'perimetro' as const,
      para: 'ollama',
      esquemas: ['http' as const, 'https' as const],
      egreso: false,
    },
  },
  permitir_por_entorno: { variable: 'DESTINOS_EXTRA' },
};

const LISTA = listaDesde(CONFIG, {});

/** Recoge lo que pasa por el módulo. Es el espía que exigen los criterios. */
function espiar(): { registros: RegistroDeSalida[]; parar: () => void } {
  const registros: RegistroDeSalida[] = [];
  const parar = observarSalidas((r) => registros.push(r));
  return { registros, parar };
}

describe('la lista blanca de salida', () => {
  test('UN DOMINIO NO DECLARADO SE BLOQUEA AUNQUE EL CÓDIGO LO INTENTE', async () => {
    const espia = espiar();
    try {
      await assert.rejects(
        () => salir('https://exfiltracion.example.com/recoge', { method: 'POST' }, LISTA),
        (error: Error) =>
          error.name === 'DestinoBloqueado' && /no está en la lista blanca/.test(error.message),
      );

      // Y queda registrado. Un bloqueo silencioso no permitiría saber que alguien
      // lo intentó, que es justo lo que hay que saber.
      assert.equal(espia.registros.length, 1);
      assert.equal(espia.registros[0]?.permitido, false);
      assert.equal(espia.registros[0]?.anfitrion, 'exfiltracion.example.com');
    } finally {
      espia.parar();
    }
  });

  test('se rechaza ANTES de abrir el socket', async () => {
    // Un dominio que no resuelve: si la comprobación ocurriera después de
    // intentar la conexión, el error sería de red y tardaría. Al ser de lista,
    // es inmediato y con otro nombre.
    const inicio = process.hrtime.bigint();
    await assert.rejects(
      () => salir('https://este-dominio-no-existe-jamas-12345.invalid/x', {}, LISTA),
      DestinoBloqueado,
    );
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    assert.ok(ms < 100, `tardó ${ms.toFixed(0)} ms: parece que intentó resolver el DNS`);
  });

  test('declarar un anfitrión NO autoriza a hablarle en claro', () => {
    // El esquema se comprueba aparte. Una URL construida a partir de texto del
    // modelo puede degradar https a http sin que el dominio cambie.
    const claro = evaluarDestino('http://api.anthropic.com/v1/messages', LISTA);
    const cifrado = evaluarDestino('https://api.anthropic.com/v1/messages', LISTA);

    assert.equal(claro.permitido, false);
    assert.match(claro.permitido === false ? claro.motivo : '', /esquema/);
    assert.equal(cifrado.permitido, true);
  });

  test('un subdominio no hereda el permiso del dominio', () => {
    // `api.anthropic.com` autorizado no puede implicar `malo.api.anthropic.com`:
    // quien controle un subdominio controlaría la salida.
    assert.equal(evaluarDestino('https://malo.api.anthropic.com/x', LISTA).permitido, false);
  });

  test('lo que no es una URL absoluta se rechaza, no se interpreta', () => {
    for (const intento of ['/ruta/relativa', 'javascript:alert(1)', '//api.anthropic.com/x']) {
      assert.equal(evaluarDestino(intento, LISTA).permitido, false, intento);
    }
  });

  test('el egreso se distingue del tráfico interno del perímetro', () => {
    const fuera = evaluarDestino('https://api.anthropic.com/v1/messages', LISTA);
    const dentro = evaluarDestino('http://localhost:11434/api/embed', LISTA);

    assert.equal(fuera.permitido && fuera.destino.egreso, true);
    assert.equal(dentro.permitido && dentro.destino.egreso, false);

    // Contar la llamada a Ollama como egreso inflaría el numerador del vigía de
    // perímetro con tráfico que nunca salió de la máquina, y esa es la cifra que
    // sostiene la tesis del proyecto.
    assert.equal(dentro.permitido && dentro.destino.clase, 'perimetro');
  });

  test('los destinos de entorno entran como externos con egreso, no como perímetro', () => {
    const conExtra = listaDesde(CONFIG, { DESTINOS_EXTRA: 'tunel.example.com' });
    const veredicto = evaluarDestino('https://tunel.example.com/x', conExtra);

    assert.equal(veredicto.permitido, true);
    // Es el destino del que menos sabemos; tratarlo como perímetro lo sacaría del
    // recuento de egreso justo cuando más conviene contarlo.
    assert.equal(veredicto.permitido && veredicto.destino.egreso, true);
    assert.equal(veredicto.permitido && veredicto.destino.clase, 'externo');
  });

  test('el espía ve el método y los bytes, pero no el cuerpo', async () => {
    const espia = espiar();
    try {
      await assert.rejects(
        () => salir('https://otro.example.com/x', { method: 'POST', body: '12345' }, LISTA),
        DestinoBloqueado,
      );

      const registro = espia.registros[0];
      assert.equal(registro?.metodo, 'POST');
      assert.equal(registro?.bytes_enviados, 5);
      // Que no haya forma de leer el contenido desde el registro es deliberado:
      // el observador lo consumen la telemetría y el panel.
      assert.equal('cuerpo' in (registro ?? {}), false);
    } finally {
      espia.parar();
    }
  });

  test('darse de baja del espía deja de recibir', async () => {
    const espia = espiar();
    espia.parar();

    await assert.rejects(() => salir('https://otro.example.com/x', {}, LISTA), DestinoBloqueado);
    assert.equal(espia.registros.length, 0);
  });
});

describe('fetchDelPerimetro — la forma que se inyecta en el SDK', () => {
  test('un SDK que llame a un destino no declarado se bloquea igual', async () => {
    // Es lo que permite usar el SDK oficial sin abrir un agujero: el SDK hace su
    // propio HTTP, pero con esta función.
    const comoFetch = fetchDelPerimetro(LISTA);

    await assert.rejects(() => comoFetch('https://api.openai.com/v1/chat'), DestinoBloqueado);
  });

  test('acepta las tres formas de URL que usa un SDK', async () => {
    const comoFetch = fetchDelPerimetro(LISTA);
    const espia = espiar();

    try {
      const intentos = [
        'https://prohibido.example.com/a',
        new URL('https://prohibido.example.com/b'),
        new Request('https://prohibido.example.com/c'),
      ];

      for (const intento of intentos) {
        await assert.rejects(() => comoFetch(intento), DestinoBloqueado);
      }

      assert.equal(espia.registros.length, 3);
      assert.ok(espia.registros.every((r) => r.anfitrion === 'prohibido.example.com'));
    } finally {
      espia.parar();
    }
  });
});

describe('la configuración real de destinos', () => {
  test('config/destinos.json valida y declara los destinos que el sistema usa', async () => {
    const { DESTINOS } = await import('../src/salida/destinos.ts');

    for (const anfitrion of ['api.anthropic.com', 'api.telegram.org', 'localhost']) {
      assert.ok(DESTINOS.porAnfitrion.has(anfitrion), `falta ${anfitrion}`);
    }

    // Ningún destino del perímetro puede declararse con egreso, ni al revés:
    // es la coherencia de la que depende el denominador del vigía.
    for (const [anfitrion, destino] of DESTINOS.porAnfitrion) {
      assert.equal(
        destino.egreso,
        destino.clase === 'externo',
        `${anfitrion}: la clase y el egreso no concuerdan`,
      );
    }
  });
});
