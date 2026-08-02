// Criterio de aceptación de la fase 1:
//
//   «Existe una prueba que falla si algún método de `repos/` puede consultar sin
//    filtro de contacto.»
//
// La palabra que importa es **puede**. No basta con comprobar que las funciones
// que hay hoy filtran: eso se cumple hasta que alguien añada una que no lo haga,
// y entonces la prueba sigue verde. Hay que comprobar la propiedad sobre la
// carpeta entera, de forma que una función nueva la rompa sin que nadie tenga que
// acordarse de nada.
//
// Por eso esta prueba recorre el **árbol sintáctico** de `src/repos/` con el
// compilador de TypeScript —que ya es dependencia del proyecto— y comprueba dos
// cosas de cada archivo:
//
//   1. Toda función exportada recibe `AlcanceContacto` como primer argumento.
//   2. Toda consulta SQL filtra por contacto.
//
// Y luego, en tiempo de ejecución, que la comprobación no se puede burlar con un
// objeto que tenga la forma adecuada.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import {
  alcanceDeContacto,
  ErrorDeAlcance,
  esAlcance,
  exigirAlcance,
} from '../src/repos/alcance.ts';
import { conversacionAbierta, mensajesDe, obtenerConversacion } from '../src/repos/conversaciones.ts';
import type { Consultador } from '../src/repos/cliente.ts';

const CARPETA = 'src/repos';

/**
 * Archivos que no exponen consultas y por tanto no llevan alcance.
 *
 * La lista es corta y está justificada uno a uno. Que sea explícita es parte de
 * la protección: añadir un archivo aquí es un cambio visible en el diff, no un
 * olvido.
 */
const SIN_ALCANCE = new Set([
  // Define el alcance; no puede exigirse a sí mismo.
  'alcance.ts',
  // Infraestructura de conexión: no formula consultas propias.
  'cliente.ts',
  // Migraciones: corren antes de que exista contacto alguno.
  'migrar.ts',
  // Procedencia del corpus (fase 2). El corpus es común a todos los contactos:
  // no hay contacto al que acotarlo, y exigir un alcance obligaría a inventar
  // uno, haciendo que el filtro afirmara algo falso —que estos documentos
  // pertenecen a alguien—. La exención es a la regla del alcance, no a la de
  // aislamiento: en `documentos` no hay ni un dato de cliente.
  'documentos.ts',
  // Agregados del panel (fase 6). Un agregado cruza contactos por definición:
  // filtrarlo por uno daría la cifra de una persona presentada como la del
  // sistema, que es peor que no darla. La contención aquí no es el alcance sino
  // LA FORMA DE LO QUE DEVUELVE, y tiene su propia prueba más abajo —
  // «los agregados no pueden filtrar datos de nadie»— que es más estricta que
  // esta exención, no más laxa.
  'agregados.ts',
  // Registro de acceso al panel (fase 6). La excepción es de otra naturaleza:
  // aquí el SUJETO del registro es el operador, no el cliente. Un acceso lo
  // genera quien mira. Y lo que hace que no abra un hueco es que este archivo no
  // lee datos de conversaciones: escribe quién miró qué y lee ese mismo
  // registro. Ninguna de sus consultas toca eventos, mensajes ni escalados —
  // comprobado por la prueba «el registro de accesos no lee conversaciones».
  'accesos.ts',
]);

/**
 * Columnas por las que se identifica a alguien.
 *
 * `caso_id` está en la lista y merece explicación: no es un nombre ni un
 * teléfono, pero es la llave con la que se pide la traza completa de una
 * conversación. Un agregado que devolviera identificadores de caso convertiría
 * una cifra pública en un índice de las conversaciones que hay detrás.
 */
const COLUMNAS_QUE_IDENTIFICAN = [
  'contacto_id',
  'conversacion_id',
  'caso_id',
  'motivo_decision',
  'destinos_egreso',
  'fuentes',
];

/**
 * Funciones exceptuadas por nombre, con su motivo.
 *
 * `alcanceParaContacto` es la que **fabrica** el alcance: exigírselo sería exigir
 * lo que viene a averiguar. Es la única puerta de entrada, y por eso se nombra
 * aquí en lugar de eximir el archivo entero.
 */
