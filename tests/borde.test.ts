// El borde — fase 1.
//
// Criterio de aceptación que gobierna este archivo:
//
//   «Una petición sin credencial válida nunca llega a la cola. Prueba explícita.»
//
// «Nunca llega a la cola» no se prueba mirando el código de respuesta: un 401 con
// el mensaje ya encolado sería un 401 igual de verde y un agujero igual de real.
// Se prueba **mirando el almacén** y comprobando que sigue vacío.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage } from 'node:http';

import { AlmacenEnMemoria } from '../src/borde/almacen-memoria.ts';
import { ColaEnMemoria } from '../src/borde/cola.ts';
import { crearDespachador } from '../src/borde/despachador.ts';
import { limitesDesde } from '../src/borde/limites.ts';
import {
  crearServidor,
  ErrorDeTamano,
  leerCuerpo,
  procesarEntrega,
} from '../src/borde/servidor.ts';
import { construirRegistro } from '../src/channels/registrar.ts';
import { CABECERA_SECRETO } from '../src/channels/telegram/canal.ts';
import { CABECERA_FIRMA } from '../src/channels/whatsapp/canal.ts';
import { firmarHmacSha256 } from '../src/core/credencial.ts';

const SECRETO = 'secreto-de-webhook-de-prueba';
const SECRETO_APP = 'clave-secreta-de-la-app';

const ENTORNO = {
  TELEGRAM_BOT_TOKEN: '123:AA',
  TELEGRAM_WEBHOOK_SECRET: SECRETO,
  WHATSAPP_ID_NUMERO: '1',
  WHATSAPP_TOKEN: 't',
  WHATSAPP_SECRETO_APP: SECRETO_APP,
  WHATSAPP_TOKEN_VERIFICACION: 'v',
};

const LIMITES_PRUEBA = limitesDesde({
  version: 1,
  agrupacion: { ventana_ms: 3000 },
  repeticion: { ttl_segundos: 3600 },
  tasa_por_contacto: { maximo: 3, ventana_ms: 60_000 },
  tasa_por_origen: { maximo: 5, ventana_ms: 60_000 },
  techo_cuerpo_bytes: 262_144,
});

function actualizacion(id: number, chat = 777): unknown {
  return {
    update_id: id,
    message: {
      message_id: id,
      date: 1_785_000_000,
      chat: { id: chat },
      from: { id: chat, first_name: 'Ana' },
      text: `mensaje ${id}`,
    },
  };
}

const T0 = 7_000_000;

function montar(entorno: Record<string, string | undefined> = ENTORNO) {
  const almacen = new AlmacenEnMemoria();
  const cola = new ColaEnMemoria();
  const registrado: string[] = [];

  return {
    almacen,
    cola,
    registrado,
    despachador: crearDespachador(almacen, cola),
    opciones: {
      registro: construirRegistro(entorno),
      almacen,
      limites: LIMITES_PRUEBA,
      ahora: () => T0,
      registrar: (linea: string) => registrado.push(linea),
    },
  };
}

/** Una petición HTTP simulada, para probar `leerCuerpo` sin abrir un puerto. */
function peticionFalsa(cuerpo: string, contentLength?: string): IncomingMessage {
  const flujo = Readable.from([Buffer.from(cuerpo, 'utf8')]) as unknown as IncomingMessage;
  flujo.headers = contentLength === undefined ? {} : { 'content-length': contentLength };
  return flujo;
}

