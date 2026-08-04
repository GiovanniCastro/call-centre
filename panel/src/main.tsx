// Arranque del panel.
//
// **Este es el único archivo del repositorio que puede importar
// `demo.fixtures.ts`**, y el lint lo impone. La razón no es de estilo: si
// cualquier componente pudiera pedir datos de demostración, se podría montar una
// pantalla con cifras falsas sin pasar por el sitio que decide si son falsas.
//
// La elección entre proyección real y demostración se hace aquí y en ningún otro
// sitio, con una bandera de compilación. Y las dos ramas devuelven una `Fuente`,
// así que el panel no sabe —ni puede saber— de dónde vino: lo único que ve es el
// discriminante que le obliga a decirlo.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { Reproduccion } from './Reproduccion.tsx';
import {
  leerProyeccion,
  leerReproduccion,
  type Fuente,
  type FuenteDeReproduccion,
} from './fuente.ts';
import { fuenteDeDemostracion } from './demo.fixtures.ts';
import './estilo.css';

const EN_DEMOSTRACION = import.meta.env['VITE_DEMOSTRACION'] === '1';
const URL_PROYECCION = import.meta.env['VITE_PROYECCION'] ?? '/proyeccion.json';

/**
 * La demo pública (fase 8). Con esta variable puesta, el panel sirve la
 * reproducción del lote en lugar de la operación.
 *
 * Es una superficie distinta y no una pestaña de la misma: la de operación pide
 * autenticación de operador y enseña trazas; esta es pública, anónima y solo
 * lleva lo que el corredor grabó. Mezclarlas obligaría a decidir en tiempo de
 * ejecución qué puede ver quién, que es justo la decisión que las reglas de
 * Firestore y los `custom claims` toman en un sitio y no en cada componente.
 */
const URL_REPRODUCCION = import.meta.env['VITE_REPRODUCCION'] ?? '';

async function obtenerFuente(): Promise<Fuente | FuenteDeReproduccion> {
  if (URL_REPRODUCCION !== '') return leerReproduccion(URL_REPRODUCCION);
  if (EN_DEMOSTRACION) return fuenteDeDemostracion();
  return leerProyeccion(URL_PROYECCION);
}

const raiz = document.getElementById('raiz');
if (raiz === null) throw new Error('Falta el elemento #raiz');

const root = createRoot(raiz);

obtenerFuente()
  .then((fuente) => {
    root.render(
      <StrictMode>
        {'es_reproduccion' in fuente ? (
          <Reproduccion fuente={fuente} />
        ) : (
          <App fuente={fuente} />
        )}
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // Sin datos se dice que no hay datos. No se rellena: una pantalla que parece
    // medida y no lo está es el único fallo que este panel no se puede permitir.
    root.render(
      <StrictMode>
        <main>
          <h1>Perímetro · Operación</h1>
          <p className="vacio">{error instanceof Error ? error.message : String(error)}</p>
        </main>
      </StrictMode>,
    );
  });