const EXCEPCIONES = new Map([
  ['alcanceParaContacto', 'es la función que construye el alcance'],
  // Fábrica, no consulta: construye el adaptador de CRM. Sus TRES métodos sí
  // reciben alcance y sí filtran; exigírselo a la fábrica sería exigir un
  // alcance para decidir con qué base de datos hablar.
  ['crmSobrePostgres', 'es una fábrica de adaptador, no una consulta'],
  // Fase 6. Las dos operan sobre `actuaciones_vigia`, que es un hecho del
  // sistema y no de nadie: no hay contacto al que acotarlas, y exigirles un
  // alcance obligaría a inventar uno, haciendo que el filtro afirmara algo falso.
  // Se nombran una a una en vez de eximir el archivo, porque en el mismo archivo
  // están las de incidentes, que SÍ llevan alcance y tienen que seguir llevándolo.
  ['guardarActuacion', 'una actuación de vigía no pertenece a ningún contacto'],
  ['ultimaActuacionPorVigia', 'lee el estado del sistema, no datos de nadie'],
]);

/**
 * Tablas que NO son datos de un cliente, sino un recurso compartido.
 *
 * `huecos` es la agenda: los espacios libres son de la empresa, no de nadie.
 * Filtrarlos por contacto sería incorrecto, no más seguro — cada cliente vería
 * cero huecos disponibles.
 *
 * La regla de esta prueba tenía dos categorías —leer datos de alguien y
 * atribuirle una fila nueva— y le faltaba la tercera. Se añade nombrando la
 * tabla, no relajando el patrón: una excepción por nombre es un cambio visible
 * en el diff; un patrón más laxo dejaría pasar también lo que no debe.
 */
const TABLAS_COMPARTIDAS = [
  'huecos',
  // Fase 6. Una actuación de vigía es un hecho del SISTEMA, no de nadie: un
  // techo de presupuesto cruzado, un límite de pasos alcanzado. La tabla no
  // tiene `contacto_id` y no puede tenerlo — filtrarla por contacto no sería más
  // seguro, sería incorrecto, igual que con `huecos`.
  //
  // Los incidentes de seguridad NO están en esta lista, y esa es la distinción
  // que importa: un incidente sí es de alguien, y sus lecturas llevan alcance.
  'actuaciones_vigia',
];

type FuncionExportada = {
  archivo: string;
  nombre: string;
  primerParametro: string | null;
};

function analizar(archivo: string): { funciones: FuncionExportada[]; consultas: string[] } {
  const ruta = join(CARPETA, archivo);
  const fuente = ts.createSourceFile(
    ruta,
    readFileSync(ruta, 'utf8'),
    ts.ScriptTarget.ES2023,
    true,
  );

  const funciones: FuncionExportada[] = [];
  const consultas: string[] = [];

  const visitar = (nodo: ts.Node): void => {
    if (ts.isFunctionDeclaration(nodo) && nodo.name !== undefined) {
      const exportada = nodo.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (exportada === true) {
        const primero = nodo.parameters[0];
        funciones.push({
          archivo,
          nombre: nodo.name.text,
          primerParametro: primero?.type?.getText(fuente) ?? null,
        });
      }
    }

    // Las consultas se escriben como plantillas literales sin interpolación: los
    // valores van siempre como parámetros ($1, $2…). Una plantilla con
    // interpolación sería inyección de SQL esperando a ocurrir, y se detecta
    // aquí abajo.
    if (ts.isNoSubstitutionTemplateLiteral(nodo) || ts.isStringLiteral(nodo)) {
      const texto = nodo.text;
      if (/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(texto)) consultas.push(texto);
    }

    if (ts.isTemplateExpression(nodo)) {
      const texto = nodo.getText(fuente);
      if (/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(texto)) {
        throw new Error(
          `${ruta}: hay una consulta construida con interpolación de plantilla. ` +
            'Los valores van como parámetros ($1, $2…); concatenarlos es inyección ' +
            'de SQL esperando a ocurrir.',
        );
      }
    }

    ts.forEachChild(nodo, visitar);
  };

  visitar(fuente);
  return { funciones, consultas };
}

const ARCHIVOS = readdirSync(CARPETA).filter(
  (n) => n.endsWith('.ts') && !SIN_ALCANCE.has(n),
);

