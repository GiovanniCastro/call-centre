// Fase 3 — clasificación determinista, saneo y política de enrutamiento.
//
// Nada de este archivo llama a un modelo, y eso no es una comodidad de la
// prueba: es la propiedad que se está comprobando. Clasificar la sensibilidad es
// lo que decide si un texto sale del perímetro; pedirle esa decisión a un modelo
// significaría enviar el texto para saber si se puede enviar el texto.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { clasificar, clasificarSensibilidad, clasificarTarea } from '../src/core/enrutador/clasificar.ts';
import { decidir, politicaDesde, POLITICA } from '../src/core/enrutador/politica.ts';
import { restituir, sanear, tokensHuerfanos } from '../src/core/saneo/sanear.ts';
import { detectar } from '../src/core/saneo/patrones.ts';

describe('el clasificador de tarea', () => {
  const casos: readonly [string, string][] = [
    ['Hola, buenas tardes', 'saludo'],
    ['¿Cuánto cuesta el seguro de inquilino?', 'catalogo'],
    ['¿Cubrís los daños por granizo?', 'catalogo'],
    ['Quiero agendar el peritaje de mi coche', 'agendamiento'],
    ['Llevo tres semanas esperando el pago y nadie me contesta', 'queja'],
    ['Quiero contratar la póliza de mascotas', 'extraccion'],
    ['El cielo está muy azul hoy', 'ambiguo'],
  ];

  for (const [texto, esperada] of casos) {
    test(`«${texto.slice(0, 40)}» → ${esperada}`, () => {
      assert.equal(clasificarTarea(texto).clase, esperada);
    });
  }

  test('la queja gana al catálogo cuando el mensaje es las dos cosas', () => {
    // «Llevo tres semanas esperando el pago de mi siniestro» menciona el
    // producto, pero responder con una tarifa a quien protesta es el peor
    // desenlace posible.
    const mixto = 'Llevo tres semanas esperando y quiero saber qué cubre mi póliza';
    assert.equal(clasificarTarea(mixto).clase, 'queja');
  });

  test('un saludo con petición detrás NO es un saludo', () => {
    assert.equal(clasificarTarea('Hola, quiero cancelar mi póliza').clase, 'extraccion');
  });

  test('«ambiguo» no es un fallo: es el clasificador diciendo que no lo sabe', () => {
    const resultado = clasificarTarea('mmm');
    assert.equal(resultado.clase, 'ambiguo');
    assert.match(resultado.porque, /ningún marcador/);
  });

  test('el motivo siempre nombra el marcador que disparó', () => {
    assert.match(clasificarTarea('¿cuánto cuesta?').porque, /marcador/);
  });
});

describe('la detección de identificadores', () => {
  test('un número de seguro social con guiones se detecta sin contexto', () => {
    const hallazgos = detectar('mi número es 123-45-6789');
    assert.equal(hallazgos.length, 1);
    assert.equal(hallazgos[0]?.tipo, 'ssn');
  });

  test('nueve cifras seguidas SOLO son un SSN si algo las nombra', () => {
    assert.equal(detectar('el pedido 123456789 llegó tarde').length, 0);
    assert.equal(detectar('mi seguro social es 123456789')[0]?.tipo, 'ssn');
  });

  test('una tarjeta se confirma con Luhn, no por tener dieciséis cifras', () => {
    // 4111 1111 1111 1111 es un número de prueba válido según Luhn.
    assert.equal(detectar('pago con 4111 1111 1111 1111')[0]?.tipo, 'tarjeta');
    // Mismo formato, dígito de control roto: no es una tarjeta.
    assert.equal(detectar('la referencia 4111 1111 1111 1112').length, 0);
  });

  test('un número de cuenta exige que alguien lo llame cuenta', () => {
    assert.equal(detectar('el expediente 12345678901 sigue abierto').length, 0);
    assert.equal(detectar('mi cuenta es 12345678901')[0]?.tipo, 'cuenta');
  });

  test('los hallazgos no se solapan', () => {
    // Una tarjeta cerca de la palabra «cuenta» casa con los dos detectores.
    // Enmascarar dos veces dejaría un token dentro de otro.
    const hallazgos = detectar('cargad a mi cuenta la tarjeta 4111 1111 1111 1111');
    for (let i = 1; i < hallazgos.length; i += 1) {
      assert.ok(hallazgos[i]!.inicio >= hallazgos[i - 1]!.fin, 'dos hallazgos se solapan');
    }
  });
});

