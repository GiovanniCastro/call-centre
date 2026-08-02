// Criterio de aceptación de la fase 6:
//
//   «Activar el módulo de datos de demostración renderiza la banda de
//   demostración automáticamente; no hay forma de tener uno sin la otra.»
//
// En la maqueta original la banda era un `<div>` que alguien podía borrar. El
// mecanismo que lo impide tiene tres piezas, y esta prueba cubre las tres:
//
//   1. El TIPO: `Fuente` es una unión discriminada. No existe un valor con
//      cifras y sin bandera.
//   2. El LINT: solo `main.tsx` puede importar `demo.fixtures.ts`.
//   3. El COMPONENTE: la banda sale de la misma bandera que trae las cifras.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { fuenteDeDemostracion } from '../panel/src/demo.fixtures.ts';
import type { Fuente } from '../panel/src/fuente.ts';

describe('la banda de demostración no se puede quitar', () => {
  test('LA ÚNICA FORMA DE OBTENER CIFRAS DE DEMOSTRACIÓN LAS TRAE MARCADAS', () => {
    const fuente = fuenteDeDemostracion();

    assert.equal(fuente.es_demostracion, true);
    // Y con su aviso, que es obligatorio en el tipo: una demostración sin decir
    // qué es engaña igual que no avisar.
    assert.ok(fuente.es_demostracion && fuente.aviso.length > 20);
    assert.match(fuente.aviso, /DEMOSTRACIÓN/);
  });

  test('el módulo de demostración NO exporta las cifras sueltas', async () => {
    // Si exportara la proyección a pelo, alguien podría montar una pantalla con
    // ella dejando la bandera atrás. La única exportación es la fuente completa.
    const modulo = await import('../panel/src/demo.fixtures.ts');
    assert.deepEqual(Object.keys(modulo).sort(), ['fuenteDeDemostracion']);
  });

  test('la fuente real NUNCA se marca como demostración', async () => {
    const fuente: Fuente = {
      es_demostracion: false,
      origen: 'https://ejemplo/proyeccion.json',
      proyeccion: fuenteDeDemostracion().proyeccion,
    };

    // TypeScript ya lo impide —la rama `false` no tiene `aviso`— y esto lo fija
    // en ejecución, que es lo que sobrevive a un `as` mal puesto.
    assert.equal(fuente.es_demostracion, false);
    assert.ok(!('aviso' in fuente));
  });

  test('EL COMPONENTE SACA LA BANDA DE LA MISMA BANDERA QUE TRAE LAS CIFRAS', async () => {
    // La banda no es un `<div>` suelto que alguien pueda borrar sin romper nada:
    // es la rama de un condicional sobre el discriminante. Si se borra, el aviso
    // queda sin usar; si se cambia la bandera, desaparecen también las cifras.
    const app = await readFile('panel/src/App.tsx', 'utf8');

    assert.match(app, /fuente\.es_demostracion &&/, 'la banda no cuelga del discriminante');
    assert.match(app, /banda-demo/);
    assert.match(app, /\{fuente\.aviso\}/, 'la banda no enseña el aviso de la fuente');

    // Y la propiedad estructural que lo sostiene: `App` recibe la FUENTE, no la
    // proyección. Cambiar esa firma a `{ proyeccion }` sería la única forma de
    // separar las cifras de su bandera, y rompería esta prueba.
    assert.match(
      app,
      /export function App\(\{\s*fuente\s*\}: \{\s*fuente: Fuente\s*\}\)/,
      'App dejó de recibir la fuente entera: las cifras podrían llegar sin la bandera',
    );
  });

  test('la comprobación del componente es textual, y aquí está por qué', () => {
    // Node borra tipos pero no transforma JSX, así que este archivo no puede
    // importar `App.tsx` y renderizarlo. Se comprueba sobre el texto, que es más
    // débil que un render y es lo que hay sin meter un transformador en las
    // pruebas del perímetro. Lo fuerte de verdad no es esta prueba: es que
    // `Fuente` sea una unión discriminada, y eso lo comprueba el compilador en
    // cada `npm run check:panel`.
    assert.ok(true);
  });

  test('el lint prohíbe pedir datos de demostración fuera del arranque', async () => {
    const config = await readFile('eslint.config.js', 'utf8');

    assert.match(config, /demo\.fixtures\*/);
    assert.match(config, /panel\/src\/main\.tsx/);
  });

  test('los datos de demostración tampoco se contradicen entre sí', () => {
    // El defecto que el panel existe para no tener. Ni siquiera en la demo se
    // permite que el KPI y el reparto den cifras distintas de lo mismo.
    const p = fuenteDeDemostracion().proyeccion;
    assert.equal(p.reparto.escalados_a_humano, p.kpi.escalados_a_humano);

    const suma = p.kpi.resueltos + p.kpi.escalados_a_humano + p.kpi.bloqueados + p.kpi.descartados;
    assert.equal(suma, p.kpi.casos);
  });

  test('la demo enseña el costo como PROVISIONAL, no como cero', () => {
    // Mismo criterio que R-031: «gratis» es la peor cifra que este proyecto
    // podría enseñar mal, y en una demo se enseñaría a más gente.
    const p = fuenteDeDemostracion().proyeccion;
    assert.equal(p.costeo.provisional, true);
    assert.equal(p.kpi.costo_por_resuelto, null);
  });
});
