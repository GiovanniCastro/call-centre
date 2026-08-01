// Las dos interfaces que el conocimiento necesita del mundo exterior.
//
// Están en `core/` y las implementan `providers/` y `repos/`, nunca al revés: es
// el mismo reparto que con `Canal`, y lo sostiene el check `nucleo-sin-adaptadores`.
// El criterio de aceptación «los embeddings se generan local o en nube según
// configuración, sin tocar el código de recuperación» es exactamente esto: la
// recuperación conoce `Embeddings`, no conoce Ollama.

import type { Fragmento, FragmentoRecuperado } from './documento.ts';

export interface Embeddings {
  /** Cómo se identifica en la telemetría: `ollama:bge-m3`. */
  readonly nombre: string;
  readonly dimensiones: number;

  /**
   * Incrusta textos, en orden. La respuesta tiene tantos vectores como textos
   * entraron y en la misma posición; un adaptador que no lo cumpla rompe la
   * correspondencia entre fragmento y vector, y el índice quedaría cruzado sin
   * que nada fallase.
   */
  incrustar(textos: readonly string[]): Promise<readonly (readonly number[])[]>;
}

export interface AlmacenVectorial {
  /** Crea la colección si no existe. Idempotente. */
  asegurarColeccion(dimensiones: number): Promise<void>;

  /** Guarda o sustituye. El identificador del punto sale del `fragmento_id`. */
  guardar(
    fragmentos: readonly Fragmento[],
    vectores: readonly (readonly number[])[],
  ): Promise<void>;

  /**
   * Borra los fragmentos de un documento.
   *
   * Es lo que hace idempotente la reingestión de un documento **modificado**:
   * como el `fragmento_id` incluye la suma, los fragmentos nuevos no pisan a los
   * viejos y sin este borrado el índice acumularía las dos versiones — con la
   * vieja compitiendo por recuperarse.
   */
  borrarDocumento(documentoId: string): Promise<void>;

  buscar(
    vector: readonly number[],
    maximo: number,
  ): Promise<readonly FragmentoRecuperado[]>;

  contar(): Promise<number>;
}
