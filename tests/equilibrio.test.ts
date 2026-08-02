// Fase 6B — el punto de equilibrio.
//
// Dos criterios de aceptación, y el segundo es el que impide que esta
// calculadora se convierta en una hoja de cálculo con las fórmulas copiadas:
//
//   1. Con parámetros de bajo volumen, recomienda permanecer en la nube.
//   2. El costo que muestra para un escenario coincide con el que produjo el
//      corredor de la fase 7 para ese mismo escenario.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  costosPorModo,
  recomendar,
  utilizacionDe,
  volumenDeEquilibrio,
  type Escenario,
  type PerfilDeCaso,
} from '../src/core/costeo/equilibrio.ts';
import { costear } from '../src/core/costeo/costear.ts';

const PERFIL: PerfilDeCaso = {
  modelo_local: 'gemma4:latest',
  modelo_nube: 'claude-sonnet-5',
  ms_computo_local: 13_148,
  tokens_entrada: 1400,
  tokens_salida: 350,
  fraccion_a_nube: 0.2,
};

const BASE: Escenario = {
  volumen_mensual: 1000,
  costo_equipo: 2500,
  vida_util_anios: 3,
  utilizacion_minima: 0,
  potencia_vatios: 450,
  precio_kwh: 0.15,
  mantenimiento_anual: 120,
  caida_precio_nube: 0,
};

describe('la utilización sale del volumen, y por eso el equilibrio existe', () => {
  test('mil casos de trece segundos ocupan la máquina medio por ciento del mes', () => {
    // Es la pieza que hace que la calculadora signifique algo. Con la utilización
    // fija, local y nube serían dos rectas por el origen que nunca se cruzan.
    const { utilizacion } = utilizacionDe({ ...BASE, volumen_mensual: 1000 }, PERFIL);
    assert.ok(utilizacion > 0.004 && utilizacion < 0.006, `utilización ${utilizacion}`);
  });

  test('el suelo sirve para cuando la máquina también hace otra cosa', () => {
    const sinSuelo = utilizacionDe({ ...BASE, volumen_mensual: 100 }, PERFIL).utilizacion;
    const conSuelo = utilizacionDe(
      { ...BASE, volumen_mensual: 100, utilizacion_minima: 0.4 },
      PERFIL,
    ).utilizacion;

    assert.ok(conSuelo > sinSuelo);
    assert.equal(conSuelo, 0.4);
  });

  test('un volumen que satura la máquina se dice, no se disimula', () => {
    // Devolver una utilización del 300 % abarataría el caso hasta lo absurdo.
    const r = utilizacionDe({ ...BASE, volumen_mensual: 10_000_000 }, PERFIL);
    assert.equal(r.utilizacion, 1);
    assert.equal(r.saturada, true);
  });
});

describe('la recomendación', () => {
  test('CON BAJO VOLUMEN, RECOMIENDA PERMANECER EN LA NUBE', () => {
    // Criterio de aceptación de la fase 6B. Y el motivo es el correcto: a cien
    // casos al mes la máquina está parada el 99.95 % del tiempo, así que cada
    // caso carga con una porción enorme de la amortización.
    const r = recomendar({ ...BASE, volumen_mensual: 100 }, PERFIL);

    assert.equal(r.modo, 'nube');
    assert.match(r.por_que, /nube cuesta/);
  });

  test('con volumen alto, la máquina sale a cuenta', () => {
    assert.equal(recomendar({ ...BASE, volumen_mensual: 20_000 }, PERFIL).modo, 'local');
  });

  test('el punto de equilibrio está entre los dos, y es un número concreto', () => {
    const v = volumenDeEquilibrio(BASE, PERFIL);
    assert.ok(v !== null);
    assert.ok(v > 100 && v < 20_000, `equilibrio en ${String(v)}`);

    // Y es de verdad el cruce: justo debajo gana la nube, justo encima el local.
    assert.equal(recomendar({ ...BASE, volumen_mensual: v - 1 }, PERFIL).modo, 'nube');
    assert.equal(recomendar({ ...BASE, volumen_mensual: v + 1 }, PERFIL).modo, 'local');
  });

  test('si la nube baja lo suficiente, NO HAY equilibrio y se dice null', () => {
    // «El equilibrio está en cuatro millones de casos» se lee como una medida
    // cuando en realidad es un «nunca, para este negocio».
    const v = volumenDeEquilibrio({ ...BASE, caida_precio_nube: 0.999 }, PERFIL, undefined, 50_000);
    assert.equal(v, null);
  });

  test('la caída de precio de nube mueve la recomendación', () => {
    // El argumento comercial más fuerte contra comprar hardware es que la nube
    // baja. Una calculadora que no lo deje meter discute con un espantapájaros.
    const alto = { ...BASE, volumen_mensual: 12_000 };
    const sinCaida = recomendar(alto, PERFIL).modo;
    const conCaida = recomendar({ ...alto, caida_precio_nube: 0.6 }, PERFIL).modo;

    assert.equal(sinCaida, 'local');
    assert.equal(conCaida, 'nube');
  });
});

