// Fase 3B — el segundo canal, que convierte en prueba el criterio de la fase 1.
//
//   «El núcleo no importa nada específico del canal.»
//
// Hasta ahora eso se verificaba leyendo código y con el check de arquitectura.
// La única verificación real es un segundo canal: si añadirlo hubiera exigido
// tocar `src/core/`, la abstracción `Canal` no servía. El diff del PR lo enseña;
// estas pruebas comprueban lo que el diff no puede.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { construirRegistro, parteDeCanales } from '../src/channels/registrar.ts';
import { crearCanalLote } from '../src/channels/lote/canal.ts';
import { leerArchivo, normalizarCaso } from '../src/channels/lote/normalizar.ts';
import { crearCanalTelegram } from '../src/channels/telegram/canal.ts';
import { CANALES } from '../src/telemetry/evento.ts';
import type { MensajeCanonico } from '../src/core/mensaje.ts';

const CHAT = '5550001';
const MENSAJE = '¿Cuánto cuesta el seguro de inquilino?';
const CUANDO = 1_785_000_000;

const CARGA_TELEGRAM = {
  update_id: 900_001,
  message: {
    message_id: 42,
    date: CUANDO,
    chat: { id: Number(CHAT) },
    from: { id: Number(CHAT), first_name: 'Ana', last_name: 'Ruiz' },
    text: MENSAJE,
  },
};

/** El mismo caso, escrito para el lote. */
const CASO_DE_LOTE = {
  id: `telegram:${CHAT}:42`,
  contacto: CHAT,
  nombre: 'Ana Ruiz',
  texto: MENSAJE,
  marca_tiempo: new Date(CUANDO * 1000).toISOString(),
};

function unico(mensajes: readonly MensajeCanonico[]): MensajeCanonico {
  assert.equal(mensajes.length, 1, 'se esperaba exactamente un mensaje canónico');
  return mensajes[0]!;
}

describe('el canal de lote', () => {
  test('EL MISMO CASO POR TELEGRAM Y POR LOTE PRODUCE LO MISMO SALVO EL CANAL', () => {
    const telegram = crearCanalTelegram({ token: 'x', secretoWebhook: 'y' });
    const lote = crearCanalLote();

    const porTelegram = unico(telegram.normalizar(CARGA_TELEGRAM));
    const porLote = unico(lote.normalizar(CASO_DE_LOTE));

    assert.equal(porTelegram.canal, 'telegram');
    assert.equal(porLote.canal, 'lote');

    // Todo lo demás, idéntico. Si divergiera un campo, el corredor de la fase 7
    // estaría midiendo un camino paralelo al de producción en vez del real.
    const { canal: _a, ...restoTelegram } = porTelegram;
    const { canal: _b, ...restoLote } = porLote;
    assert.deepEqual(restoLote, restoTelegram);
  });

  test('UN CANAL NUEVO NO OBLIGÓ A TOCAR EL NÚCLEO', () => {
    // `lote` ya estaba en el contrato de datos desde la fase 0: el segundo canal
    // no inventa una categoría, usa una que el esquema declaraba. Si hubiera
    // habido que añadirla aquí, el canal habría modificado el núcleo.
    assert.ok(CANALES.includes('lote'));
  });

  test('EL LOTE RECHAZA CUALQUIER ENTREGA DE RED, SIEMPRE', () => {
    const lote = crearCanalLote();

    // No hay credencial que lo abra: se alimenta desde archivos que ya están
    // dentro del perímetro. Devolver «válida» sin comprobar nada abriría un canal
    // sin credencial el día que alguien lo enganchara al webhook.
    for (const intento of [
      { cabeceras: {}, cuerpoCrudo: '{}' },
      { cabeceras: { authorization: 'Bearer lo-que-sea' }, cuerpoCrudo: '{}' },
      { cabeceras: { 'x-telegram-bot-api-secret-token': 'y' }, cuerpoCrudo: '{}' },
    ]) {
      const veredicto = lote.verificarCredencial(intento);
      assert.equal(veredicto.valida, false);
      assert.match(veredicto.valida === false ? veredicto.motivo : '', /no acepta entregas de red/);
    }
  });

  test('un caso mal escrito se descarta sin tumbar los demás', () => {
    // Igual que una carga malformada de Telegram: se descarta y se registra. Un
    // caso roto en un lote de cien no puede llevarse por delante los otros
    // noventa y nueve.
    assert.deepEqual(normalizarCaso({ id: 'sin-contacto' }), []);
    assert.deepEqual(normalizarCaso(null), []);
    assert.equal(normalizarCaso(CASO_DE_LOTE).length, 1);
  });

  test('responder recoge en memoria en vez de abrir un socket', async () => {
    const lote = crearCanalLote();
    await lote.responder({ identificador_externo: CHAT }, 'Desde $5 al mes.');

    const recogidas = lote.respuestas();
    assert.equal(recogidas.length, 1);
    assert.equal(recogidas[0]?.texto, 'Desde $5 al mes.');
    assert.equal(recogidas[0]?.identificador_externo, CHAT);
  });

  test('los identificadores del lote son estables entre ejecuciones', () => {
    // El corredor de la fase 7 corre el mismo lote contra los tres modos. Si los
    // identificadores se generaran solos, no habría forma de emparejar las tres
    // ejecuciones y la comparación no significaría nada.
    const primera = unico(normalizarCaso(CASO_DE_LOTE));
    const segunda = unico(normalizarCaso(CASO_DE_LOTE));
    assert.equal(primera.id_externo, segunda.id_externo);
  });
});