describe('src/repos/ — ninguna consulta puede saltarse el filtro de contacto', () => {
  test('hay archivos que analizar (si no, la prueba no probaría nada)', () => {
    // Sin esto, borrar la carpeta dejaría la prueba en verde.
    assert.ok(ARCHIVOS.length > 0, `no se encontró ningún archivo con consultas en ${CARPETA}`);
  });

  test('TODA función exportada recibe AlcanceContacto como primer argumento', () => {
    const infractoras: string[] = [];

    for (const archivo of ARCHIVOS) {
      for (const funcion of analizar(archivo).funciones) {
        if (EXCEPCIONES.has(funcion.nombre)) continue;

        if (funcion.primerParametro !== 'AlcanceContacto') {
          infractoras.push(
            `${archivo}::${funcion.nombre} — primer argumento es ` +
              `«${funcion.primerParametro ?? 'ninguno'}», debería ser AlcanceContacto`,
          );
        }
      }
    }

    assert.deepEqual(
      infractoras,
      [],
      'Hay funciones exportadas de src/repos/ que pueden llamarse sin alcance de ' +
        'contacto. Cada una es una consulta capaz de devolver datos de otro cliente:\n' +
        infractoras.join('\n'),
    );
  });

  test('TODA consulta filtra por contacto', () => {
    const infractoras: string[] = [];

    for (const archivo of ARCHIVOS) {
      for (const consulta of analizar(archivo).consultas) {
        const normalizada = consulta.replace(/\s+/g, ' ');

        // La regla distingue leer de escribir, porque el riesgo es distinto.
        //
        // Leer, modificar o borrar sin filtro devuelve o toca filas de otro
        // cliente: exige `contacto_id = $n`, o `id = $n` sobre `contactos`, donde
        // el contacto ES la fila.
        //
        // Insertar no puede filtrar por lo que está escribiendo. Lo que se exige
        // ahí es que la fila quede **atribuida**: que `contacto_id` esté entre las
        // columnas. Una fila sin dueño es una fila que ninguna consulta filtrada
        // volverá a encontrar.
        const esInsercionPura = /^\s*INSERT\b/i.test(normalizada) && !/\bWHERE\b/i.test(normalizada);
        const esSobreContactos = /\bcontactos\b/i.test(normalizada);
        // Tercera categoría: recurso compartido de la empresa, no dato de nadie.
        // Filtrarlo por contacto no sería más seguro, sería incorrecto.
        const esRecursoCompartido = TABLAS_COMPARTIDAS.some((tabla) =>
          new RegExp(`\\b(FROM|INTO|UPDATE)\\s+${tabla}\\b`, 'i').test(normalizada),
        );

        const cumple = esSobreContactos
          ? true
          : esRecursoCompartido
            ? true
            : esInsercionPura
              ? /\bcontacto_id\b/i.test(normalizada)
              : /contacto_id\s*=\s*\$\d/i.test(normalizada);

        if (!cumple) infractoras.push(`${archivo}: ${normalizada.slice(0, 90)}…`);
      }
    }

    assert.deepEqual(
      infractoras,
      [],
      'Hay consultas en src/repos/ que no filtran por contacto:\n' + infractoras.join('\n'),
    );
  });

  test('LOS AGREGADOS NO PUEDEN FILTRAR DATOS DE NADIE', () => {
    // `agregados.ts` está exento del filtro de contacto porque un agregado cruza
    // contactos por definición. Lo que lo contiene no es el alcance, es que sus
    // consultas no puedan devolver nada que identifique a alguien: sin columna
    // por la que salga, una consulta sin filtro no filtra.
    //
    // Esta regla es MÁS estricta que la exención, no una forma de esquivarla.
    const { consultas } = analizar('agregados.ts');
    assert.ok(consultas.length > 0, 'no se analizó ninguna consulta de agregados.ts');

    const infractoras: string[] = [];

    for (const consulta of consultas) {
      const normalizada = consulta.replace(/\s+/g, ' ');
      // Solo la lista de selección: `caso_id` puede aparecer en un WHERE o en un
      // GROUP BY sin salir del servidor. Lo que no puede es viajar al panel.
      const seleccion = /SELECT\b([\s\S]*?)\bFROM\b/i.exec(normalizada)?.[1] ?? normalizada;

      for (const columna of COLUMNAS_QUE_IDENTIFICAN) {
        if (new RegExp(`\\b${columna}\\b`, 'i').test(seleccion)) {
          infractoras.push(`«${columna}» en: ${normalizada.slice(0, 80)}…`);
        }
      }

      // Y ningún `SELECT *`, que traería la tabla entera incluidas esas columnas.
      if (/SELECT\s+\*/i.test(normalizada)) {
        infractoras.push(`SELECT * en: ${normalizada.slice(0, 80)}…`);
      }
    }

    assert.deepEqual(
      infractoras,
      [],
      'Hay agregados que devuelven columnas identificatorias:\n' + infractoras.join('\n'),
    );
  });

  test('EL REGISTRO DE ACCESOS NO LEE CONVERSACIONES', () => {
    // `accesos.ts` está exento del filtro de contacto porque el sujeto de sus
    // filas es el operador, no el cliente. Esa exención solo se sostiene mientras
    // el archivo no toque las tablas donde sí hay datos de alguien.
    const { consultas } = analizar('accesos.ts');
    assert.ok(consultas.length > 0, 'no se analizó ninguna consulta de accesos.ts');

    const PROHIBIDAS = ['eventos', 'mensajes', 'escalados', 'conversaciones', 'prospectos'];
    const infractoras: string[] = [];

    for (const consulta of consultas) {
      const normalizada = consulta.replace(/\s+/g, ' ');
      for (const tabla of PROHIBIDAS) {
        if (new RegExp(`\\b(FROM|JOIN|INTO|UPDATE)\\s+${tabla}\\b`, 'i').test(normalizada)) {
          infractoras.push(`«${tabla}» en: ${normalizada.slice(0, 80)}…`);
        }
      }
    }

    assert.deepEqual(
      infractoras,
      [],
      'El registro de accesos toca tablas con datos de clientes:\n' + infractoras.join('\n'),
    );
  });

  test('esa regla detecta de verdad un agregado que se lleva un identificador', () => {
    // Una prueba estructural que nunca ha fallado puede estar comprobando la
    // propiedad equivocada.
    const sospechosa = 'SELECT caso_id, COUNT(*) FROM eventos GROUP BY caso_id';
    const seleccion = /SELECT\b([\s\S]*?)\bFROM\b/i.exec(sospechosa)?.[1] ?? '';

    assert.ok(
      COLUMNAS_QUE_IDENTIFICAN.some((c) => new RegExp(`\\b${c}\\b`, 'i').test(seleccion)),
      'la regla dejó pasar un agregado que devuelve caso_id',
    );
  });

  test('la prueba detecta de verdad una función sin alcance', () => {
    // Una prueba estructural que nunca ha fallado es una prueba que puede estar
    // comprobando la propiedad equivocada. Esto la ejercita contra un caso que
    // SÍ debe rechazar.
    const fuente = ts.createSourceFile(
      'falso.ts',
      `export async function consultarTodo(bd: Consultador): Promise<void> {
         await bd.consultar('SELECT * FROM mensajes');
       }`,
      ts.ScriptTarget.ES2023,
      true,
    );

    let primerParametro: string | null = null;
    ts.forEachChild(fuente, (nodo) => {
      if (ts.isFunctionDeclaration(nodo)) {
        primerParametro = nodo.parameters[0]?.type?.getText(fuente) ?? null;
      }
    });

    assert.equal(primerParametro, 'Consultador');
    assert.notEqual(primerParametro, 'AlcanceContacto', 'el análisis distingue los dos casos');
  });
});

