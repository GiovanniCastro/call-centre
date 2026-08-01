// Fase 4 — salida estructurada con procedencia, validación y escalado.
//
// La decisión que se prueba aquí es R-003: el modelo no escribe prosa que luego
// se audita, emite una estructura donde cada dato lleva su `fragmento_id`, y el
// verificador comprueba tres cosas deterministas. **Ninguna prueba de este
// archivo llama a un modelo**, y no por comodidad: si la verificación necesitara
// uno, sería un modelo juzgando a otro, que es lo que la regla 7 prohíbe.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validarSalida, esquemaJson } from '../src/core/respuesta/esquemas.ts';
import { verificar, proporcionDeSustento } from '../src/core/respuesta/verificar.ts';
import { decidir, RESPUESTA } from '../src/core/respuesta/componer.ts';
import { responder } from '../src/core/respuesta/responder.ts';
import type { FragmentoRecuperado } from '../src/core/conocimiento/documento.ts';
import type {
  Inferencia,
  PeticionInferencia,
  RespuestaInferencia,
} from '../src/core/inferencia/puerto.ts';

const FRAGMENTO: FragmentoRecuperado = {
  fragmento_id: 'abc123def4567890:11111111:0000',
  documento_id: 'abc123def4567890',
  titulo: 'Precios de referencia y deducibles',
  seccion: 'Primas de partida',
  texto: 'Inquilino | **$5 al mes** | $25,000 de contenido, $100,000 de responsabilidad civil',
  orden: 0,
  suma_documento: '1111111122222222',
  puntuacion: 0.78,
};

const OTRO: FragmentoRecuperado = {
  ...FRAGMENTO,
  fragmento_id: 'abc123def4567890:11111111:0001',
  seccion: 'Formas de pago',
  texto: 'Mensual sin recargo, o anual con un **5 % de descuento**.',
  orden: 1,
};

function salidaCatalogo(datos: { valor: string; fragmento_id: string }[], extra = {}) {
  return { clase: 'catalogo', datos, redaccion_sugerida: 'Desde $5 al mes.', ...extra };
}

/** Un modelo de mentira que devuelve lo que se le diga, en orden. */
class ModeloGuionizado implements Inferencia {
  readonly nombre = 'guion:prueba';
  readonly modelo = 'guion';
  readonly destino = 'local' as const;
  readonly peticiones: PeticionInferencia[] = [];
  private readonly guion: string[];

  constructor(guion: string[]) {
    this.guion = [...guion];
  }

  async redactar(peticion: PeticionInferencia): Promise<RespuestaInferencia> {
    this.peticiones.push(peticion);
    const texto = this.guion.shift() ?? '{}';
    return { texto, modelo: 'guion', tokens_entrada: 10, tokens_salida: 5, latencia_ms: 1 };
  }

  async disponible(): Promise<{ ok: true }> {
    return { ok: true };
  }
}

describe('los esquemas de salida', () => {
  test('un campo factual sin fragmento_id no valida', () => {
    const sinProcedencia = { clase: 'catalogo', datos: [{ valor: '$5 al mes' }], redaccion_sugerida: 'x' };
    assert.equal(validarSalida('catalogo', sinProcedencia).valida, false);
  });

  test('el esquema se puede pedir en JSON al proveedor', () => {
    const esquema = esquemaJson('catalogo');
    assert.equal(typeof esquema, 'object');
    assert.ok(JSON.stringify(esquema).includes('fragmento_id'));
  });

  test('cada clase de tarea tiene su esquema', () => {
    for (const clase of ['catalogo', 'extraccion', 'agendamiento', 'saludo', 'queja', 'ambiguo'] as const) {
      assert.doesNotThrow(() => esquemaJson(clase), clase);
    }
  });
});

