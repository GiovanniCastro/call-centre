// El almacén del borde — repetición, caudal y agrupación.
//
// **Las mismas pruebas corren contra las dos implementaciones.** La de memoria
// siempre; la de Redis solo cuando hay un Redis al que conectarse — en el CI,
// donde hay un contenedor. Si las dos no se comportan igual, cambiar de una a
// otra cambiaría el comportamiento del sistema sin que nada avisara, y ese es
// justo el fallo que un almacén tras interfaz invita a cometer.
//
// Criterios de aceptación de la fase 1 cubiertos aquí:
//   · «Cinco mensajes en tres segundos producen una sola ejecución.»
//   · «Un mensaje repetido no produce una segunda ejecución.»

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { AlmacenEnMemoria } from '../src/borde/almacen-memoria.ts';
import { AlmacenRedis } from '../src/borde/almacen-redis.ts';
import { claveDeGrupo, type AlmacenDeBorde } from '../src/borde/almacen.ts';
import { ColaEnMemoria } from '../src/borde/cola.ts';
import { crearDespachador } from '../src/borde/despachador.ts';
import type { MensajeCanonico } from '../src/core/mensaje.ts';

const URL_REDIS = process.env['REDIS_URL'];

function mensaje(n: number, contacto = '777'): MensajeCanonico {
  return {
    id_externo: `telegram:${contacto}:${n}`,
    canal: 'telegram',
    contacto: { identificador_externo: contacto, nombre_declarado: 'Ana' },
    tipo: 'texto',
    contenido: `mensaje ${n}`,
    adjuntos: [],
    marca_tiempo: '2026-07-31T10:00:00.000Z',
    procedencia: 'cliente',
  };
}

/**
 * El cuerpo de pruebas, escrito una vez y aplicado a cada implementación.
 *
 * **Un almacén nuevo por caso.** `recogerGruposVencidos` recoge por tiempo, no
 * por clave: sin aislar los casos, uno se lleva los grupos de otro y el fallo
 * aparece en la prueba equivocada. Con Redis, `crear` recibe además un espacio de
 * nombres distinto por caso, porque Redis conserva el estado entre ejecuciones.
 */