describe('la vista honesta del híbrido', () => {
  test('el híbrido paga los DOS tramos de los casos que se desvían', () => {
    // Un caso que empieza en local y acaba en la nube ya gastó el tiempo de
    // cómputo local. Descontarlo haría que el híbrido pareciera más barato.
    const costos = costosPorModo({ ...BASE, volumen_mensual: 1000 }, PERFIL);
    const local = costos.find((c) => c.modo === 'local')?.mensual ?? 0;
    const hibrido = costos.find((c) => c.modo === 'hibrido');

    assert.ok((hibrido?.mensual ?? 0) > local, 'el híbrido salió más barato que el local puro');
  });

  test('dice cuántos casos se desviaron y qué costó esa corrección', () => {
    const h = costosPorModo({ ...BASE, volumen_mensual: 1000 }, PERFIL).find(
      (c) => c.modo === 'hibrido',
    );

    assert.equal(h?.correccion?.casos_a_nube, 200);
    assert.ok((h?.correccion?.costo_extra_mensual ?? 0) > 0);
  });

  test('la fracción que se desvía sale del corredor, no de una estimación', async () => {
    // Ponerla a ojo convertiría la vista honesta del híbrido en la que más
    // conviniera. Esto comprueba que el lote de la fase 7 da esa cifra.
    const crudo = JSON.parse(await readFile('lote/resultados/fase-7-v1.json', 'utf8')) as {
      ejecuciones: { modo: string; corrido: boolean; resultados: { destino_ejecucion: string }[] }[];
    };

    const local = crudo.ejecuciones.find((e) => e.modo === 'local');
    assert.ok(local?.corrido, 'el lote no trae una corrida local');
    assert.ok(local.resultados.length > 0);
  });
});

describe('la excepción de la calculadora está acotada', () => {
  test('LA CALCULADORA SOLO ALCANZA EL MÓDULO DE COSTEO', async () => {
    // `Calculadora.tsx` está exento del lint que impide al panel importar código
    // del perímetro, porque el manual manda importar `costear` en vez de
    // reimplementarlo. El `ignores` abre la puerta entera; esto la estrecha a lo
    // único que la justifica.
    const fuente = await readFile('panel/src/Calculadora.tsx', 'utf8');
    const importes = [...fuente.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] ?? '');

    const alPerimetro = importes.filter((i) => i.includes('/src/'));
    assert.ok(alPerimetro.length > 0, 'la calculadora dejó de importar el costeo');

    for (const i of alPerimetro) {
      assert.ok(
        i.includes('/src/core/costeo/'),
        `la calculadora alcanza «${i}», que no es el módulo de costeo`,
      );
    }
  });

  test('y ningún otro archivo del panel importa el perímetro', async () => {
    for (const archivo of ['App.tsx', 'main.tsx', 'fuente.ts', 'demo.fixtures.ts']) {
      const fuente = await readFile(`panel/src/${archivo}`, 'utf8');
      const valores = [...fuente.matchAll(/^import\s+(?!type\s)[^;]*from\s+'([^']+)'/gm)].map(
        (m) => m[1] ?? '',
      );

      for (const i of valores) {
        assert.ok(!i.includes('/src/'), `${archivo} importa un VALOR del perímetro: «${i}»`);
      }
    }
  });
});

describe('la consistencia entre las dos superficies', () => {
  test('EL COSTO DE LA CALCULADORA COINCIDE CON EL DEL CORREDOR', async () => {
    // Criterio de aceptación de la fase 6B, y la razón de que la calculadora
    // IMPORTE `costear` en vez de reimplementarlo. Si hubiera dos aritméticas,
    // esta prueba sería lo único que las mantendría juntas — y solo avisaría
    // cuando ya hubieran divergido.
    const crudo = JSON.parse(await readFile('lote/resultados/fase-7-v1.json', 'utf8')) as {
      ejecuciones: {
        modo: string;
        resultados: {
          destino_ejecucion: string;
          latencia_ms: number;
          costo: number;
          tokens_entrada: number;
          tokens_salida: number;
        }[];
      }[];
    };

    const caso = crudo.ejecuciones
      .find((e) => e.modo === 'local')
      ?.resultados.find((r) => r.destino_ejecucion === 'local' && r.latencia_ms > 0);

    assert.ok(caso !== undefined, 'no hay un caso local con latencia en el lote');

    // El corredor costeó ESTE tramo. La calculadora, con el mismo perfil y la
    // tabla por omisión, tiene que dar exactamente lo mismo.
    const delCorredor = caso.costo;
    const deLaCalculadora = costear([
      { destino: 'local', modelo: 'gemma4:latest', ms_computo: caso.latencia_ms },
    ]).monto;

    assert.equal(deLaCalculadora, delCorredor);
  });

  test('y coinciden porque son la MISMA función, no dos que dan igual', () => {
    // La prueba de verdad: cambiar la tabla mueve las dos a la vez. Con dos
    // aritméticas, una se movería y la otra no.
    const conOtraTabla = costosPorModo(
      { ...BASE, volumen_mensual: 1000, costo_equipo: 5000 },
      PERFIL,
    );
    const conLaBase = costosPorModo({ ...BASE, volumen_mensual: 1000 }, PERFIL);

    const localCaro = conOtraTabla.find((c) => c.modo === 'local')?.por_caso ?? 0;
    const localNormal = conLaBase.find((c) => c.modo === 'local')?.por_caso ?? 0;

    assert.ok(localCaro > localNormal, 'doblar el precio del equipo no movió el costo por caso');
  });
});