describe('el clasificador de sensibilidad', () => {
  test('un SSN sube el caso a ALTA', () => {
    assert.equal(clasificarSensibilidad('mi ssn es 123-45-6789').clase, 'alta');
  });

  test('la mención de salud sube a ALTA aunque no haya ningún número', () => {
    // El cuestionario de vida es dato de suscripción.
    const resultado = clasificarSensibilidad('me diagnosticaron diabetes hace dos años');
    assert.equal(resultado.clase, 'alta');
    assert.match(resultado.porque, /salud/);
  });

  test('un correo o un teléfono son MEDIA, no alta', () => {
    // Clasificarlos como altos dejaría casi todo en local por el mero hecho de
    // que alguien dio su email, y el vigía contaría «500 de 500 retenidos» sin
    // que ese número dijera nada.
    assert.equal(clasificarSensibilidad('escríbeme a ana@example.com').clase, 'media');
  });

  test('sin identificadores, BAJA', () => {
    assert.equal(clasificarSensibilidad('¿cubrís el granizo?').clase, 'baja');
  });

  test('el clasificador y el saneo usan la MISMA lista', () => {
    // Si fueran dos listas, un identificador reconocido por una y no por la otra
    // produce un caso clasificado como no sensible cuyo texto sale sin enmascarar.
    const texto = 'mi ssn es 123-45-6789 y mi correo ana@example.com';
    const clasificacion = clasificarSensibilidad(texto);
    const saneado = sanear(texto);

    assert.equal(clasificacion.identificadores.length, Object.keys(saneado.recuento).length);
    for (const tipo of clasificacion.identificadores) {
      assert.ok(tipo in saneado.recuento, `${tipo} se clasifica pero no se enmascara`);
    }
  });
});

describe('la capa de saneo', () => {
  test('lo que sale no contiene el dato, y volver lo restituye', () => {
    const original = 'Soy Ana, mi ssn es 123-45-6789 y mi correo ana@example.com';
    const saneado = sanear(original);

    assert.ok(!saneado.texto.includes('123-45-6789'), 'el SSN salió sin enmascarar');
    assert.ok(!saneado.texto.includes('ana@example.com'), 'el correo salió sin enmascarar');
    assert.equal(restituir(saneado.texto, saneado.restitucion), original);
  });

  test('el mismo valor dos veces recibe el MISMO token', () => {
    // Si no, el modelo no puede saber que son la misma persona.
    const saneado = sanear('escribe a ana@example.com; repito: ana@example.com');
    const tokens = [...saneado.texto.matchAll(/«correo_\d+»/g)].map((m) => m[0]);

    assert.equal(tokens.length, 2);
    assert.equal(tokens[0], tokens[1]);
    assert.equal(saneado.restitucion.size, 1);
  });

  test('dos valores distintos NUNCA comparten token', () => {
    const saneado = sanear('de ana@example.com a luis@example.com');
    assert.equal(saneado.restitucion.size, 2);
    assert.equal(new Set(saneado.restitucion.values()).size, 2);
  });

  test('el token es opaco: no conserva un trozo del dato', () => {
    // «***-**-6789» sigue siendo el dato para quien tiene el resto.
    const saneado = sanear('mi ssn es 123-45-6789');
    assert.ok(!saneado.texto.includes('6789'));
    assert.ok(!saneado.texto.includes('123'));
  });

  test('UN TOKEN INVENTADO POR EL MODELO NO RESUELVE A NADA', () => {
    // Restituir por patrón en lugar de por mapa permitiría que un texto del
    // modelo pidiera «ssn_1» y recibiera el dato de quien fuera.
    const saneado = sanear('mi ssn es 123-45-6789');
    const respuestaHostil = 'Claro, el SSN de otro cliente es «ssn_99» y el tuyo «ssn_1»';
    const restituido = restituir(respuestaHostil, saneado.restitucion);

    assert.ok(restituido.includes('123-45-6789'), 'el token propio sí se restituye');
    assert.ok(restituido.includes('«ssn_99»'), 'el token inventado se queda visible');
    assert.deepEqual(tokensHuerfanos(restituido, saneado.restitucion), ['«ssn_99»']);
  });

  test('un texto sin identificadores sale igual que entró', () => {
    const limpio = '¿Cubrís el granizo en Colorado?';
    const saneado = sanear(limpio);
    assert.equal(saneado.texto, limpio);
    assert.equal(saneado.restitucion.size, 0);
  });

  test('el recuento va a telemetría; los valores, no', () => {
    const saneado = sanear('ssn 123-45-6789 y otro ssn 987-65-4321');
    assert.equal(saneado.recuento.ssn, 2);
    // El recuento no contiene ningún valor: es lo único que puede viajar.
    assert.ok(!JSON.stringify(saneado.recuento).includes('6789'));
  });
});

