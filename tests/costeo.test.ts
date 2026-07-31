// Criterios de aceptación de la fase 0 cubiertos aquí:
//
//   · «La función de costeo tiene pruebas para nube, local e híbrido.»
//   · «Cambiar un precio en config/ cambia los totales sin tocar código.»
//   · «La función de costeo es la única fuente de costo del sistema.»
//
// El tercero no se prueba con una aserción sino con el lint y el check de
// arquitectura; lo que sí se prueba aquí es que la función devuelve los
// supuestos, que es lo que hace innecesario recalcular por fuera.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { costear, ErrorDeCosteo, type Tramo } from '../src/core/costeo/costear.ts';
import { tablaDesde, TABLA } from '../src/core/costeo/precios.ts';
import precios from '../config/precios.json' with { type: 'json' };
import maquinaReal from '../config/maquina-referencia.json' with { type: 'json' };

/** Una máquina confirmada con cifras redondas, para poder verificar la aritmética. */
const MAQUINA_CONFIRMADA = {
  version: 1,
  moneda: 'USD',
  estado: 'CONFIRMADA',
  equipo: 'Banco de pruebas',
  costo_equipo: 2400,
  vida_util_anios: 3,
  utilizacion_asumida: 0.4,
  potencia_vatios: 450,
  precio_kwh: 0.15,
  mantenimiento_anual: 100,
};

const TABLA_PRUEBA = tablaDesde(precios, MAQUINA_CONFIRMADA);

/** Horas que la máquina realmente trabaja en su vida útil: 3 × 8760 × 0,4. */
const HORAS_UTILES = 10_512;
const TARIFA_HORA = 2400 / HORAS_UTILES + (100 * 3) / HORAS_UTILES + (450 / 1000) * 0.15;

function casiIgual(real: number, esperado: number, tolerancia = 1e-9): void {
  assert.ok(
    Math.abs(real - esperado) < tolerancia,
    `esperaba ~${esperado}, llegó ${real} (diferencia ${Math.abs(real - esperado)})`,
  );
}

test('nube: el costo sale de los tokens por la tarifa del modelo', () => {
  const resultado = costear(
    [{ destino: 'nube', modelo: 'claude-opus-5', tokens_entrada: 10_000, tokens_salida: 2_000 }],
    TABLA_PRUEBA,
  );

  // 10 000/1M × $5 = $0,05   +   2 000/1M × $25 = $0,05
  casiIgual(resultado.monto, 0.1);
  assert.equal(resultado.moneda, 'USD');
  assert.equal(resultado.desglose[0]?.base, 'tokens');
  assert.equal(resultado.supuestos.local, null);
  assert.deepEqual(resultado.supuestos.nube[0], {
    modelo: 'claude-opus-5',
    proveedor: 'anthropic',
    entrada_por_millon: 5,
    salida_por_millon: 25,
  });
});

test('local: el costo sale del tiempo de cómputo por la tarifa horaria de la máquina', () => {
  // 12 000 ms = 1/300 de hora.
  const resultado = costear(
    [{ destino: 'local', modelo: 'llama3.1:8b', ms_computo: 12_000 }],
    TABLA_PRUEBA,
  );

  casiIgual(resultado.monto, TARIFA_HORA / 300);
  assert.equal(resultado.desglose[0]?.base, 'tiempo');
  assert.equal(resultado.supuestos.nube.length, 0);
});

test('local: devuelve los supuestos que usó, no solo el número', () => {
  const { supuestos } = costear(
    [{ destino: 'local', modelo: 'llama3.1:8b', ms_computo: 1_000 }],
    TABLA_PRUEBA,
  );

  // «$0,004 por caso» a secas invita a una pregunta sin respuesta. El panel
  // tiene que poder mostrar de dónde sale.
  assert.equal(supuestos.local?.equipo, 'Banco de pruebas');
  assert.equal(supuestos.local?.vida_util_anios, 3);
  assert.equal(supuestos.local?.utilizacion_asumida, 0.4);
  assert.equal(supuestos.local?.horas_utiles_de_vida, HORAS_UTILES);
  casiIgual(supuestos.local?.tarifa_hora ?? 0, TARIFA_HORA);
});