describe('el archivo de lote', () => {
  const ARCHIVO = {
    version: 1 as const,
    lote: 'pruebas-3b',
    casos: [CASO_DE_LOTE, { ...CASO_DE_LOTE, id: 'otro', contacto: '5550002' }],
  };

  test('un archivo válido se lee entero', () => {
    const leido = leerArchivo(ARCHIVO);
    assert.equal(leido.casos.length, 2);
    assert.equal(leido.lote, 'pruebas-3b');
  });

  test('UN ARCHIVO INVÁLIDO FALLA RUIDOSAMENTE, no a medias', () => {
    // Un lote corrido a medias produciría un informe comparativo sobre un
    // subconjunto distinto en cada modo, y esa comparación no diría nada.
    assert.throws(() => leerArchivo({ version: 1, lote: 'x', casos: [] }), /no valida/);
    assert.throws(() => leerArchivo({ version: 2, lote: 'x', casos: [CASO_DE_LOTE] }), /no valida/);
  });

  test('el caso puede declarar lo que espera, y el canal lo ignora', () => {
    // `esperado` es del corredor de la fase 7, no del canal. Que el canal lo
    // ignore es lo que impide que una expectativa acabe influyendo en la
    // ejecución que debería juzgar.
    const conEsperado = { ...CASO_DE_LOTE, esperado: { respuesta: 'Desde $5', debe_escalar: false } };
    const mensaje = unico(normalizarCaso(conEsperado));

    assert.equal(mensaje.contenido, MENSAJE);
    assert.ok(!JSON.stringify(mensaje).includes('esperado'));
  });
});

describe('el registro con tres canales', () => {
  test('el lote queda configurado sin credenciales; WhatsApp, declarado sin ellas', () => {
    const registro = construirRegistro({});

    assert.equal(registro.estaConfigurado('lote'), true);
    assert.equal(registro.estaConfigurado('whatsapp'), false);
    assert.equal(registro.estaConfigurado('telegram'), false);
  });

  test('NINGUNA CIFRA CUENTA UN CANAL NO CONFIGURADO', () => {
    // Un conector declarado no es un canal activo. Confundirlos inflaría el
    // denominador de todo lo que se divide por casos, y el panel enseñaría un
    // porcentaje calculado sobre canales que nunca recibieron nada.
    const registro = construirRegistro({});
    const activos = registro.activos();

    assert.deepEqual([...activos], ['lote']);
    assert.ok(!activos.includes('whatsapp'));

    // Y no se puede enviar por uno no configurado ni por descuido: `obtener`
    // lanza en vez de devolver algo con lo que se pueda intentar.
    assert.throws(() => registro.obtener('whatsapp'), /declarado pero no configurado/);
  });

  test('el parte de arranque distingue los tres estados', () => {
    const parte = parteDeCanales(construirRegistro({ TELEGRAM_BOT_TOKEN: 'a', TELEGRAM_WEBHOOK_SECRET: 'b' }));

    assert.match(parte, /✓ telegram — activo/);
    assert.match(parte, /✓ lote — activo/);
    assert.match(parte, /✗ whatsapp — declarado, sin configurar/);
    // Y dice qué le falta, con cómo obtenerlo: es lo que lee quien va a instalarlo.
    assert.match(parte, /WHATSAPP_SECRETO_APP/);
    assert.match(parte, /developers\.facebook\.com/);
  });
});
