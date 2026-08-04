// Los dos criterios que la fase 6 dejó abiertos, cerrados contra el emulador.
//
//   > «Una prueba en el emulador de Firebase falla si un cliente autenticado
//   >  puede escribir en la proyección.»
//   > «Una prueba falla si un usuario con rol de métricas puede leer una traza
//   >  con contenido.»
//
// Hasta ahora las reglas estaban escritas y razonadas, y la lógica de acceso
// probada aparte. Lo que faltaba era ejercitarlas contra Firestore, y esa
// diferencia no es formal: una regla de seguridad se escribe en un lenguaje que
// nadie compila hasta que el servicio la carga, y hasta entonces «deniega por
// omisión y se unen por OR» es una creencia sobre cómo se comporta, no una
// observación.
//
// Corre con `npm run test:reglas`, que levanta el emulador. Sin él, se omite
// diciéndolo: una prueba omitida no es una prueba aprobada.

import { test, describe, before, after } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const EMULADOR = process.env['FIRESTORE_EMULATOR_HOST'];

/** Los dos `custom claims` de la fase 6. Ver `proyeccion/reglas/firestore.rules`. */
const OPERADOR_DE_METRICAS = { metricas: true };
const OPERADOR_DE_TRAZAS = { trazas: true };

describe(
  'las reglas de la proyección, contra el emulador de Firestore',
  { skip: EMULADOR === undefined ? 'no hay emulador: usa `npm run test:reglas`' : false },
  () => {
    let entorno: RulesTestEnvironment;

    before(async () => {
      const [anfitrion, puerto] = (EMULADOR ?? '').split(':');

      entorno = await initializeTestEnvironment({
        projectId: 'demo-perimetro',
        firestore: {
          rules: readFileSync('proyeccion/reglas/firestore.rules', 'utf8'),
          host: anfitrion ?? '127.0.0.1',
          port: Number(puerto ?? 8080),
        },
      });

      // Se siembra saltándose las reglas, que es exactamente lo que hace el
      // publicador con el Admin SDK. Si hubiera que sembrar con un cliente, la
      // prueba estaría dando por bueno justo lo que viene a negar.
      await entorno.withSecurityRulesDisabled(async (contexto) => {
        const bd = contexto.firestore();
        await setDoc(doc(bd, 'agregados/2026-08'), { casos: 65, escalados_a_humano: 32 });
        await setDoc(doc(bd, 'trazas/lote:v1:031'), {
          motivo_decision: 'sensibilidad alta: se retiene en el perímetro',
          fuentes: ['07-precios-y-deducibles.md'],
        });
        await setDoc(doc(bd, 'vigias/perimetro'), { umbral: 0, valor: 0 });
        await setDoc(doc(bd, 'demo/lote'), { lote: 'fase-7-v1', es_reproduccion: true });
      });
    });

    after(async () => {
      await entorno.cleanup();
    });

    // ── Invariante 8 · La proyección es de un solo sentido ──────────────────

    test('UN CLIENTE AUTENTICADO NO PUEDE ESCRIBIR EN LA PROYECCIÓN', async () => {
      // El criterio de la fase 6, tal cual. Y con el rol más alto que existe:
      // si el de trazas tampoco puede, ninguno puede.
      const bd = entorno.authenticatedContext('operador', OPERADOR_DE_TRAZAS).firestore();

      await assertFails(setDoc(doc(bd, 'agregados/2026-08'), { casos: 999 }));
      await assertFails(setDoc(doc(bd, 'trazas/lote:v1:031'), { motivo_decision: 'inventado' }));
      await assertFails(setDoc(doc(bd, 'vigias/perimetro'), { umbral: 9999 }));
      await assertFails(setDoc(doc(bd, 'demo/lote'), { lote: 'falsificado' }));
    });

    test('tampoco puede escribir un anónimo, ni en una colección que no existe', async () => {
      const bd = entorno.unauthenticatedContext().firestore();

      await assertFails(setDoc(doc(bd, 'agregados/2026-08'), { casos: 0 }));
      // Una colección que nadie declaró está denegada porque ninguna regla la
      // concede, no porque alguna la niegue. Conviene comprobarlo: es el
      // comportamiento del que depende que abrir algo requiera escribirlo.
      await assertFails(setDoc(doc(bd, 'inventada/documento'), { lo: 'que sea' }));
    });

    // ── Fase 6 · Ver métricas no es ver contenido ───────────────────────────

    test('EL ROL DE MÉTRICAS NO PUEDE LEER UNA TRAZA CON CONTENIDO', async () => {
      // El segundo criterio. La distinción entera del sistema de roles vive
      // aquí: son dos permisos, no dos escalones de uno.
      const bd = entorno.authenticatedContext('analista', OPERADOR_DE_METRICAS).firestore();

      await assertSucceeds(getDoc(doc(bd, 'agregados/2026-08')));
      await assertSucceeds(getDoc(doc(bd, 'vigias/perimetro')));
      await assertFails(getDoc(doc(bd, 'trazas/lote:v1:031')));
    });

    test('el rol de trazas sí las lee, y también las métricas', async () => {
      const bd = entorno.authenticatedContext('investigador', OPERADOR_DE_TRAZAS).firestore();

      await assertSucceeds(getDoc(doc(bd, 'trazas/lote:v1:031')));
      await assertSucceeds(getDoc(doc(bd, 'agregados/2026-08')));
    });

    test('un autenticado sin ningún rol no ve nada', async () => {
      // Estar dentro no es tener permiso. Un usuario recién creado en Firebase
      // Auth no lleva `custom claims`, y este es su caso.
      const bd = entorno.authenticatedContext('recien-llegado', {}).firestore();

      await assertFails(getDoc(doc(bd, 'agregados/2026-08')));
      await assertFails(getDoc(doc(bd, 'trazas/lote:v1:031')));
    });

    // ── Fase 8 · La demo pública ────────────────────────────────────────────

    test('la demo pública se lee sin cuenta, y solo la demo', async () => {
      const bd = entorno.unauthenticatedContext().firestore();

      await assertSucceeds(getDoc(doc(bd, 'demo/lote')));
      // Y desde ahí no se llega a nada más: la lectura anónima acaba en `demo`.
      await assertFails(getDoc(doc(bd, 'agregados/2026-08')));
      await assertFails(getDoc(doc(bd, 'trazas/lote:v1:031')));
    });
  },
);