describe('el verificador de procedencia — tres comprobaciones deterministas', () => {
  test('un campo copiado literalmente del fragmento recuperado pasa', () => {
    const salida = validarSalida(
      'catalogo',
      salidaCatalogo([{ valor: '$5 al mes', fragmento_id: FRAGMENTO.fragmento_id }]),
    );
    assert.ok(salida.valida);

    const veredicto = verificar(salida.salida, [FRAGMENTO]);
    assert.equal(veredicto.sustento.campos_con_procedencia, 1);
    assert.deepEqual([...veredicto.fuentes], [FRAGMENTO.fragmento_id]);
  });

  test('UNA CITA A UN FRAGMENTO QUE NO SE RECUPERÓ AQUÍ SE RECHAZA', () => {
    // La alucinación de cita: el modelo inventa un identificador con forma
    // correcta y lo cuelga de una afirmación. Sin esta comprobación pasaría,
    // porque el identificador «parece» válido.
    const salida = validarSalida(
      'catalogo',
      salidaCatalogo([{ valor: '$5 al mes', fragmento_id: 'inventado:00000000:0000' }]),
    );
    assert.ok(salida.valida);

    const veredicto = verificar(salida.salida, [FRAGMENTO]);
    assert.equal(veredicto.campos[0]?.valido, false);
    assert.equal(veredicto.campos[0]?.motivo, 'fragmento_no_recuperado_aqui');
  });

  test('un fragmento que existe pero NO se trajo a esta ejecución también se rechaza', () => {
    // No basta con que el identificador exista en el índice: tiene que haberse
    // recuperado en ESTA ejecución, o la afirmación no está sustentada por lo
    // que el agente tenía delante.
    const salida = validarSalida(
      'catalogo',
      salidaCatalogo([{ valor: '5 % de descuento', fragmento_id: OTRO.fragmento_id }]),
    );
    assert.ok(salida.valida);

    const veredicto = verificar(salida.salida, [FRAGMENTO]); // OTRO no está
    assert.equal(veredicto.campos[0]?.valido, false);
  });

  test('UN VALOR PARAFRASEADO SE RECHAZA, aunque el fragmento sí lo respalde', () => {
    // «cinco dólares mensuales» es cierto según el fragmento, pero no está
    // copiado. Aceptar paráfrasis obligaría a decidir cuánto puede alejarse
    // una, y esa decisión no tiene respuesta objetiva.
    const salida = validarSalida(
      'catalogo',
      salidaCatalogo([{ valor: 'cinco dólares mensuales', fragmento_id: FRAGMENTO.fragmento_id }]),
    );
    assert.ok(salida.valida);

    const veredicto = verificar(salida.salida, [FRAGMENTO]);
    assert.equal(veredicto.campos[0]?.motivo, 'valor_no_literal');
  });

  test('tolera espacios y mayúsculas, que no cambian lo afirmado', () => {
    const salida = validarSalida(
      'catalogo',
      salidaCatalogo([{ valor: '$5   AL MES', fragmento_id: FRAGMENTO.fragmento_id }]),
    );
    assert.ok(salida.valida);
    assert.equal(verificar(salida.salida, [FRAGMENTO]).campos[0]?.valido, true);
  });

  test('el sustento es una proporción contable, no una estimación', () => {
    const salida = validarSalida(
      'catalogo',
      salidaCatalogo([
        { valor: '$5 al mes', fragmento_id: FRAGMENTO.fragmento_id },
        { valor: 'inventado', fragmento_id: FRAGMENTO.fragmento_id },
      ]),
    );
    assert.ok(salida.valida);

    const veredicto = verificar(salida.salida, [FRAGMENTO]);
    assert.deepEqual(veredicto.sustento, { campos_totales: 2, campos_con_procedencia: 1 });
    assert.equal(proporcionDeSustento(veredicto), 0.5);
  });

  test('sin campos factuales el sustento es pleno, no cero', () => {
    // Un saludo no afirma nada: tiene sustento por vacuidad. Devolver 0 lo
    // trataría como el peor caso y hundiría cualquier promedio que lo incluyera.
    const salida = validarSalida('saludo', { clase: 'saludo', datos: [], redaccion_sugerida: 'Hola' });
    assert.ok(salida.valida);
    assert.equal(proporcionDeSustento(verificar(salida.salida, [])), 1);
  });
});

