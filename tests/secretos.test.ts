// Fase 8 · «Secretos en producción fuera del repositorio y fuera del informe.»
//
// Lo primero ya lo sostienen `.gitignore` y `gitleaks`. Estas pruebas son de lo
// segundo, y de la propiedad que lo hace durar: que la lista de secretos no se
// quede atrás.
//
// La prueba que más vale de este archivo no es ninguna de las de redacción: es
// la estructural. Recorre el árbol sintáctico del perímetro buscando nombres de
// variable con forma de credencial y falla si alguno no está declarado. La
// escribí esperando que pasara a la primera y encontró `EMBEDDINGS_NUBE_CLAVE`,
// que llevaba sin declarar desde la fase 2.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

import {
  estadoDeSecretos,
  parteDeSecretos,
  redactar,
  SECRETOS,
} from '../src/operacion/secretos.ts';

/** Palabras que hacen de un nombre de variable el nombre de una credencial. */
const FORMA_DE_CREDENCIAL = /(TOKEN|SECRET|SECRETO|KEY|CLAVE|PASSWORD|CONTRASENA|CREDENTIAL)/;

/** Un nombre de variable de entorno: mayúsculas, subrayados, de cierta longitud. */
const FORMA_DE_VARIABLE = /^[A-Z][A-Z0-9_]{3,}$/;

/**
 * Nombres con forma de credencial que **no** lo son, uno a uno y con su motivo.
 *
 * La lista está vacía y es importante que se pueda ver vacía: si mañana hace
 * falta añadir algo, será un cambio visible en el diff con su justificación al
 * lado, no un patrón relajado que deje pasar también lo que sí es un secreto.
 */
const NO_SON_CREDENCIALES = new Map<string, string>([]);

function archivosDe(carpeta: string, extensiones = ['.ts', '.tsx']): readonly string[] {
  const encontrados: string[] = [];

  const recorrer = (donde: string): void => {
    for (const entrada of readdirSync(donde)) {
      const ruta = join(donde, entrada);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (extensiones.some((e) => ruta.endsWith(e))) encontrados.push(ruta);
    }
  };

  recorrer(carpeta);
  return encontrados;
}

/**
 * Los literales de texto con forma de nombre de variable de entorno.
 *
 * Se buscan como literales y no como `process.env['X']` a propósito: desde la
 * fase 1 los canales no leen el entorno directamente, declaran sus requisitos
 * —`{ variable: 'TELEGRAM_BOT_TOKEN', … }`— y el registro los evalúa. Buscar
 * solo accesos a `process.env` dejaría fuera justo los secretos mejor
 * documentados del sistema.
 */
function nombresDeVariableEn(ruta: string): readonly string[] {
  const fuente = ts.createSourceFile(
    ruta,
    readFileSync(ruta, 'utf8'),
    ts.ScriptTarget.ES2023,
    true,
  );

  const nombres: string[] = [];

  const visitar = (nodo: ts.Node): void => {
    if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) {
      if (FORMA_DE_VARIABLE.test(nodo.text)) nombres.push(nodo.text);
    }
    ts.forEachChild(nodo, visitar);
  };

  visitar(fuente);
  return nombres;
}

const DECLARADOS = new Set(SECRETOS.map((s) => s.variable));

describe('la declaración de secretos no se queda atrás', () => {
  test('TODA variable con forma de credencial está declarada en SECRETOS', () => {
    // `src/operacion/secretos.ts` se excluye: es la declaración misma, y cada
    // nombre aparece ahí por definición.
    const archivos = [
      ...archivosDe('src'),
      ...archivosDe('proyeccion'),
      ...archivosDe('lote', ['.ts']),
    ].filter((r) => !r.includes(join('operacion', 'secretos.ts')));

    assert.ok(archivos.length > 0, 'no se encontró ningún archivo que analizar');

    const sinDeclarar = new Map<string, string>();

    for (const archivo of archivos) {
      for (const nombre of nombresDeVariableEn(archivo)) {
        if (!FORMA_DE_CREDENCIAL.test(nombre)) continue;
        if (NO_SON_CREDENCIALES.has(nombre)) continue;
        if (DECLARADOS.has(nombre)) continue;
        sinDeclarar.set(nombre, archivo);
      }
    }

    assert.deepEqual(
      [...sinDeclarar.entries()],
      [],
      'Hay credenciales que el sistema lee y no ha declarado. Sin declarar, no se ' +
        'redactan al imprimirse y no aparecen en el parte de arranque:\n' +
        [...sinDeclarar].map(([n, a]) => `  ${n} — en ${a}`).join('\n'),
    );
  });

  test('EL PANEL NO CONOCE NINGUNA CREDENCIAL', () => {
    // Vite incrusta las variables `VITE_*` en el paquete que se sirve al
    // navegador. Una credencial ahí no es una fuga potencial: es una fuga
    // publicada, legible con ver el fuente de la página. Y como el panel es lo
    // único que se despliega fuera del perímetro, esta es la frontera donde más
    // barato sale comprobarlo.
    const infractoras: string[] = [];

    for (const archivo of archivosDe('panel/src')) {
      for (const nombre of nombresDeVariableEn(archivo)) {
        if (FORMA_DE_CREDENCIAL.test(nombre)) infractoras.push(`${nombre} — en ${archivo}`);
      }
    }

    assert.deepEqual(
      infractoras,
      [],
      'El panel nombra credenciales. Vite las incrusta en el paquete servido al ' +
        'navegador:\n' + infractoras.join('\n'),
    );
  });

  test('cada secreto declarado dice qué se pierde sin él y de dónde sale', () => {
    // Un requisito que no dice de dónde sale no es accionable, y uno que no dice
    // qué se pierde invita a ponerlo «por si acaso» sin entender qué habilita.
    for (const secreto of SECRETOS) {
      assert.ok(secreto.sin_el.length > 10, `${secreto.variable}: «sin_el» no explica nada`);
      assert.ok(
        secreto.de_donde_sale.length > 10,
        `${secreto.variable}: «de_donde_sale» no explica nada`,
      );
    }
  });
});