function pruebasDeAlmacen(
  nombre: string,
  crear: (espacio: string) => Promise<AlmacenDeBorde>,
): void {
  describe(`almacén ${nombre}`, () => {
    let almacen: AlmacenDeBorde;
    let n = 0;
    const sufijo = () => `${nombre}-${(n += 1)}`;

    beforeEach(async () => {
      almacen = await crear(`prueba:${nombre}:${Date.now()}:${(n += 1)}`);
    });

    afterEach(async () => {
      await almacen.cerrar();
    });

    test('un mensaje repetido no vuelve a pasar', async () => {
      const id = `id-${sufijo()}`;

      assert.equal(await almacen.marcarVistoSiNuevo(id, 60), true, 'la primera vez es nuevo');
      assert.equal(await almacen.marcarVistoSiNuevo(id, 60), false, 'la segunda ya no');
      assert.equal(await almacen.marcarVistoSiNuevo(id, 60), false, 'ni la tercera');

      // Y no confunde identificadores distintos.
      assert.equal(await almacen.marcarVistoSiNuevo(`otro-${id}`, 60), true);
    });

    test('la ventana deslizante cuenta lo que hay dentro y olvida lo de fuera', async () => {
      const clave = `tasa-${sufijo()}`;
      const ventana = 60_000;
      const t0 = 1_000_000;

      assert.equal(await almacen.registrarYContar(clave, ventana, t0), 1);
      assert.equal(await almacen.registrarYContar(clave, ventana, t0 + 1_000), 2);
      assert.equal(await almacen.registrarYContar(clave, ventana, t0 + 2_000), 3);

      // A los 61 s del primero, el de t0+2 000 SIGUE dentro de la ventana: la
      // ventana se mide desde ahora hacia atrás, no desde el primer intento.
      assert.equal(await almacen.registrarYContar(clave, ventana, t0 + 61_000), 2);

      // Pasados 70 s, ninguno de los tres primeros sobrevive.
      assert.equal(await almacen.registrarYContar(clave, ventana, t0 + 130_000), 1);
    });

    test('CINCO mensajes en tres segundos son UN grupo', async () => {
      // El criterio de aceptación, literal.
      const contacto = `c-${sufijo()}`;
      const ventana = 3_000;
      const t0 = 2_000_000;

      // Cinco mensajes entre t0 y t0+2 000: todos dentro de la ventana de 3 s
      // que abre el primero, que vence en t0+3 000.
      const aperturas: boolean[] = [];
      for (let i = 0; i < 5; i += 1) {
        const m = mensaje(i, contacto);
        aperturas.push(await almacen.anadirAlGrupo(claveDeGrupo(m), m, ventana, t0 + i * 500));
      }

      // Solo el primero abre grupo.
      assert.deepEqual(aperturas, [true, false, false, false, false]);

      // Antes de vencer no hay nada que recoger.
      assert.deepEqual(await almacen.recogerGruposVencidos(t0 + 2_999), []);

      const vencidos = await almacen.recogerGruposVencidos(t0 + 3_001);
      assert.equal(vencidos.length, 1, 'un solo grupo');
      assert.equal(vencidos[0]?.mensajes.length, 5, 'con los cinco mensajes dentro');
    });

    test('la ventana la fija el primero y NO se reinicia con cada mensaje', async () => {
      // Si se reiniciara, quien escribe sin parar nunca recibiría respuesta.
      const contacto = `c-${sufijo()}`;
      const ventana = 3_000;
      const t0 = 3_000_000;

      const m1 = mensaje(1, contacto);
      await almacen.anadirAlGrupo(claveDeGrupo(m1), m1, ventana, t0);

      // Mensajes cada 2,5 s: siempre dentro de la ventana anterior.
      const m2 = mensaje(2, contacto);
      await almacen.anadirAlGrupo(claveDeGrupo(m2), m2, ventana, t0 + 2_500);

      // A los 3,001 s del PRIMERO, el grupo vence pese al segundo mensaje.
      const vencidos = await almacen.recogerGruposVencidos(t0 + 3_001);
      assert.equal(vencidos.length, 1);
      assert.equal(vencidos[0]?.mensajes.length, 2);
    });

    test('dos contactos distintos nunca comparten grupo', async () => {
      const marca = sufijo();
      const ventana = 1_000;
      const t0 = 4_000_000;

      const a = mensaje(1, `ana-${marca}`);
      const b = mensaje(1, `beto-${marca}`);

      assert.equal(await almacen.anadirAlGrupo(claveDeGrupo(a), a, ventana, t0), true);
      assert.equal(await almacen.anadirAlGrupo(claveDeGrupo(b), b, ventana, t0), true);

      const vencidos = await almacen.recogerGruposVencidos(t0 + 1_001);
      const claves = vencidos.map((g) => g.clave).sort();
      assert.equal(claves.length, 2);
      assert.notEqual(claves[0], claves[1]);
    });

    test('recoger un grupo lo retira: no se despacha dos veces', async () => {
      const contacto = `c-${sufijo()}`;
      const t0 = 5_000_000;
      const m = mensaje(1, contacto);

      await almacen.anadirAlGrupo(claveDeGrupo(m), m, 1_000, t0);

      const primera = await almacen.recogerGruposVencidos(t0 + 1_001);
      assert.equal(primera.length, 1);

      const segunda = await almacen.recogerGruposVencidos(t0 + 2_000);
      assert.equal(segunda.length, 0, 'ya se lo llevó la primera recogida');
    });
  });
}

pruebasDeAlmacen('en memoria', async () => new AlmacenEnMemoria());

if (URL_REDIS !== undefined && URL_REDIS !== '') {
  pruebasDeAlmacen('Redis', (espacio) => AlmacenRedis.conectar(URL_REDIS, espacio));
} else {
  test('almacén Redis — omitido: no hay REDIS_URL en el entorno', { skip: true }, () => {
    // No es un aprobado: es un «no se ha comprobado». En el CI hay contenedor de
    // Redis y estas pruebas sí corren.
  });
}

describe('el despachador — cinco mensajes, una ejecución', () => {
  test('un grupo vencido produce exactamente un elemento en la cola', async () => {
    const almacen = new AlmacenEnMemoria();
    const cola = new ColaEnMemoria();
    const despachador = crearDespachador(almacen, cola);
    const t0 = 6_000_000;

    for (let i = 1; i <= 5; i += 1) {
      const m = mensaje(i, 'unico');
      await almacen.anadirAlGrupo(claveDeGrupo(m), m, 3_000, t0);
    }

    assert.equal(await despachador.despachar(t0 + 1_000), 0, 'aún no ha vencido');
    assert.equal(await cola.pendientes(), 0);

    assert.equal(await despachador.despachar(t0 + 3_001), 1);
    assert.equal(await cola.pendientes(), 1, 'UNA ejecución, no cinco');

    const [grupo] = cola.vaciar();
    assert.equal(grupo?.mensajes.length, 5);
  });

  test('un grupo vacío no genera ejecución', async () => {
    const almacen = new AlmacenEnMemoria();
    const cola = new ColaEnMemoria();
    const despachador = crearDespachador(almacen, cola);

    assert.equal(await despachador.despachar(Date.now()), 0);
    assert.equal(await cola.pendientes(), 0);
  });
});