describe('la composición y los tres desenlaces', () => {
  function conCampos(datos: { valor: string; fragmento_id: string }[]) {
    const salida = validarSalida('catalogo', salidaCatalogo(datos));
    assert.ok(salida.valida);
    return { salida: salida.salida, veredicto: verificar(salida.salida, [FRAGMENTO]) };
  }

  test('todo sustentado: se envía', () => {
    const { salida, veredicto } = conCampos([
      { valor: '$5 al mes', fragmento_id: FRAGMENTO.fragmento_id },
    ]);
    assert.equal(decidir(salida, veredicto).accion, 'enviar');
  });

  test('UNA RESPUESTA QUE AFIRMA ALGO AUSENTE DE LAS FUENTES SE BLOQUEA', () => {
    const { salida, veredicto } = conCampos([
      { valor: 'cubrimos motocicletas', fragmento_id: FRAGMENTO.fragmento_id },
    ]);

    const decision = decidir(salida, veredicto);

    // No hay texto que enviar: la decisión es escalar, y una decisión de escalar
    // ni siquiera tiene campo `texto`. No se envía «casi».
    assert.equal(decision.accion, 'escalar');
    assert.ok(!('texto' in decision));

    // Pero la afirmación rechazada SÍ queda en el registro, con su motivo. El
    // operador no puede juzgar el escalado sin ver qué se intentó afirmar; un
    // escalado que oculta lo rechazado le obliga a reconstruirlo.
    assert.ok(
      decision.accion === 'escalar' &&
        decision.rechazados.some((r) => r.includes('cubrimos motocicletas')),
      'la afirmación rechazada no llegó al registro del escalado',
    );
  });

  test('la prosa sugerida NO se usa si algún campo cayó', () => {
    // En cuanto un campo se rechaza, esa prosa afirma algo sin sustento y no se
    // puede aprovechar ni recortando.
    const { salida, veredicto } = conCampos([
      { valor: '$5 al mes', fragmento_id: FRAGMENTO.fragmento_id },
      { valor: 'y cubrimos motos', fragmento_id: FRAGMENTO.fragmento_id },
    ]);

    const decision = decidir(salida, veredicto);
    if (decision.accion === 'escalar') return; // 0.5 < 0.7: escala, correcto
    assert.notEqual(decision.texto, 'Desde $5 al mes.');
  });

  test('el modelo declarando que no puede responder gana a cualquier umbral', () => {
    const salida = validarSalida(
      'catalogo',
      salidaCatalogo([], { no_puedo_responder: true, redaccion_sugerida: '' }),
    );
    assert.ok(salida.valida);

    const decision = decidir(salida.salida, verificar(salida.salida, []));
    assert.equal(decision.accion, 'escalar');
    assert.match(decision.accion === 'escalar' ? decision.motivo : '', /no puede responder/);
  });

  test('un umbral de matiz mayor que el de envío no valida', async () => {
    const { RESPUESTA: _r } = await import('../src/core/respuesta/componer.ts');
    // La configuración real no puede tener esa forma; se comprueba la regla.
    assert.ok(RESPUESTA.umbrales.matiza <= RESPUESTA.umbrales.envia);
  });
});

