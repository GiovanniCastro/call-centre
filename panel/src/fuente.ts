// De dónde salen las cifras del panel.
//
// **Este archivo es el mecanismo del criterio de aceptación más importante de la
// fase 6**, que no es ninguna regla de Firebase:
//
//   > «Activar el módulo de datos de demostración renderiza la banda de
//   > demostración automáticamente; no hay forma de tener uno sin la otra.»
//
// En la maqueta original la banda «datos de demostración» era una decisión de
// diseño: un `<div>` que alguien podía borrar sin que nada dejara de funcionar.
// Aquí no se puede, y no por disciplina — por el tipo.
//
// `Fuente` es una **unión discriminada**. No existe un valor con `datos` y sin
// `es_demostracion`: para leer las cifras hay que pasar por el discriminante, y
// el componente que las pinta recibe la fuente entera, no los datos sueltos. La
// banda no es algo que el panel se acuerda de renderizar; es la rama del `if` que
// TypeScript obliga a escribir.
//
// Es la diferencia entre una promesa y una garantía.

import type { Proyeccion } from '../../proyeccion/derivar.ts';
import type { CasoReproducido, Reproduccion } from '../../proyeccion/demo.ts';

export type Fuente =
  | {
      readonly es_demostracion: false;
      readonly proyeccion: Proyeccion;
      /** De dónde se leyó. El panel lo enseña para que la cifra se pueda rastrear. */
      readonly origen: string;
    }
  | {
      readonly es_demostracion: true;
      readonly proyeccion: Proyeccion;
      readonly origen: string;
      /**
       * Qué dice la banda. Obligatorio: una demostración sin explicación de qué
       * es una demostración engaña igual que no avisar.
       */
      readonly aviso: string;
    };

export class ErrorDeFuente extends Error {
  override readonly name = 'ErrorDeFuente';
}

/**
 * Lee la proyección publicada.
 *
 * No hay modo degradado ni datos de relleno: si no se puede leer, el panel dice
 * que no hay datos. Rellenar con ceros produciría una pantalla que parece medida
 * y no lo está, que es el único fallo que este proyecto no se puede permitir.
 */
export async function leerProyeccion(url: string): Promise<Fuente> {
  const respuesta = await fetch(url);
  if (!respuesta.ok) {
    throw new ErrorDeFuente(
      `No se pudo leer la proyección en ${url} (${respuesta.status}). ` +
        'El panel no rellena con ceros: una pantalla que parece medida y no lo está ' +
        'es peor que una pantalla vacía. Publica con `npm run publicar`.',
    );
  }

  const proyeccion = (await respuesta.json()) as Proyeccion;
  return { es_demostracion: false, proyeccion, origen: url };
}

/**
 * La fuente de la demo pública: ejecuciones registradas del lote de la fase 7.
 *
 * Es una tercera clase de fuente y no una variante de las otras dos, porque no
 * es ninguna de ellas. No son cifras en vivo —no las hay: nada se está
 * ejecutando— y tampoco son inventadas como las de demostración: cada una salió
 * de una corrida real que quedó grabada. Llamarla «demostración» sería vender
 * como falso lo que sí se midió; llamarla «en vivo» sería lo contrario.
 *
 * Igual que en la fase 6, el aviso y el identificador del lote son obligatorios
 * en el tipo: no existe un valor de reproducción sin decir qué reproduce.
 */
export type FuenteDeReproduccion = {
  readonly es_reproduccion: true;
  readonly datos: Reproduccion;
  readonly casos: readonly CasoReproducido[];
  readonly origen: string;
};

/**
 * Lee la demo publicada.
 *
 * Dos peticiones a dos documentos estáticos. Ninguna llamada de inferencia, y
 * ninguna posibilidad de hacerla: aquí no hay más que `fetch` de dos JSON que el
 * publicador dejó escritos.
 */
export async function leerReproduccion(base: string): Promise<FuenteDeReproduccion> {
  const pedir = async (que: string): Promise<unknown> => {
    const respuesta = await fetch(`${base}/${que}.json`);
    if (!respuesta.ok) {
      throw new ErrorDeFuente(
        `No se pudo leer la reproducción en ${base}/${que}.json (${respuesta.status}). ` +
          'Publícala con `npm run publicar:demo`.',
      );
    }
    return respuesta.json();
  };

  const datos = (await pedir('lote')) as Reproduccion;
  const casos = (await pedir('casos')) as { casos: readonly CasoReproducido[] };

  return { es_reproduccion: true, datos, casos: casos.casos, origen: base };
}
