// Fase 9 · Los tres criterios de aceptación del informe de salud.
//
//   1. «El informe pasa por la capa de saneo. Ninguna traza, mensaje ni caso de
//      reproducción contiene datos de un cliente. Prueba explícita.»
//   2. «Un agente de código puede leer el informe estructurado y proponer una
//      corrección sin acceso a la base de datos ni a los registros crudos.»
//   3. «El informe propone; nunca aplica.»
//
// El primero se prueba alimentando el vigía con datos de cliente de verdad —de
// la forma que el corpus de Nimbo Seguros usa— y buscándolos en los dos
// formatos. El segundo, comprobando que la estructura trae lo que hace falta
// para escribir un arreglo sin abrir nada más. El tercero es el más fácil de
// prometer y el más difícil de sostener, así que se comprueba sobre el árbol
// sintáctico de la carpeta entera, no sobre las funciones que hay hoy.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import { componer, enMarkdown } from '../src/core/fallas/informe.ts';
import { VigiaDeFallas } from '../src/core/fallas/vigia.ts';
import { observacionDe } from '../src/core/fallas/desde-caso.ts';
import { saludDesde } from '../src/core/fallas/config.ts';

const CARPETA = 'src/core/fallas';

/**
 * Datos de cliente con la forma que el sistema reconoce y enmascara.
 *
 * Son inventados, pero tienen que ser reconocibles: un número de seguro social
 * con una forma que el saneo no detecta probaría que la prueba no sabe fabricar
 * un caso, no que el informe esté limpio.
 */
const DE_UN_CLIENTE = {
  ssn: '123-45-6789',
  tarjeta: '4111 1111 1111 1111',
  telefono: '+1 415 555 0142',
  correo: 'rosa.melano@ejemplo.com',
  poliza: 'NIM-300400',
};

const CONFIG = saludDesde({
  version: 1,
  objetivo_disponibilidad: 0.9,
  minimo_observaciones: 3,
  umbral_presupuesto_consumido: 1.0,
  ventana_horas: 24,
  grupos_en_el_informe: 12,
});

function informeConDatosDeCliente(): { json: string; markdown: string } {
  const vigia = new VigiaDeFallas({ config: CONFIG });

  // Un caso que falla llevando datos personales en el mensaje. Es el caso
  // realista: el cliente escribe su número de póliza y su teléfono, y el modelo
  // no cita las fuentes.
  vigia.observar(
    observacionDe({
      caso_id: 'lote:v1:031',
      canal: 'telegram',
      clase_tarea: 'extraccion',
      resultado: 'escalado_humano',
      clase_escalado: 'sin_sustento',
      motivo_escalado: 'sustento 0 % por debajo del umbral de matiz',
      mensaje:
        `Hola, soy de la póliza ${DE_UN_CLIENTE.poliza}, mi ssn es ${DE_UN_CLIENTE.ssn}, ` +
        `mi tarjeta ${DE_UN_CLIENTE.tarjeta}, teléfono ${DE_UN_CLIENTE.telefono} y correo ` +
        `${DE_UN_CLIENTE.correo}. ¿Cuánto es mi deducible?`,
      momento: '2026-08-04T10:00:00.000Z',
    }),
  );

  // Y una falla cuyo propio MENSAJE DE ERROR lleva el dato dentro, que es el
  // camino que se olvida: el saneo del mensaje del cliente no basta si el error
  // del proveedor cita lo que se le mandó.
  vigia.observar({
    operacion: 'repos.prospectos',
    momento: '2026-08-04T10:01:00.000Z',
    caso_id: 'lote:v1:032',
    canal: 'telegram',
    clase_tarea: 'agendamiento',
    mensaje: 'agéndame',
    falla: {
      mensaje:
        `duplicate key value violates unique constraint "prospectos_ssn": ` +
        `Key (ssn)=(${DE_UN_CLIENTE.ssn}) already exists`,
    },
  });

  vigia.observar({ operacion: 'caso', momento: '2026-08-04T10:02:00.000Z' });

  const informe = componer({
    encabezado: vigia.encabezado(),
    grupos: vigia.agrupadas(),
    fuente: 'prueba',
    generado_en: '2026-08-04T10:03:00.000Z',
    config: CONFIG,
  });

  return { json: JSON.stringify(informe), markdown: enMarkdown(informe) };
}

