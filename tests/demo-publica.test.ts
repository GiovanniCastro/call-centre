// Fase 8 · «La demo pública no realiza ninguna llamada de inferencia.»
//
// Es el criterio más fácil de dar por bueno leyendo el código y el más caro de
// equivocarse: una demo que llamara al modelo consumiría presupuesto por
// visitante, dependería de que la máquina con Ollama esté encendida y expondría
// una superficie que nadie ha protegido.
//
// Aquí se prueba de tres formas, porque cada una tapa lo que la otra no ve:
//
//   1. **Con un espía sobre `fetch`.** Toda salida del perímetro pasa por ahí —
//      lo sostienen el lint y `dependency-cruiser` desde la fase 3—, así que un
//      `fetch` que no ocurre es una llamada externa que no ocurre.
//   2. **Con el índice y los modelos apagados.** La demo se deriva y se publica
//      entera sin Qdrant, sin Ollama y sin PostgreSQL.
//   3. **Sobre el grafo de imports**, en `.dependency-cruiser.cjs`
//      (`demo-sin-inferencia`): lo que hoy no llama, mañana tampoco puede.

import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { derivarDemo, ErrorDeReproduccion, type DefinicionDelLote, type ResultadosDelLote } from '../proyeccion/demo.ts';
import { publicarDemo } from '../proyeccion/publicar.ts';
import { DestinoDeArchivos } from '../proyeccion/destinos/archivos.ts';

const RESULTADOS = 'lote/resultados/fase-7-v1.json';
const CASOS = 'lote/casos.json';

let resultados: ResultadosDelLote;
let definicion: DefinicionDelLote;

before(async () => {
  resultados = JSON.parse(await readFile(RESULTADOS, 'utf8')) as ResultadosDelLote;
  definicion = JSON.parse(await readFile(CASOS, 'utf8')) as DefinicionDelLote;
});

describe('la demo pública reproduce, no ejecuta', () => {
  test('NO HAY UNA SOLA LLAMADA EXTERNA AL DERIVAR Y PUBLICAR LA DEMO', async () => {
    const espia = mock.method(globalThis, 'fetch', () => {
      throw new Error(
        'la demo pública intentó salir a la red: eso es inferencia en vivo, y R-009 ' +
          'dice que la demo reproduce ejecuciones registradas',
      );
    });

    const carpeta = await mkdtemp(join(tmpdir(), 'demo-'));
    try {
      const reproduccion = derivarDemo(resultados, definicion, '2026-08-04T00:00:00.000Z');
      const publicado = await publicarDemo(new DestinoDeArchivos(carpeta), reproduccion, () => undefined);

      assert.equal(publicado.documentos, 2);
      assert.ok(publicado.casos > 0, 'la demo se publicó sin un solo caso');
      assert.equal(
        espia.mock.callCount(),
        0,
        'la demo pública hizo una llamada de red al reproducirse',
      );
    } finally {
      espia.mock.restore();
      await rm(carpeta, { recursive: true, force: true });
    }
  });

  test('la reproducción lleva el identificador del lote visible', () => {
    // Criterio de la fase 8: «etiquetada como reproducción de ejecuciones reales,
    // con el identificador del lote visible». Sin él, nadie puede comprobar
    // contra qué corrida se está mirando.
    const reproduccion = derivarDemo(resultados, definicion, '2026-08-04T00:00:00.000Z');

    assert.equal(reproduccion.es_reproduccion, true);
    assert.equal(reproduccion.lote, 'fase-7-v1');
    assert.match(reproduccion.aviso, /registradas/);
  });

  test('unos resultados sin identificador de lote se rechazan', () => {
    assert.throws(
      () => derivarDemo({ lote: '  ', ejecuciones: [] }, definicion, 'ahora'),
      ErrorDeReproduccion,
    );
  });
});