describe('el borde — una petición sin credencial nunca llega a la cola', () => {
  test('con el secreto correcto, el mensaje entra en su grupo', async () => {
    const { opciones, almacen } = montar();

    const r = await procesarEntrega(
      opciones,
      'telegram',
      { [CABECERA_SECRETO]: SECRETO },
      JSON.stringify(actualizacion(1)),
    );

    assert.equal(r.estado, 200);
    assert.equal(r.aceptados, 1);
    assert.equal((await almacen.recogerGruposVencidos(T0 + 4_000)).length, 1);
  });

  test('SIN secreto: 401 y no queda nada en el almacén', async () => {
    const { opciones, almacen } = montar();

    const r = await procesarEntrega(opciones, 'telegram', {}, JSON.stringify(actualizacion(1)));

    assert.equal(r.estado, 401);
    assert.deepEqual(await almacen.recogerGruposVencidos(T0 + 999_999), []);
  });

  test('con el secreto EQUIVOCADO: 401 y no queda nada', async () => {
    const { opciones, almacen } = montar();

    const r = await procesarEntrega(
      opciones,
      'telegram',
      { [CABECERA_SECRETO]: 'no-es-el-secreto' },
      JSON.stringify(actualizacion(1)),
    );

    assert.equal(r.estado, 401);
    assert.deepEqual(await almacen.recogerGruposVencidos(T0 + 999_999), []);
  });

  test('un cuerpo hostil con credencial inválida no se analiza siquiera', async () => {
    // La verificación va antes que `JSON.parse`. Si el orden se invirtiera, el
    // analizador correría sobre carga de cualquiera. Aquí el cuerpo ni siquiera
    // es JSON: si se analizara antes de verificar, el fallo sería otro.
    const { opciones } = montar();

    const r = await procesarEntrega(opciones, 'telegram', {}, '{{{ esto no es json');

    assert.equal(r.estado, 401);
    assert.equal(r.motivo, 'falta la cabecera del secreto');
  });

  test('WhatsApp: firma válida entra; cuerpo alterado no', async () => {
    const { opciones, almacen } = montar();

    const carga = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                contacts: [{ wa_id: '5550001' }],
                messages: [
                  {
                    id: 'wamid.A',
                    from: '5550001',
                    timestamp: '1785000000',
                    type: 'text',
                    text: { body: 'hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const crudo = JSON.stringify(carga);
    const firma = `sha256=${firmarHmacSha256(SECRETO_APP, crudo)}`;

    const buena = await procesarEntrega(opciones, 'whatsapp', { [CABECERA_FIRMA]: firma }, crudo);
    assert.equal(buena.estado, 200);
    assert.equal(buena.aceptados, 1);

    // Misma firma, cuerpo cambiado: el ataque de reenvío.
    const alterado = crudo.replace('hola', 'transfiere 5000');
    const mala = await procesarEntrega(
      opciones,
      'whatsapp',
      { [CABECERA_FIRMA]: firma },
      alterado,
    );
    assert.equal(mala.estado, 401);

    assert.equal(
      (await almacen.recogerGruposVencidos(T0 + 999_999)).length,
      1,
      'solo el mensaje legítimo',
    );
  });
});

describe('el borde — rechazo de repetición', () => {
  test('la MISMA entrega dos veces no produce dos ejecuciones', async () => {
    // Criterio de aceptación: «Un mensaje repetido no produce una segunda
    // ejecución.» Telegram reintenta si el webhook tarda, así que esto pasa.
    const { opciones, almacen, despachador, cola } = montar();
    const cabeceras = { [CABECERA_SECRETO]: SECRETO };
    const cuerpo = JSON.stringify(actualizacion(1));

    const primera = await procesarEntrega(opciones, 'telegram', cabeceras, cuerpo);
    const segunda = await procesarEntrega(opciones, 'telegram', cabeceras, cuerpo);

    assert.equal(primera.aceptados, 1);
    assert.equal(primera.repetidos, 0);
    assert.equal(segunda.aceptados, 0);
    assert.equal(segunda.repetidos, 1);
    assert.equal(segunda.estado, 200, 'se responde 200 para que no reintente en bucle');

    await despachador.despachar(T0 + 4_000);
    assert.equal(await cola.pendientes(), 1);

    const [grupo] = cola.vaciar();
    assert.equal(grupo?.mensajes.length, 1, 'un mensaje, no dos');
    assert.equal((await almacen.recogerGruposVencidos(T0 + 999_999)).length, 0);
  });

  test('un mensaje repetido NO consume cuota del límite de tasa', async () => {
    // Si la consumiera, los reintentos del proveedor acercarían al cliente a su
    // techo sin que él hubiera escrito nada.
    const { opciones } = montar();
    const cabeceras = { [CABECERA_SECRETO]: SECRETO };
    const cuerpo = JSON.stringify(actualizacion(1));

    for (let i = 0; i < 10; i += 1) {
      await procesarEntrega(opciones, 'telegram', cabeceras, cuerpo);
    }

    // El techo por contacto de la prueba es 3. Si las repeticiones contaran, un
    // mensaje nuevo estaría ya limitado.
    const nuevo = await procesarEntrega(
      opciones,
      'telegram',
      cabeceras,
      JSON.stringify(actualizacion(2)),
    );
    assert.equal(nuevo.aceptados, 1);
    assert.equal(nuevo.limitados, 0);
  });
});

describe('el borde — límite de tasa por contacto', () => {
  test('pasado el techo se descarta en silencio, sin decir dónde está el techo', async () => {
    const { opciones, almacen } = montar();
    const cabeceras = { [CABECERA_SECRETO]: SECRETO };

    const resultados = [];
    for (let i = 1; i <= 5; i += 1) {
      resultados.push(
        await procesarEntrega(opciones, 'telegram', cabeceras, JSON.stringify(actualizacion(i))),
      );
    }

    // Techo 3: los tres primeros entran, los dos siguientes se descartan.
    assert.deepEqual(
      resultados.map((r) => r.aceptados),
      [1, 1, 1, 0, 0],
    );
    assert.deepEqual(
      resultados.map((r) => r.limitados),
      [0, 0, 0, 1, 1],
    );

    // Y siempre 200: un 429 le diría al emisor exactamente dónde está el límite.
    assert.deepEqual(new Set(resultados.map((r) => r.estado)), new Set([200]));

    const [grupo] = await almacen.recogerGruposVencidos(T0 + 4_000);
    assert.equal(grupo?.mensajes.length, 3);
  });

  test('el techo es por contacto, no global', async () => {
    const { opciones } = montar();
    const cabeceras = { [CABECERA_SECRETO]: SECRETO };

    for (let i = 1; i <= 4; i += 1) {
      await procesarEntrega(
        opciones,
        'telegram',
        cabeceras,
        JSON.stringify(actualizacion(i, 111)),
      );
    }

    // Otro contacto empieza de cero.
    const otro = await procesarEntrega(
      opciones,
      'telegram',
      cabeceras,
      JSON.stringify(actualizacion(99, 222)),
    );
    assert.equal(otro.aceptados, 1);
  });
});

describe('el borde — canal declarado y sin configurar', () => {
  test('responde 503 y no 404, y dice qué falta', async () => {
    // 404 diría que la ruta está mal y mandaría a buscar el problema donde no está.
    const { opciones } = montar({});

    const r = await procesarEntrega(
      opciones,
      'whatsapp',
      { [CABECERA_FIRMA]: 'sha256=loquesea' },
      '{}',
    );

    assert.equal(r.estado, 503);
    assert.match(r.motivo ?? '', /WHATSAPP_ID_NUMERO/);
  });
});

describe('el borde — techos de tamaño', () => {
  test('un cuerpo dentro del techo se lee entero', async () => {
    const cuerpo = 'a'.repeat(1000);
    assert.equal(await leerCuerpo(peticionFalsa(cuerpo)), cuerpo);
  });

  test('un content-length excesivo se rechaza antes de leer nada', async () => {
    await assert.rejects(leerCuerpo(peticionFalsa('x', '999999999')), ErrorDeTamano);
  });

  test('un emisor que MIENTE en content-length también se corta', async () => {
    // Declara poco y envía mucho. Sin comprobación por trozo, llenaría la memoria.
    const enorme = 'a'.repeat(300_000);
    await assert.rejects(leerCuerpo(peticionFalsa(enorme, '10')), ErrorDeTamano);
  });

  test('el techo cuenta bytes, no caracteres', async () => {
    // 'ñ' ocupa dos bytes. Contando caracteres, esto pasaría el techo.
    const techo = 10;
    await assert.rejects(leerCuerpo(peticionFalsa('ñ'.repeat(6)), techo), ErrorDeTamano);
    assert.equal(await leerCuerpo(peticionFalsa('ñ'.repeat(5)), techo), 'ñ'.repeat(5));
  });
});

describe('el borde — tráfico normal que no genera caso', () => {
  test('una actualización sin mensaje responde 200 y no agrupa nada', async () => {
    const { opciones, almacen } = montar();

    const r = await procesarEntrega(
      opciones,
      'telegram',
      { [CABECERA_SECRETO]: SECRETO },
      JSON.stringify({ update_id: 99 }),
    );

    assert.equal(r.estado, 200);
    assert.equal(r.aceptados, 0);
    assert.deepEqual(await almacen.recogerGruposVencidos(T0 + 999_999), []);
  });

  test('un cuerpo firmado pero no-JSON responde 200 para que no reintente en bucle', async () => {
    const { opciones } = montar();

    const r = await procesarEntrega(
      opciones,
      'telegram',
      { [CABECERA_SECRETO]: SECRETO },
      'esto no es json',
    );

    assert.equal(r.estado, 200);
    assert.match(r.motivo ?? '', /no es JSON/);
  });
});

describe('el servidor HTTP de verdad', () => {
  test('rutas, índice y techo por origen', async () => {
    const { opciones } = montar();
    const servidor = crearServidor(opciones);

    await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
    const { port } = servidor.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    try {
      const indice = await fetch(base);
      assert.equal(indice.status, 200);
      // Lo que se veía antes en el navegador era un 404 seco.
      assert.match(await indice.text(), /POST \/webhook\/telegram/);

      assert.equal((await fetch(`${base}/salud`)).status, 200);

      const canales = await fetch(`${base}/canales`);
      assert.equal(canales.headers.get('content-type'), 'application/json');

      assert.equal((await fetch(`${base}/admin`)).status, 404);

      // Techo por origen de la prueba: 5. El contador solo cuenta entregas de
      // webhook —las peticiones a `/`, `/salud` y `/canales` no gastan cuota—,
      // así que hace falta llegar a la sexta.
      let ultimo = 0;
      for (let i = 0; i < 6; i += 1) {
        const r = await fetch(`${base}/webhook/telegram`, {
          method: 'POST',
          headers: { [CABECERA_SECRETO]: SECRETO },
          body: JSON.stringify(actualizacion(500 + i)),
        });
        ultimo = r.status;
      }
      assert.equal(ultimo, 429, 'el techo por origen corta antes de leer el cuerpo');
    } finally {
      await new Promise<void>((cerrado) => servidor.close(() => cerrado()));
    }
  });
});