describe('el alcance no se puede falsificar', () => {
  const bdQueNuncaDebeLlamarse: Consultador = {
    consultar: async () => {
      throw new Error('la consulta no debería haberse ejecutado: faltaba el alcance');
    },
    enTransaccion: async () => {
      throw new Error('no debería haberse abierto transacción');
    },
    cerrar: async () => {},
  };

  test('un objeto con la forma correcta NO es un alcance', () => {
    const impostor = { contacto_id: 'el-de-otro-cliente', canal: 'telegram' };
    assert.equal(esAlcance(impostor), false);
    assert.throws(() => exigirAlcance(impostor), ErrorDeAlcance);
  });

  test('y la consulta ni siquiera llega a ejecutarse', async () => {
    const impostor = { contacto_id: 'el-de-otro-cliente', canal: 'telegram' } as never;

    await assert.rejects(conversacionAbierta(impostor, bdQueNuncaDebeLlamarse), ErrorDeAlcance);
    await assert.rejects(mensajesDe(impostor, bdQueNuncaDebeLlamarse, 'x'), ErrorDeAlcance);
    await assert.rejects(
      obtenerConversacion(impostor, bdQueNuncaDebeLlamarse, 'x'),
      ErrorDeAlcance,
    );
  });

  test('undefined y null tampoco pasan', async () => {
    await assert.rejects(
      conversacionAbierta(undefined as never, bdQueNuncaDebeLlamarse),
      ErrorDeAlcance,
    );
    await assert.rejects(
      conversacionAbierta(null as never, bdQueNuncaDebeLlamarse),
      ErrorDeAlcance,
    );
  });

  test('un alcance con identificador vacío se rechaza al construirlo', () => {
    assert.throws(() => alcanceDeContacto('', 'telegram'), ErrorDeAlcance);
    assert.throws(() => alcanceDeContacto('   ', 'telegram'), ErrorDeAlcance);
  });

  test('el alcance legítimo sí pasa', () => {
    const alcance = alcanceDeContacto('11111111-1111-1111-1111-111111111111', 'telegram');
    assert.equal(esAlcance(alcance), true);
    assert.equal(exigirAlcance(alcance).contacto_id, '11111111-1111-1111-1111-111111111111');
  });
});