describe('la política de enrutamiento', () => {
  test('SENSIBILIDAD ALTA NUNCA SALE DEL PERÍMETRO', () => {
    for (const clase_tarea of ['catalogo', 'queja', 'ambiguo', 'agendamiento'] as const) {
      const decision = decidir({ clase_tarea, clase_sensibilidad: 'alta' });
      assert.equal(decision.destino, 'local', `${clase_tarea} con sensibilidad alta salió`);
      assert.equal(decision.por_regla_dura, true);
    }
  });

  test('la regla dura gana a una regla que mandaría ese caso a la nube', () => {
    // Una queja va a la nube; una queja con un SSN dentro, no.
    assert.equal(decidir({ clase_tarea: 'queja', clase_sensibilidad: 'baja' }).destino, 'nube');
    assert.equal(decidir({ clase_tarea: 'queja', clase_sensibilidad: 'alta' }).destino, 'local');
  });

  test('un caso retenido por la regla dura NO admite respaldo a la nube', () => {
    // Un respaldo que pudiera desviar lo retenido convertiría el freno en una
    // sugerencia.
    assert.equal(decidir({ clase_tarea: 'catalogo', clase_sensibilidad: 'alta' }).admite_respaldo, false);
  });

  test('CAMBIAR LA POLÍTICA CAMBIA EL DESTINO, SIN TOCAR CÓDIGO', () => {
    const alReves = politicaDesde({
      ...POLITICA,
      reglas: [
        { nombre: 'todo a la nube', si: {}, destino: 'nube', por_que: 'prueba' },
      ],
    });

    assert.equal(decidir({ clase_tarea: 'saludo', clase_sensibilidad: 'baja' }).destino, 'local');
    assert.equal(
      decidir({ clase_tarea: 'saludo', clase_sensibilidad: 'baja' }, alReves).destino,
      'nube',
    );
  });

  test('ni siquiera reescribiendo la política se puede desactivar la regla dura', () => {
    const alReves = politicaDesde({
      ...POLITICA,
      reglas: [{ nombre: 'todo a la nube', si: {}, destino: 'nube', por_que: 'prueba' }],
    });

    assert.equal(
      decidir({ clase_tarea: 'saludo', clase_sensibilidad: 'alta' }, alReves).destino,
      'local',
    );
  });

  test('una política que enruta la regla dura a la nube no valida', () => {
    assert.throws(
      () =>
        politicaDesde({
          ...POLITICA,
          regla_dura: { ...POLITICA.regla_dura, destino: 'nube' },
        }),
      /no es una regla dura, es lo contrario/,
    );
  });

  test('una política que se declara desactivable no valida', () => {
    assert.throws(
      () =>
        politicaDesde({
          ...POLITICA,
          regla_dura: { ...POLITICA.regla_dura, se_puede_desactivar: true },
        }),
      /no valida/,
    );
  });

  test('sin regla que case, el destino por omisión es local', () => {
    const vacia = politicaDesde({
      ...POLITICA,
      reglas: [{ nombre: 'solo saludos', si: { clase_tarea: ['saludo'] }, destino: 'nube', por_que: 'x' }],
    });

    const decision = decidir({ clase_tarea: 'catalogo', clase_sensibilidad: 'baja' }, vacia);
    // Un hueco en la configuración no puede convertirse en una salida de datos.
    assert.equal(decision.destino, 'local');
    assert.match(decision.motivo, /omisión/);
  });

  test('toda decisión trae un motivo legible', () => {
    for (const clase_tarea of ['saludo', 'catalogo', 'queja', 'ambiguo'] as const) {
      const decision = decidir({ clase_tarea, clase_sensibilidad: 'baja' });
      assert.ok(decision.motivo.length > 10, `motivo pobre para ${clase_tarea}`);
    }
  });
});

describe('clasificar — la vista conjunta', () => {
  test('devuelve tarea, sensibilidad y un motivo que nombra las dos', () => {
    const resultado = clasificar('Hola, mi ssn es 123-45-6789 y quiero saber el precio');

    assert.equal(resultado.clase_sensibilidad, 'alta');
    assert.match(resultado.motivo, /tarea/);
    assert.match(resultado.motivo, /Sensibilidad/);
    assert.ok(resultado.identificadores.includes('ssn'));
  });
});