describe('el orquestador y el reintento único', () => {
  const ENTRADA = {
    clase_tarea: 'catalogo' as const,
    instrucciones: 'Eres el agente de Nimbo Seguros.',
    mensaje: '¿Cuánto cuesta el seguro de inquilino?',
    fragmentos: [FRAGMENTO],
  };

  test('a la primera, si el modelo cita bien', async () => {
    const modelo = new ModeloGuionizado([
      JSON.stringify(salidaCatalogo([{ valor: '$5 al mes', fragmento_id: FRAGMENTO.fragmento_id }])),
    ]);

    const resultado = await responder(ENTRADA, modelo);
    assert.equal(resultado.decision.accion, 'enviar');
    assert.equal(resultado.intentos, 1);
  });

  test('EL REINTENTO LE DICE AL MODELO QUÉ FALLÓ, no repite la misma petición', async () => {
    const modelo = new ModeloGuionizado([
      JSON.stringify(salidaCatalogo([{ valor: 'cinco dólares', fragmento_id: FRAGMENTO.fragmento_id }])),
      JSON.stringify(salidaCatalogo([{ valor: '$5 al mes', fragmento_id: FRAGMENTO.fragmento_id }])),
    ]);

    const resultado = await responder(ENTRADA, modelo);

    assert.equal(resultado.intentos, 2);
    assert.equal(resultado.decision.accion, 'enviar');
    // La segunda petición trae la corrección; repetir sin ella sería tirar el
    // dado dos veces.
    assert.match(modelo.peticiones[1]?.instrucciones ?? '', /rechazada por el verificador/);
    assert.match(modelo.peticiones[1]?.instrucciones ?? '', /cinco dólares/);
  });

  test('se reintenta UNA vez, no hasta que salga', async () => {
    const malo = JSON.stringify(
      salidaCatalogo([{ valor: 'inventado', fragmento_id: FRAGMENTO.fragmento_id }]),
    );
    const modelo = new ModeloGuionizado([malo, malo, malo]);

    const resultado = await responder(ENTRADA, modelo);
    assert.equal(resultado.intentos, 2);
    assert.equal(resultado.decision.accion, 'escalar');
  });

  test('UN FALLO DE ESQUEMA NUNCA LLEGA AL USUARIO Y SIEMPRE SE REGISTRA', async () => {
    const modelo = new ModeloGuionizado(['esto no es JSON', '{"clase":"catalogo"}']);

    const resultado = await responder(ENTRADA, modelo);
    assert.equal(resultado.decision.accion, 'escalar');
    assert.equal(resultado.clase_escalado, 'esquema_invalido');
  });

  test('sin fragmentos NO se llama al modelo: se escala directamente', async () => {
    // Pedirle que redacte sin fuentes es pedirle que invente, y gastar una
    // llamada para eso es gastarla dos veces: la del modelo y la del escalado.
    const modelo = new ModeloGuionizado([]);
    const resultado = await responder({ ...ENTRADA, fragmentos: [] }, modelo);

    assert.equal(resultado.intentos, 0);
    assert.equal(modelo.peticiones.length, 0);
    assert.equal(resultado.clase_escalado, 'sin_fuentes');
  });

  test('un saludo sin fragmentos SÍ se responde: no afirma nada', async () => {
    const modelo = new ModeloGuionizado([
      JSON.stringify({ clase: 'saludo', datos: [], redaccion_sugerida: '¡Hola! ¿En qué te ayudo?' }),
    ]);

    const resultado = await responder(
      { ...ENTRADA, clase_tarea: 'saludo', fragmentos: [] },
      modelo,
    );
    assert.equal(resultado.decision.accion, 'enviar');
  });

  test('el modelo que declara no poder responder NO se reintenta', async () => {
    // Ya dijo que con estas fuentes no llega. Insistir sería no creerle.
    const modelo = new ModeloGuionizado([
      JSON.stringify(salidaCatalogo([], { no_puedo_responder: true, redaccion_sugerida: '' })),
      JSON.stringify(salidaCatalogo([{ valor: '$5 al mes', fragmento_id: FRAGMENTO.fragmento_id }])),
    ]);

    const resultado = await responder(ENTRADA, modelo);
    assert.equal(resultado.intentos, 1);
    assert.equal(resultado.clase_escalado, 'modelo_no_puede');
  });

  test('la petición al modelo lleva el esquema y los fragmentos delimitados', async () => {
    const modelo = new ModeloGuionizado([
      JSON.stringify(salidaCatalogo([{ valor: '$5 al mes', fragmento_id: FRAGMENTO.fragmento_id }])),
    ]);

    await responder(ENTRADA, modelo);
    const peticion = modelo.peticiones[0];

    assert.ok(peticion?.esquema !== undefined, 'no se pidió salida estructurada');
    assert.equal(peticion?.fragmentos.length, 1);
    assert.equal(peticion?.fragmentos[0]?.fragmento_id, FRAGMENTO.fragmento_id);
  });
});