test('híbrido: el costo de un desvío es la suma de los dos tramos, no solo el segundo', () => {
  const tramos: Tramo[] = [
    // El local que no alcanzó...
    { destino: 'local', modelo: 'llama3.1:8b', ms_computo: 12_000 },
    // ...y la nube que resolvió.
    { destino: 'nube', modelo: 'claude-opus-5', tokens_entrada: 10_000, tokens_salida: 2_000 },
  ];

  const resultado = costear(tramos, TABLA_PRUEBA);

  casiIgual(resultado.monto, TARIFA_HORA / 300 + 0.1);
  assert.equal(resultado.desglose.length, 2);
  assert.notEqual(resultado.supuestos.local, null);
  assert.equal(resultado.supuestos.nube.length, 1);

  // El intento local no es gratis. Si el costeo del híbrido ignorara el tramo
  // que falló, el modo híbrido parecería más barato de lo que es y la
  // calculadora de punto de equilibrio de la fase 6B recomendaría mal.
  const soloNube = costear([tramos[1]!], TABLA_PRUEBA);
  assert.ok(resultado.monto > soloNube.monto);
});

test('cambiar un precio en config cambia los totales sin tocar código', () => {
  const dobles = structuredClone(precios) as typeof precios;
  const modelo = dobles.nube.anthropic!.modelos['claude-opus-5']!;
  modelo.entrada_por_millon *= 2;
  modelo.salida_por_millon *= 2;

  const tramo: Tramo = {
    destino: 'nube',
    modelo: 'claude-opus-5',
    tokens_entrada: 10_000,
    tokens_salida: 2_000,
  };

  const antes = costear([tramo], TABLA_PRUEBA);
  const despues = costear([tramo], tablaDesde(dobles, MAQUINA_CONFIRMADA));

  casiIgual(despues.monto, antes.monto * 2);
});

test('un modelo sin precio declarado no se costea en silencio: revienta', () => {
  assert.throws(
    () =>
      costear(
        [{ destino: 'nube', modelo: 'modelo-inventado', tokens_entrada: 1, tokens_salida: 1 }],
        TABLA_PRUEBA,
      ),
    (error: unknown) =>
      error instanceof ErrorDeCosteo && /no está en config\/precios\.json/.test(error.message),
  );
});

test('una magnitud inválida revienta en lugar de propagar un NaN hasta el panel', () => {
  assert.throws(
    () =>
      costear(
        [{ destino: 'nube', modelo: 'claude-opus-5', tokens_entrada: -1, tokens_salida: 0 }],
        TABLA_PRUEBA,
      ),
    ErrorDeCosteo,
  );

  assert.throws(
    () => costear([{ destino: 'local', modelo: 'llama3.1:8b', ms_computo: NaN }], TABLA_PRUEBA),
    ErrorDeCosteo,
  );
});

test('sin tramos el costo es cero y no arrastra supuestos', () => {
  const resultado = costear([], TABLA_PRUEBA);
  assert.equal(resultado.monto, 0);
  assert.equal(resultado.provisional, false);
  assert.equal(resultado.supuestos.local, null);
});

test('un costo apoyado en la máquina sin confirmar sale marcado como provisional', () => {
  // La máquina de referencia real todavía está sin decidir. Mientras lo esté,
  // ninguna cifra de costo local puede publicarse sin decirlo.
  assert.equal(maquinaReal.estado, 'PROVISIONAL');

  const local = costear([{ destino: 'local', modelo: 'llama3.1:8b', ms_computo: 1_000 }], TABLA);
  assert.equal(local.provisional, true);

  // Un caso enteramente en la nube no depende de esos supuestos.
  const nube = costear(
    [{ destino: 'nube', modelo: 'claude-opus-5', tokens_entrada: 10, tokens_salida: 10 }],
    TABLA,
  );
  assert.equal(nube.provisional, false);
});

test('la tabla real carga y valida al importar el módulo', () => {
  assert.ok(TABLA.nube.has('claude-opus-5'));
  assert.equal(TABLA.nube.get('claude-opus-5')?.proveedor, 'anthropic');
  assert.equal(TABLA.actualizado, precios.actualizado);
});