describe('1 · ningún dato de cliente sale en el informe', () => {
  const { json, markdown } = informeConDatosDeCliente();

  test('NI EN LA ESTRUCTURA NI EN EL MARKDOWN, POR VALOR', () => {
    for (const [que, valor] of Object.entries(DE_UN_CLIENTE)) {
      assert.ok(!json.includes(valor), `el informe estructurado lleva el ${que}: ${valor}`);
      assert.ok(!markdown.includes(valor), `el informe en Markdown lleva el ${que}: ${valor}`);
    }
  });

  test('ni por forma: no queda nada que se parezca a un identificador', () => {
    // La comprobación por valor se puede burlar con un dato que la prueba no
    // conozca. Esta busca las formas.
    //
    // Se aplica sobre los VALORES DE TEXTO del informe, no sobre su
    // serialización: `disponibilidad: 0.33333333333333337` casa con el patrón de
    // tarjeta y no es un dato de nadie, es una división. La primera versión de
    // esta prueba falló justo por eso, y aflojar el patrón para que dejara pasar
    // ese caso habría dejado pasar también una tarjeta de verdad. Un dato de
    // cliente solo puede esconderse en una cadena; las cifras las calcula el
    // vigía.
    const FORMAS: readonly (readonly [string, RegExp])[] = [
      ['seguro social', /\b\d{3}-\d{2}-\d{4}\b/],
      ['tarjeta', /\b(?:\d[ -]?){13,19}\b/],
      ['correo', /[\w.+-]+@[\w-]+\.[a-z]{2,}/i],
      ['teléfono', /\+\d[\d\s()-]{8,}/],
    ];

    const cadenasDe = (valor: unknown): string[] => {
      if (typeof valor === 'string') return [valor];
      if (Array.isArray(valor)) return valor.flatMap(cadenasDe);
      if (valor !== null && typeof valor === 'object') {
        return Object.entries(valor).flatMap(([clave, v]) => [clave, ...cadenasDe(v)]);
      }
      return [];
    };

    const textos = [cadenasDe(JSON.parse(json)).join('\n'), markdown];
    assert.ok(textos[0]!.includes('«ssn_1»'), 'la prueba no está mirando el informe de verdad');

    for (const texto of textos) {
      for (const [que, forma] of FORMAS) {
        const hallado = forma.exec(texto);
        assert.equal(hallado, null, `queda algo con forma de ${que}: «${hallado?.[0] ?? ''}»`);
      }
    }
  });

  test('EL DATO QUE VIENE DENTRO DEL MENSAJE DE ERROR TAMPOCO SE ESCAPA', () => {
    // Es el camino que se olvida. Sanear lo que escribió el cliente no sirve de
    // nada si el error de PostgreSQL cita el valor que se intentó insertar.
    assert.ok(!json.includes(DE_UN_CLIENTE.ssn));
    assert.match(json, /duplicate key value/, 'y aun así el error sigue siendo diagnosticable');
  });

  test('el informe sigue siendo útil después de sanear', () => {
    // Una redacción que tapa de más es tan inútil como una que filtra. Tiene que
    // quedar de qué hablar.
    assert.match(markdown, /contrato_roto/);
    assert.match(markdown, /Caso de reproducción/);
    assert.match(markdown, /lote:v1:031/, 'el identificador del caso sí puede salir: no es de nadie');
  });
});

