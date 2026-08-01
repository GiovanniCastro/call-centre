// Fase 1 — la parte que no necesita PostgreSQL ni Redis.
//
// Criterios de aceptación cubiertos aquí:
//   · «Una petición sin credencial válida nunca llega a la cola.»
//   · «El conector de WhatsApp arranca sin credenciales sin romper nada, y
//      declara qué le falta.»
//   · «El núcleo no importa nada específico del canal» — lo verifica el check de
//      arquitectura, no una aserción; aquí se comprueba lo complementario: que dos
//      canales distintos produzcan la misma forma de mensaje.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { EsquemaMensajeCanonico } from '../src/core/mensaje.ts';
import { ErrorDeCanal } from '../src/core/canal.ts';
import { describirRequisitos, RegistroDeCanales } from '../src/core/registro-canales.ts';
import { firmarHmacSha256, igualEnTiempoConstante } from '../src/core/credencial.ts';
import { construirRegistro, parteDeCanales } from '../src/channels/registrar.ts';
import { CABECERA_SECRETO, crearCanalTelegram } from '../src/channels/telegram/canal.ts';
import {
  CABECERA_FIRMA,
  crearCanalWhatsApp,
  responderDesafioDeAlta,
} from '../src/channels/whatsapp/canal.ts';

const SECRETO_TELEGRAM = 'secreto-de-prueba-largo-y-aleatorio';
const SECRETO_APP_WHATSAPP = 'clave-secreta-de-la-aplicacion';

const ENTORNO_COMPLETO = {
  TELEGRAM_BOT_TOKEN: '123456789:AAtoken-de-prueba',
  TELEGRAM_WEBHOOK_SECRET: SECRETO_TELEGRAM,
  WHATSAPP_ID_NUMERO: '1234567890',
  WHATSAPP_TOKEN: 'token-permanente',
  WHATSAPP_SECRETO_APP: SECRETO_APP_WHATSAPP,
  WHATSAPP_TOKEN_VERIFICACION: 'token-de-verificacion',
};

function telegram() {
  return crearCanalTelegram({
    token: 'irrelevante',
    secretoWebhook: SECRETO_TELEGRAM,
    enviar: async () => {},
  });
}

function whatsapp() {
  return crearCanalWhatsApp({
    idNumero: '1',
    token: 't',
    secretoApp: SECRETO_APP_WHATSAPP,
    tokenVerificacion: 'verificacion',
    enviar: async () => {},
  });
}

/** Una actualización de Telegram con un mensaje de texto. */
const ACTUALIZACION_TELEGRAM = {
  update_id: 900001,
  message: {
    message_id: 42,
    date: 1_785_000_000,
    chat: { id: 5_550_001 },
    from: { id: 5_550_001, first_name: 'Ana', last_name: 'Ruiz' },
    text: '¿Cuánto cuesta el seguro de inquilino?',
  },
};