describe('la demo no inventa nada', () => {
  test('LOS MODOS QUE NO SE CORRIERON SALEN CON SU MOTIVO, NO CON CEROS', () => {
    // Hoy nube e híbrido no se han corrido —falta ANTHROPIC_API_KEY— y la demo
    // tiene que decirlo. Un cero en «aciertos» de un modo que nadie ejecutó se
    // lee como «falló todo», que es una afirmación que nadie ha medido.
    const reproduccion = derivarDemo(resultados, definicion, 'ahora');
    const noCorridos = reproduccion.modos.filter((m) => !m.corrido);

    assert.ok(noCorridos.length > 0, 'esta prueba deja de probar si algún día se corren los tres');

    for (const modo of noCorridos) {
      assert.ok(
        (modo.motivo ?? '').length > 10,
        `el modo ${modo.modo} no se corrió y no dice por qué`,
      );
      assert.equal(
        reproduccion.casos.some((c) => c.modo === modo.modo),
        false,
        `el modo ${modo.modo} no se corrió pero aporta casos a la demo`,
      );
    }
  });

  test('cada cifra del resumen se puede recontar sobre los casos registrados', () => {
    // La demo no calcula: reutiliza `resumir` del informe de la fase 7. Esta
    // prueba comprueba que lo publicado cuadra con el archivo de resultados, que
    // es la definición operativa de «ninguna cifra inventada».
    const reproduccion = derivarDemo(resultados, definicion, 'ahora');

    for (const modo of reproduccion.modos.filter((m) => m.corrido)) {
      const ejecucion = resultados.ejecuciones.find((e) => e.modo === modo.modo);
      assert.ok(ejecucion !== undefined);

      assert.equal(modo.casos, ejecucion.resultados.length);
      assert.equal(modo.aciertos, ejecucion.resultados.filter((r) => r.acerto).length);
      assert.equal(
        modo.resueltos,
        ejecucion.resultados.filter((r) => r.resultado === 'resuelto').length,
      );
    }
  });

  test('un caso sin texto en el lote lo dice en vez de inventarlo', () => {
    const reproduccion = derivarDemo(resultados, { lote: 'fase-7-v1', casos: [] }, 'ahora');
    assert.match(String(reproduccion.casos[0]?.pregunta), /no registró el texto/);
  });
});

describe('lo que la demo publica ya está saneado', () => {
  let carpeta = '';

  before(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'demo-saneo-'));
  });

  after(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  test('NINGÚN IDENTIFICADOR DEL LOTE LLEGA A LA COLECCIÓN PÚBLICA', async () => {
    // El lote trae doce casos de sensibilidad alta escritos a propósito con
    // números de seguro social, tarjetas y pólizas. La colección `demo` es la
    // única que las reglas de Firestore abren a lectura anónima, así que es
    // justo donde no pueden acabar.
    const avisos: string[] = [];
    const reproduccion = derivarDemo(resultados, definicion, 'ahora');
    await publicarDemo(new DestinoDeArchivos(carpeta), reproduccion, (l) => avisos.push(l));

    const publicado = await readFile(join(carpeta, 'demo', 'casos.json'), 'utf8');

    // Las formas que el saneo tiene que haber tapado, buscadas sobre el archivo
    // publicado tal cual se sirve.
    const FORMAS: readonly [string, RegExp][] = [
      ['número de seguro social', /\b\d{3}-\d{2}-\d{4}\b/],
      ['tarjeta de crédito', /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/],
    ];

    for (const [nombre, patron] of FORMAS) {
      assert.equal(
        patron.test(publicado),
        false,
        `la demo pública publicó algo con forma de ${nombre}`,
      );
    }

    // Y el saneo tiene que haber avisado: lo que no puede pasar es que actúe en
    // silencio.
    assert.ok(
      avisos.some((a) => a.includes('INCIDENTE DE PERÍMETRO')),
      'el saneo actuó sobre la demo sin avisar',
    );
  });
});