describe('2 · un agente de código puede proponer una corrección leyendo solo esto', () => {
  const { json } = informeConDatosDeCliente();
  const informe = JSON.parse(json) as ReturnType<typeof componer>;

  test('CADA HALLAZGO TRAE QUÉ SIGNIFICA, QUÉ HACER Y DÓNDE MIRAR', () => {
    assert.ok(informe.hallazgos.length > 0, 'sin hallazgos, esta prueba no prueba nada');

    for (const h of informe.hallazgos) {
      assert.ok(h.remedio.que_significa.length > 30, `${h.huella}: sin significado`);
      assert.ok(h.remedio.que_hacer.length > 30, `${h.huella}: sin qué hacer`);
      assert.ok(h.remedio.donde_mirar.length > 0, `${h.huella}: sin dónde mirar`);
      assert.ok(h.plantilla.length > 0, `${h.huella}: sin plantilla del error`);
      assert.ok(h.veces >= 1);
      assert.ok(h.por_que_esa_clase.length > 0, `${h.huella}: no dice por qué se clasificó así`);
    }
  });

  test('las rutas de «dónde mirar» existen de verdad en el repositorio', () => {
    // Un informe que manda a un archivo que no existe es peor que uno que no
    // manda a ninguno: gasta el tiempo de quien lo sigue.
    for (const h of informe.hallazgos) {
      for (const ruta of h.remedio.donde_mirar) {
        assert.ok(
          statSync(ruta, { throwIfNoEntry: false }) !== undefined,
          `«${ruta}» no existe (hallazgo ${h.huella})`,
        );
      }
    }
  });

  test('el caso de reproducción trae lo justo para escribir una prueba', () => {
    const conReproduccion = informe.hallazgos.filter((h) => h.reproduccion !== null);
    assert.ok(conReproduccion.length > 0);

    for (const h of conReproduccion) {
      const r = h.reproduccion!;
      assert.ok(r.caso_id.length > 0);
      assert.ok(r.canal.length > 0);
      assert.ok(r.clase_tarea.length > 0);
      assert.ok(r.operacion.length > 0);
    }
  });

  test('y el informe declara lo que NO cubre', () => {
    // Un agente que no sepa dónde no mirar buscará las fallas de seguridad aquí
    // y concluirá que no las hay.
    assert.ok(informe.fuera_de_alcance.length >= 3);
    assert.ok(informe.fuera_de_alcance.some((x) => /incidentes de seguridad/i.test(x)));
    assert.ok(informe.fuera_de_alcance.some((x) => /invariante 1/i.test(x)));
  });

  test('LO QUE DECLARA FUERA DE ALCANCE NO CONTRADICE LO QUE EL VIGÍA HACE', () => {
    // Esta prueba existe porque el defecto ocurrió: la nota decía «un escalado
    // por falta de sustento no cuenta como falla», que es lo contrario de
    // R-047, y las pruebas de entonces la dejaron pasar porque solo miraban que
    // mencionara el invariante 1. Un informe que se desmiente a sí mismo es peor
    // que uno que calla: quien lo lea decidirá sobre una premisa falsa.
    //
    // Se comprueba contra el comportamiento, no contra el texto: se le pregunta
    // al vigía si un escalado por sustento cuenta, y se exige que la nota diga
    // lo mismo.
    const vigia = new VigiaDeFallas({ config: CONFIG });
    vigia.observar(
      observacionDe({
        caso_id: 'x',
        canal: 'lote',
        clase_tarea: 'catalogo',
        resultado: 'escalado_humano',
        clase_escalado: 'sin_sustento',
        motivo_escalado: 'sustento 0 % por debajo del umbral',
        mensaje: 'hola',
        momento: '2026-08-04T10:00:00.000Z',
      }),
    );

    const sustentoEsFalla = vigia.encabezado().fallidas === 1;
    assert.equal(sustentoEsFalla, true, 'el vigía cambió de criterio sin avisar');

    const notas = informe.fuera_de_alcance.join(' ');
    assert.ok(
      /falta de (la )?FUENTE|falta de fuente/i.test(notas),
      'la nota no dice que lo exento es la falta de FUENTE',
    );
    assert.ok(
      /SUSTENTO sí cuenta|sustento sí/i.test(notas),
      'la nota no distingue el sustento de la fuente, que es lo que decide la cifra',
    );
  });

  test('no hace falta base de datos ni red para componerlo', () => {
    // Lo demuestra el hecho de que esta prueba entera corre sin DATABASE_URL ni
    // Ollama. Se deja escrito para que se vea que es una propiedad querida.
    assert.equal(informe.naturaleza, 'propuesta');
    assert.ok(informe.fuente.length > 0, 'un informe sin procedencia no se audita');
  });
});

