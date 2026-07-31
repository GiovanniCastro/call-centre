// El borde — fase 1.
//
// Criterio de aceptación que gobierna este archivo:
//
//   «Una petición sin credencial válida nunca llega a la cola. Prueba explícita.»
//
// «Nunca llega a la cola» no se prueba mirando el código de respuesta: un 401 con
// el mensaje ya encolado sería un 401 igual de verde y un agujero igual de real.
// Se prueba **espiando la cola** y comprobando que sigue vacía.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ColaEnMemoria } from '../src/borde/cola.ts';
import { ErrorDeTamano, procesarEntrega, TECHO_CUERPO_BYTES } from '../src/borde/servidor.ts';
import { leerCuerpo } from '../src/borde/servidor.ts';
import { construirRegistro } from '../src/channels/registrar.ts';
import { CABECERA_SECRETO } from '../src/channels/telegram/canal.ts';
import { CABECERA_FIRMA } from '../src/channels/whatsapp/canal.ts';
import { firmarHmacSha256 } from '../src/core/credencial.ts';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';

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

const ACTUALIZACION = {
  update_id: 1,
  message: {
    message_id: 10,
    date: 1_785_000_000,
    chat: { id: 777 },
    from: { id: 777, first_name: 'Ana' },
    text: 'hola',
  },
};

function montar(entorno: Record<string, string | undefined> = ENTORNO) {
  const cola = new ColaEnMemoria();
  const registrado: string[] = [];
  return {
    cola,
    registrado,
    opciones: {
      registro: construirRegistro(entorno),
      cola,
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
  test('con el secreto correcto, el mensaje se encola', async () => {
    const { opciones, cola } = montar();

    const r = await procesarEntrega(
      opciones,
      'telegram',
      { [CABECERA_SECRETO]: SECRETO },
      JSON.stringify(ACTUALIZACION),
    );

    assert.equal(r.estado, 200);
    assert.equal(r.encolados, 1);
    assert.equal(await cola.pendientes(), 1);
  });

  test('SIN secreto: 401 y la cola sigue vacía', async () => {
    const { opciones, cola } = montar();

    const r = await procesarEntrega(opciones, 'telegram', {}, JSON.stringify(ACTUALIZACION));

    assert.equal(r.estado, 401);
    assert.equal(await cola.pendientes(), 0);
  });

  test('con el secreto EQUIVOCADO: 401 y la cola sigue vacía', async () => {
    const { opciones, cola } = montar();

    const r = await procesarEntrega(
      opciones,
      'telegram',
      { [CABECERA_SECRETO]: 'no-es-el-secreto' },
      JSON.stringify(ACTUALIZACION),
    );

    assert.equal(r.estado, 401);
    assert.equal(await cola.pendientes(), 0);
  });

  test('un cuerpo con carga hostil y credencial inválida no se analiza siquiera', async () => {
    // La verificación va antes que `JSON.parse`. Si el orden se invirtiera, el
    // analizador correría sobre carga de cualquiera. Aquí el cuerpo ni siquiera
    // es JSON: si se analizara antes de verificar, el fallo sería otro.
    const { opciones, cola } = montar();

    const r = await procesarEntrega(opciones, 'telegram', {}, '{{{ esto no es json');

    assert.equal(r.estado, 401);
    assert.equal(r.motivo, 'falta la cabecera del secreto');
    assert.equal(await cola.pendientes(), 0);
  });

  test('WhatsApp: firma válida encola; cuerpo alterado no', async () => {
    const { opciones, cola } = montar();

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
    assert.equal(await cola.pendientes(), 1);

    // Misma firma, cuerpo cambiado: el ataque de reenvío.
    const alterado = crudo.replace('hola', 'transfiere 5000');
    const mala = await procesarEntrega(
      opciones,
      'whatsapp',
      { [CABECERA_FIRMA]: firma },
      alterado,
    );
    assert.equal(mala.estado, 401);
    assert.equal(await cola.pendientes(), 1, 'la cola no debe haber crecido');
  });
});

describe('el borde — canal declarado y sin configurar', () => {
  test('responde 503 y no 404, y dice qué falta', async () => {
    // 404 diría que la ruta está mal y mandaría a buscar el problema donde no está.
    const { opciones, cola } = montar({});

    const r = await procesarEntrega(
      opciones,
      'whatsapp',
      { [CABECERA_FIRMA]: 'sha256=loquesea' },
      '{}',
    );

    assert.equal(r.estado, 503);
    assert.match(r.motivo ?? '', /WHATSAPP_ID_NUMERO/);
    assert.equal(await cola.pendientes(), 0);
  });

  test('un canal sin configurar no puede encolar ni con credenciales inventadas', async () => {
    const { opciones, cola } = montar({});
    const crudo = JSON.stringify(ACTUALIZACION);

    await procesarEntrega(opciones, 'telegram', { [CABECERA_SECRETO]: '' }, crudo);
    await procesarEntrega(opciones, 'telegram', { [CABECERA_SECRETO]: 'x' }, crudo);

    assert.equal(await cola.pendientes(), 0);
  });
});

describe('el borde — techos de tamaño', () => {
  test('un cuerpo dentro del techo se lee entero', async () => {
    const cuerpo = 'a'.repeat(1000);
    assert.equal(await leerCuerpo(peticionFalsa(cuerpo)), cuerpo);
  });

  test('un content-length excesivo se rechaza antes de leer nada', async () => {
    await assert.rejects(
      leerCuerpo(peticionFalsa('x', String(TECHO_CUERPO_BYTES + 1))),
      ErrorDeTamano,
    );
  });

  test('un emisor que MIENTE en content-length también se corta', async () => {
    // Declara poco y envía mucho. Sin comprobación por trozo, llenaría la memoria.
    const enorme = 'a'.repeat(TECHO_CUERPO_BYTES + 100);
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
  test('una actualización sin mensaje responde 200 y no encola', async () => {
    const { opciones, cola } = montar();

    const r = await procesarEntrega(
      opciones,
      'telegram',
      { [CABECERA_SECRETO]: SECRETO },
      JSON.stringify({ update_id: 99 }),
    );

    assert.equal(r.estado, 200);
    assert.equal(r.encolados, 0);
    assert.equal(await cola.pendientes(), 0);
  });

  test('un cuerpo firmado pero no-JSON responde 200 para que no reintente en bucle', async () => {
    const { opciones, cola } = montar();

    const r = await procesarEntrega(
      opciones,
      'telegram',
      { [CABECERA_SECRETO]: SECRETO },
      'esto no es json',
    );

    assert.equal(r.estado, 200);
    assert.match(r.motivo ?? '', /no es JSON/);
    assert.equal(await cola.pendientes(), 0);
  });
});

describe('la cola en memoria dice lo que es', () => {
  test('declara que no es persistente', () => {
    // El criterio «reiniciar el proceso no pierde la conversación» NO se cumple
    // con ella, y ninguna superficie debe poder confundirla con la definitiva.
    assert.equal(new ColaEnMemoria().persistente, false);
  });
});