/** La carga equivalente de WhatsApp. */
const CARGA_WHATSAPP = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ wa_id: '5550001', profile: { name: 'Ana Ruiz' } }],
            messages: [
              {
                id: 'wamid.PRUEBA',
                from: '5550001',
                timestamp: '1785000000',
                type: 'text',
                text: { body: '¿Cuánto cuesta el seguro de inquilino?' },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('verificación de credencial — una petición sin credencial no pasa', () => {
  test('Telegram acepta el secreto correcto', () => {
    const r = telegram().verificarCredencial({
      cabeceras: { [CABECERA_SECRETO]: SECRETO_TELEGRAM },
      cuerpoCrudo: '{}',
    });
    assert.equal(r.valida, true);
  });

  test('Telegram rechaza el secreto equivocado', () => {
    const r = telegram().verificarCredencial({
      cabeceras: { [CABECERA_SECRETO]: 'otro-secreto' },
      cuerpoCrudo: '{}',
    });
    assert.equal(r.valida, false);
  });

  test('Telegram rechaza la ausencia de cabecera, sin lanzar', () => {
    const r = telegram().verificarCredencial({ cabeceras: {}, cuerpoCrudo: '{}' });
    assert.equal(r.valida, false);
    if (!r.valida) assert.match(r.motivo, /falta la cabecera/);
  });

  test('Telegram rechaza un prefijo del secreto correcto', () => {
    // El caso que revienta una comparación byte a byte con salida temprana.
    const r = telegram().verificarCredencial({
      cabeceras: { [CABECERA_SECRETO]: SECRETO_TELEGRAM.slice(0, -1) },
      cuerpoCrudo: '{}',
    });
    assert.equal(r.valida, false);
  });

  test('WhatsApp acepta una firma HMAC correcta sobre el cuerpo crudo', () => {
    const cuerpoCrudo = JSON.stringify(CARGA_WHATSAPP);
    const firma = firmarHmacSha256(SECRETO_APP_WHATSAPP, cuerpoCrudo);

    const r = whatsapp().verificarCredencial({
      cabeceras: { [CABECERA_FIRMA]: `sha256=${firma}` },
      cuerpoCrudo,
    });
    assert.equal(r.valida, true);
  });

  test('WhatsApp rechaza el cuerpo alterado aunque la firma sea de un cuerpo válido', () => {
    // El ataque real: reenviar una firma legítima con otro contenido.
    const original = JSON.stringify(CARGA_WHATSAPP);
    const firma = firmarHmacSha256(SECRETO_APP_WHATSAPP, original);
    const alterado = original.replace('seguro de inquilino', 'transferencia bancaria');

    assert.notEqual(original, alterado);

    const r = whatsapp().verificarCredencial({
      cabeceras: { [CABECERA_FIRMA]: `sha256=${firma}` },
      cuerpoCrudo: alterado,
    });
    assert.equal(r.valida, false);
    if (!r.valida) assert.match(r.motivo, /no coincide con el cuerpo/);
  });

  test('WhatsApp rechaza una firma sin el prefijo esperado', () => {
    const cuerpoCrudo = JSON.stringify(CARGA_WHATSAPP);
    const r = whatsapp().verificarCredencial({
      cabeceras: { [CABECERA_FIRMA]: firmarHmacSha256(SECRETO_APP_WHATSAPP, cuerpoCrudo) },
      cuerpoCrudo,
    });
    assert.equal(r.valida, false);
  });

  test('la comparación no distingue longitud: dos cadenas distintas nunca son iguales', () => {
    assert.equal(igualEnTiempoConstante('a', 'a'), true);
    assert.equal(igualEnTiempoConstante('a', 'ab'), false);
    assert.equal(igualEnTiempoConstante('', ''), true);
    assert.equal(igualEnTiempoConstante('', 'x'), false);
  });

  test('el desafío de alta de WhatsApp solo responde al token correcto', () => {
    assert.equal(
      responderDesafioDeAlta('secreto', {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'secreto',
        'hub.challenge': '12345',
      }),
      '12345',
    );

    assert.equal(
      responderDesafioDeAlta('secreto', {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'equivocado',
        'hub.challenge': '12345',
      }),
      null,
    );
  });
});

describe('normalización a mensaje canónico', () => {
  test('Telegram: un mensaje de texto valida contra el esquema canónico', () => {
    const [mensaje] = telegram().normalizar(ACTUALIZACION_TELEGRAM);
    assert.ok(mensaje);
    assert.equal(EsquemaMensajeCanonico.safeParse(mensaje).success, true);
    assert.equal(mensaje.canal, 'telegram');
    assert.equal(mensaje.contacto.identificador_externo, '5550001');
    assert.equal(mensaje.contacto.nombre_declarado, 'Ana Ruiz');
    assert.equal(mensaje.tipo, 'texto');
    assert.equal(mensaje.procedencia, 'cliente');
  });

  test('Telegram: el id externo lleva el chat, no solo el message_id', () => {
    // `message_id` solo es único dentro de su chat. Sin el chat, el rechazo de
    // repetición descartaría el mensaje de un cliente porque otro, en otra
    // conversación, tenía el mismo número.
    const [uno] = telegram().normalizar(ACTUALIZACION_TELEGRAM);
    const [otro] = telegram().normalizar({
      ...ACTUALIZACION_TELEGRAM,
      message: { ...ACTUALIZACION_TELEGRAM.message, chat: { id: 999 } },
    });

    assert.ok(uno && otro);
    assert.notEqual(uno.id_externo, otro.id_externo);
  });

  test('Telegram: una foto toma el tamaño mayor y deja el pie como contenido', () => {
    const [mensaje] = telegram().normalizar({
      update_id: 2,
      message: {
        message_id: 7,
        date: 1_785_000_000,
        chat: { id: 5_550_001 },
        caption: 'esta es mi radiografía',
        photo: [
          { file_id: 'peque', width: 90, height: 90 },
          { file_id: 'grande', width: 1280, height: 1280 },
        ],
      },
    });

    assert.ok(mensaje);
    assert.equal(mensaje.tipo, 'imagen');
    assert.equal(mensaje.contenido, 'esta es mi radiografía');
    assert.equal(mensaje.adjuntos[0]?.referencia_externa, 'grande');
  });

  test('lo que no valida se descarta, no se adivina', () => {
    assert.deepEqual(telegram().normalizar({ basura: true }), []);
    assert.deepEqual(telegram().normalizar(null), []);
    assert.deepEqual(telegram().normalizar('texto suelto'), []);
    assert.deepEqual(whatsapp().normalizar({ entry: 'no es una lista' }), []);
  });

  test('una actualización sin mensaje devuelve vacío, no error', () => {
    // Ediciones, cambios de estado del chat: tráfico normal que no genera caso.
    assert.deepEqual(telegram().normalizar({ update_id: 5 }), []);
  });

  test('WhatsApp: una confirmación de estado NO produce mensaje', () => {
    // Llegan por el mismo webhook y con la misma forma general. Contarlas como
    // casos duplicaría la cuenta de conversaciones.
    const confirmacion = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                statuses: [{ id: 'wamid.X', status: 'read' }],
              },
            },
          ],
        },
      ],
    };
    assert.deepEqual(whatsapp().normalizar(confirmacion), []);
  });

  test('el mismo caso por dos canales produce el mismo mensaje salvo lo propio del canal', () => {
    // Prueba parcial del criterio de la fase 3B: aquí se comprueba la forma; el
    // criterio completo —eventos idénticos salvo el campo `canal`— necesita el
    // núcleo entero y se verifica en su fase.
    const [porTelegram] = telegram().normalizar(ACTUALIZACION_TELEGRAM);
    const [porWhatsApp] = whatsapp().normalizar(CARGA_WHATSAPP);

    assert.ok(porTelegram && porWhatsApp);

    assert.equal(porTelegram.contenido, porWhatsApp.contenido);
    assert.equal(porTelegram.tipo, porWhatsApp.tipo);
    assert.equal(porTelegram.procedencia, porWhatsApp.procedencia);
    assert.equal(porTelegram.marca_tiempo, porWhatsApp.marca_tiempo);
    assert.equal(porTelegram.contacto.nombre_declarado, porWhatsApp.contacto.nombre_declarado);

    // Y difieren exactamente en lo que tiene que diferir.
    assert.notEqual(porTelegram.canal, porWhatsApp.canal);
    assert.notEqual(porTelegram.id_externo, porWhatsApp.id_externo);
  });
});

