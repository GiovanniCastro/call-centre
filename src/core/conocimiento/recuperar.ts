// Recuperación con umbral y referencia.
//
// **Aquí es donde el invariante 1 deja de ser prosa.** «Sin fuente no hay
// respuesta» se convierte en una comparación: si el mejor fragmento no llega al
// umbral, esta función devuelve un vacío explícito con su motivo, y no el mejor
// de los malos. Que el vacío sea un valor del tipo y no una lista de longitud
// cero es deliberado: obliga a quien llama a distinguir «no hay fuente» de «hay
// fuentes» en el propio tipo, en lugar de dejarlo en un `if (lista.length)` que
// se puede olvidar.

import type { ConfigConocimiento } from './config.ts';
import type { FragmentoRecuperado } from './documento.ts';
import type { AlmacenVectorial, Embeddings } from './puertos.ts';

export type Recuperacion =
  | {
      readonly hay: true;
      readonly fragmentos: readonly FragmentoRecuperado[];
      /** La puntuación del mejor fragmento. Va a la telemetría. */
      readonly mejor: number;
      readonly umbral: number;
    }
  | {
      readonly hay: false;
      readonly motivo: 'bajo_umbral' | 'indice_vacio';
      /** La puntuación del mejor descartado, si hubo alguno. */
      readonly mejor: number | null;
      readonly umbral: number;
    };

export type Recuperador = (consulta: string) => Promise<Recuperacion>;

/**
 * @param config Se pasa entera en lugar de solo el umbral para que cambiar
 *   `config/conocimiento.json` cambie el comportamiento sin tocar este archivo,
 *   que es el criterio de aceptación de la fase 0 aplicado aquí.
 */
export function crearRecuperador(
  embeddings: Embeddings,
  almacen: AlmacenVectorial,
  config: ConfigConocimiento,
): Recuperador {
  const { umbral, maximo_fragmentos } = config.recuperacion;

  return async function recuperar(consulta: string): Promise<Recuperacion> {
    const texto = consulta.trim();

    // Una consulta vacía no se envía a incrustar: el vector de la cadena vacía es
    // ruido, y ese ruido puntúa contra algo. Es el camino más corto a una cita
    // inventada con apariencia de recuperación legítima.
    if (texto === '') {
      return { hay: false, motivo: 'indice_vacio', mejor: null, umbral };
    }

    const [vector] = await embeddings.incrustar([texto]);

    if (vector === undefined) {
      throw new Error(
        `El proveedor de embeddings «${embeddings.nombre}» no devolvió vector para la ` +
          'consulta. Devolver menos vectores que textos rompe la correspondencia por ' +
          'posición, y seguir adelante indexaría el fragmento equivocado.',
      );
    }

    const candidatos = await almacen.buscar(vector, maximo_fragmentos);

    if (candidatos.length === 0) {
      return { hay: false, motivo: 'indice_vacio', mejor: null, umbral };
    }

    // El almacén devuelve ordenado por puntuación descendente, pero no se confía:
    // el orden es lo que decide qué se cita primero.
    const ordenados = [...candidatos].sort((a, b) => b.puntuacion - a.puntuacion);
    const mejor = ordenados[0]?.puntuacion ?? 0;
    const porEncima = ordenados.filter((f) => f.puntuacion >= umbral);

    if (porEncima.length === 0) {
      return { hay: false, motivo: 'bajo_umbral', mejor, umbral };
    }

    return { hay: true, fragmentos: porEncima, mejor, umbral };
  };
}

/**
 * Las referencias de una recuperación, en el formato que el agente puede citar y
 * que la fase 4 verificará.
 *
 * Se devuelve texto y no se imprime: el núcleo no decide dónde se ve esto.
 */
export function referenciasDe(recuperacion: Recuperacion): readonly string[] {
  if (!recuperacion.hay) return [];
  return recuperacion.fragmentos.map(
    (f) => `${f.titulo} › ${f.seccion} (${f.fragmento_id}, ${f.puntuacion.toFixed(3)})`,
  );
}

/** Los identificadores que van al campo `fuentes` del evento de telemetría. */
export function fuentesDe(recuperacion: Recuperacion): readonly string[] {
  if (!recuperacion.hay) return [];
  return recuperacion.fragmentos.map((f) => f.fragmento_id);
}