describe('la redacción', () => {
  const ENTORNO = {
    DATABASE_URL: 'postgres://perimetro:una-contrasena-larga@localhost:5432/perimetro',
    TELEGRAM_BOT_TOKEN: '8123456789:AAH0mSecretoDeBotQueNoDebeSalirJamas12345',
    ANTHROPIC_API_KEY: 'sk-ant-api03-noDeberiaSalirNuncaEnUnRegistro',
    WHATSAPP_SECRETO_APP: 'c0ffee1234567890abcdef',
  };

  test('NINGÚN VALOR DE SECRETO SOBREVIVE A redactar()', () => {
    // El caso que importa: un texto que los lleva todos, como el que produciría
    // un volcado de entorno en un informe de fallo.
    const texto = Object.entries(ENTORNO)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const redactado = redactar(texto, ENTORNO);

    for (const [variable, valor] of Object.entries(ENTORNO)) {
      if (variable === 'DATABASE_URL') {
        // De una URL lo secreto es la contraseña; el host tiene que sobrevivir.
        assert.ok(
          !redactado.includes('una-contrasena-larga'),
          'la contraseña de la URL de conexión sobrevivió a la redacción',
        );
        assert.ok(
          redactado.includes('localhost:5432'),
          'el host no sobrevivió: un mensaje que no dice a dónde no se pudo conectar no ayuda',
        );
        continue;
      }

      assert.ok(!redactado.includes(valor), `el valor de ${variable} sobrevivió a la redacción`);
    }
  });

  test('tapa credenciales que este proceso no tiene en el entorno', () => {
    // La segunda capa. Un secreto de otro despliegue, o el que viene dentro del
    // mensaje de error de un proveedor, no está entre los valores a buscar — y
    // aun así no puede salir.
    const ajeno =
      'falló con clave sk-ant-api03-DeOtroDespliegueEntero y bot 9988776655:BBFdeOtroSistemaConTreintaCaracteres';

    const redactado = redactar(ajeno, {});

    assert.ok(!redactado.includes('sk-ant-api03-DeOtroDespliegueEntero'));
    assert.ok(!redactado.includes('BBFdeOtroSistemaConTreintaCaracteres'));
    // El identificador del bot es público y se conserva: sirve para diagnosticar
    // y no es lo que hay que proteger.
    assert.ok(redactado.includes('9988776655'));
  });

  test('tapa la contraseña de una URL de conexión desconocida', () => {
    const redactado = redactar('redis://usuario:clave-secreta@10.0.0.4:6379', {});
    assert.ok(!redactado.includes('clave-secreta'));
    assert.ok(redactado.includes('10.0.0.4:6379'));
  });

  test('no tapa lo que no es un secreto', () => {
    // Una redacción que tapa de más es tan inútil como una que filtra: nadie
    // puede diagnosticar con una pantalla de bolitas.
    const texto = 'PUERTO=8787 · migración 003 aplicada · 65 casos, 33 aciertos';
    assert.equal(redactar(texto, { ...ENTORNO, PUERTO: '8787' }), texto);
  });

  test('una clave privada en PEM no sale entera', () => {
    const pem =
      '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BA\nQEFAASCBKcwggSjAgEAAoIBAQ\n-----END PRIVATE KEY-----';
    const redactado = redactar(pem, {});
    assert.ok(!redactado.includes('MIIEvQIBADANBgkqhkiG9w0BA'));
  });
});

describe('el parte de secretos', () => {
  test('dice qué falta sin decir qué hay', () => {
    const entorno = { TELEGRAM_BOT_TOKEN: 'un-token-larguisimo-de-verdad-12345' };
    const parte = parteDeSecretos(entorno);

    assert.ok(!parte.includes('un-token-larguisimo-de-verdad-12345'), 'el parte imprimió un valor');
    assert.ok(parte.includes('TELEGRAM_BOT_TOKEN'), 'el parte no nombra el secreto que sí está');
    assert.ok(parte.includes('ANTHROPIC_API_KEY'), 'el parte no dice que falta la clave de nube');
    assert.ok(
      parte.includes('el sistema conversa solo en local'),
      'el parte no dice qué se pierde por faltar',
    );
  });

  test('el estado distingue puesto de vacío', () => {
    // Una variable definida pero vacía es lo que deja `.env.ejemplo` recién
    // copiado. Contarla como puesta haría que el arranque dijera que todo está
    // bien justo cuando no lo está.
    const estado = estadoDeSecretos({ TELEGRAM_BOT_TOKEN: '   ', ANTHROPIC_API_KEY: 'sk-ant-xx' });
    const porNombre = new Map(estado.map((e) => [e.secreto.variable, e.puesto]));

    assert.equal(porNombre.get('TELEGRAM_BOT_TOKEN'), false);
    assert.equal(porNombre.get('ANTHROPIC_API_KEY'), true);
  });
});