describe('el registro de canales — declarado no es lo mismo que activo', () => {
  test('con el entorno completo, los canales con credencial quedan activos', () => {
    const registro = construirRegistro(ENTORNO_COMPLETO);
    // `lote` entra desde la fase 3B y no lleva credenciales: siempre activo.
    assert.deepEqual([...registro.activos()].sort(), ['lote', 'telegram', 'whatsapp']);
    assert.equal(registro.estaConfigurado('whatsapp'), true);
  });

  test('sin credenciales de WhatsApp el sistema arranca igual', () => {
    const registro = construirRegistro({
      TELEGRAM_BOT_TOKEN: ENTORNO_COMPLETO.TELEGRAM_BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET: ENTORNO_COMPLETO.TELEGRAM_WEBHOOK_SECRET,
    });

    assert.deepEqual([...registro.activos()].sort(), ['lote', 'telegram']);
    assert.equal(registro.estaConfigurado('whatsapp'), false);
  });

  test('un canal declarado y sin configurar NO se puede usar para enviar', () => {
    const registro = construirRegistro({});
    assert.throws(() => registro.obtener('whatsapp'), ErrorDeCanal);
    assert.throws(() => registro.obtener('telegram'), ErrorDeCanal);
  });

  test('y dice exactamente qué le falta', () => {
    const registro = construirRegistro({
      WHATSAPP_ID_NUMERO: '1',
      WHATSAPP_TOKEN: 'x',
    });

    const whatsappEstado = registro.listar().find((e) => e.nombre === 'whatsapp');
    assert.ok(whatsappEstado);
    assert.equal(whatsappEstado.estado, 'no_configurado');

    if (whatsappEstado.estado === 'no_configurado') {
      assert.deepEqual(whatsappEstado.faltan, [
        'WHATSAPP_SECRETO_APP',
        'WHATSAPP_TOKEN_VERIFICACION',
      ]);
      // Cada requisito trae cómo obtenerlo: es lo que lee quien va a instalarlo.
      for (const requisito of whatsappEstado.requisitos) {
        assert.ok(requisito.como_obtenerlo.length > 20);
      }
    }
  });

  test('una credencial en blanco cuenta como ausente', () => {
    const registro = construirRegistro({ ...ENTORNO_COMPLETO, WHATSAPP_TOKEN: '   ' });
    assert.equal(registro.estaConfigurado('whatsapp'), false);
  });

  test('el parte de arranque nombra lo que falta y cómo conseguirlo', () => {
    const parte = parteDeCanales(construirRegistro({}));

    assert.match(parte, /✗ telegram/);
    assert.match(parte, /✗ whatsapp/);
    assert.match(parte, /@BotFather/);
    assert.match(parte, /WHATSAPP_SECRETO_APP/);
    assert.match(parte, /developers\.facebook\.com/);
  });

  test('registrar dos veces el mismo canal es un error, no la última gana', () => {
    const registro = new RegistroDeCanales();
    const estado = {
      estado: 'no_configurado',
      nombre: 'telegram',
      requisitos: [],
      faltan: [],
    } as const;

    registro.registrar(estado);
    assert.throws(() => registro.registrar(estado), ErrorDeCanal);
  });

  test('describirRequisitos distingue lo presente de lo ausente', () => {
    const registro = construirRegistro({ TELEGRAM_BOT_TOKEN: 'x' });
    const telegramEstado = registro.listar().find((e) => e.nombre === 'telegram');
    assert.ok(telegramEstado);

    const texto = describirRequisitos(telegramEstado);
    assert.match(texto, /✓ TELEGRAM_BOT_TOKEN/);
    assert.match(texto, /✗ TELEGRAM_WEBHOOK_SECRET/);
  });
});