describe('3 · el informe propone; nunca aplica', () => {
  const ARCHIVOS = readdirSync(CARPETA).filter((n) => n.endsWith('.ts'));

  test('hay archivos que analizar', () => {
    assert.ok(ARCHIVOS.length >= 4, `se esperaban los módulos de fallas en ${CARPETA}`);
  });

  test('NINGÚN MÓDULO DE FALLAS PUEDE EJECUTAR UN EFECTO', () => {
    // La regla `el-informe-propone-no-aplica` del grafo de dependencias impide
    // que esta carpeta ALCANCE al repositorio, a la salida o a un adaptador.
    // Esto cubre lo que aquella no ve: una llamada global. `fetch`, `exec` y las
    // escrituras a disco no necesitan importar nada.
    const PROHIBIDAS = [
      'fetch',
      'exec',
      'execSync',
      'spawn',
      'spawnSync',
      'writeFile',
      'writeFileSync',
      'appendFile',
      'appendFileSync',
      'rm',
      'rmSync',
      'unlink',
      'unlinkSync',
      'mkdir',
      'consultar',
      'emitir',
    ];

    const infractoras: string[] = [];

    for (const archivo of ARCHIVOS) {
      const ruta = join(CARPETA, archivo);
      const fuente = ts.createSourceFile(ruta, readFileSync(ruta, 'utf8'), ts.ScriptTarget.ES2023, true);

      const visitar = (nodo: ts.Node): void => {
        if (ts.isCallExpression(nodo)) {
          const expr = nodo.expression;
          const nombre = ts.isPropertyAccessExpression(expr)
            ? expr.name.text
            : ts.isIdentifier(expr)
              ? expr.text
              : '';
          if (PROHIBIDAS.includes(nombre)) {
            infractoras.push(`${ruta}: llama a «${nombre}»`);
          }
        }
        ts.forEachChild(nodo, visitar);
      };

      visitar(fuente);
    }

    assert.deepEqual(
      infractoras,
      [],
      'Hay módulos de fallas que pueden ejecutar un efecto. El informe propone; no ' +
        'aplica:\n' + infractoras.join('\n'),
    );
  });

  test('esa comprobación detecta de verdad una llamada con efecto', () => {
    // Una prueba estructural que nunca ha fallado puede estar comprobando la
    // propiedad equivocada.
    const fuente = ts.createSourceFile(
      'falso.ts',
      `export async function arreglar(): Promise<void> { await writeFileSync('x', 'y'); }`,
      ts.ScriptTarget.ES2023,
      true,
    );

    const encontradas: string[] = [];
    const visitar = (nodo: ts.Node): void => {
      if (ts.isCallExpression(nodo) && ts.isIdentifier(nodo.expression)) {
        encontradas.push(nodo.expression.text);
      }
      ts.forEachChild(nodo, visitar);
    };
    visitar(fuente);

    assert.ok(encontradas.includes('writeFileSync'), 'el análisis no ve la llamada que debe ver');
  });

  test('la palabra está en el dato, no solo en la documentación', () => {
    const { json, markdown } = informeConDatosDeCliente();
    assert.match(json, /"naturaleza":"propuesta"/);
    assert.match(markdown, /propone; no aplica nada/);
  });
});

describe('los dos formatos no se pueden contradecir', () => {
  test('EL MARKDOWN SE DERIVA DE LA ESTRUCTURA, NO SE CALCULA APARTE', () => {
    // R-034 aplicado aquí: dos superficies que cuentan lo mismo no se
    // reconcilian con una prueba de que coinciden, se derivan del mismo sitio.
    const { json, markdown } = informeConDatosDeCliente();
    const informe = JSON.parse(json) as ReturnType<typeof componer>;

    for (const h of informe.hallazgos) {
      assert.ok(markdown.includes(h.huella), `la huella ${h.huella} no está en el Markdown`);
      assert.ok(markdown.includes(String(h.veces)), `el recuento de ${h.huella} no está`);
    }
  });

  test('sin denominador suficiente, el Markdown NO imprime las cuatro cifras', () => {
    // Una cifra publicada con una nota que la desmiente se cita sin la nota.
    const vigia = new VigiaDeFallas({ config: CONFIG });
    vigia.observar({ operacion: 'caso', momento: '2026-08-04T10:00:00.000Z' });

    const md = enMarkdown(
      componer({
        encabezado: vigia.encabezado(),
        grupos: vigia.agrupadas(),
        fuente: 'prueba',
        generado_en: '2026-08-04T10:00:00.000Z',
        config: CONFIG,
      }),
    );

    assert.match(md, /No concluyente/);
    assert.ok(!/Disponibilidad \|/.test(md), 'imprimió una disponibilidad que no significa nada');
  });

  test('y el tope de grupos se declara en vez de callarse', () => {
    const config = saludDesde({
      version: 1,
      objetivo_disponibilidad: 0.9,
      minimo_observaciones: 1,
      umbral_presupuesto_consumido: 1,
      ventana_horas: 24,
      grupos_en_el_informe: 2,
    });

    const vigia = new VigiaDeFallas({ config });
    for (let i = 0; i < 5; i += 1) {
      vigia.observar({
        operacion: `op${i}`,
        momento: '2026-08-04T10:00:00.000Z',
        falla: { mensaje: `fallo distinto número ${i} en ${String.fromCharCode(97 + i)}` },
      });
    }

    const informe = componer({
      encabezado: vigia.encabezado(),
      grupos: vigia.agrupadas(),
      fuente: 'prueba',
      generado_en: '2026-08-04T10:00:00.000Z',
      config,
    });

    assert.equal(informe.hallazgos.length, 2);
    assert.equal(informe.grupos_omitidos, 3);
    assert.match(enMarkdown(informe), /3 grupo\(s\) más no se enseñan/);
  });
});
