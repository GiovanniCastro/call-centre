// El almacén vectorial: Qdrant por su API HTTP.
//
// **Por qué no está en `src/repos/`.** Esa carpeta tiene una prueba estructural
// que exige `AlcanceContacto` en toda función exportada, porque todo lo que hay
// ahí son datos de una persona concreta. El corpus no lo es: es común a todos los
// contactos, y no hay contacto al que acotarlo. Meterlo ahí obligaría a eximirlo,
// y una exención de la regla que separa los datos de un cliente de los de otro es
// justo lo que no conviene normalizar. Vive aquí, donde la regla que aplica es
// otra: nada de `src/core/` puede importar este archivo.
//
// **Por qué sin SDK.** La superficie que se usa son cinco llamadas HTTP. El
// cliente oficial añadiría una dependencia y un SDK al repositorio para eso.
//
// Qdrant corre dentro del perímetro, así que este `fetch` no es egreso. Ver la
// nota equivalente en `providers/embeddings/ollama.ts`.

import { z } from 'zod';

import type { Fragmento, FragmentoRecuperado } from '../core/conocimiento/documento.ts';
import { puntoDe } from '../core/conocimiento/documento.ts';
import type { AlmacenVectorial } from '../core/conocimiento/puertos.ts';

const EsquemaCarga = z.object({
  fragmento_id: z.string(),
  documento_id: z.string(),
  titulo: z.string(),
  seccion: z.string(),
  texto: z.string(),
  orden: z.number().int(),
  suma_documento: z.string(),
});

const EsquemaPuntos = z.object({
  result: z.object({
    points: z.array(z.object({ score: z.number(), payload: EsquemaCarga })),
  }),
});

const EsquemaColeccion = z.object({
  result: z.object({ points_count: z.number().int().nonnegative() }),
});

export type OpcionesQdrant = {
  readonly url: string;
  readonly coleccion: string;
  readonly metrica: 'Cosine' | 'Dot' | 'Euclid';
  readonly tiempo_maximo_ms?: number;
};

export class AlmacenQdrant implements AlmacenVectorial {
  private readonly url: string;
  private readonly coleccion: string;
  private readonly metrica: string;
  private readonly tiempoMaximoMs: number;

  constructor(opciones: OpcionesQdrant) {
    this.url = opciones.url.replace(/\/+$/, '');
    this.coleccion = opciones.coleccion;
    this.metrica = opciones.metrica;
    this.tiempoMaximoMs = opciones.tiempo_maximo_ms ?? 30_000;
  }

  private async pedir(ruta: string, opciones: RequestInit = {}): Promise<Response> {
    const respuesta = await fetch(`${this.url}${ruta}`, {
      ...opciones,
      headers: { 'content-type': 'application/json', ...opciones.headers },
      signal: AbortSignal.timeout(this.tiempoMaximoMs),
    });
    return respuesta;
  }

  private async exigir(ruta: string, opciones: RequestInit, que: string): Promise<unknown> {
    const respuesta = await this.pedir(ruta, opciones);
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text().catch(() => '');
      throw new Error(`Qdrant respondió ${respuesta.status} al ${que}: ${cuerpo}`);
    }
    return respuesta.json();
  }

  async asegurarColeccion(dimensiones: number): Promise<void> {
    const existente = await this.pedir(`/collections/${this.coleccion}`);

    if (existente.ok) {
      const cuerpo = z
        .object({ result: z.object({ config: z.object({ params: z.object({ vectors: z.object({ size: z.number() }) }) }) }) })
        .safeParse(await existente.json());

      const tamano = cuerpo.success ? cuerpo.data.result.config.params.vectors.size : null;

      // Un cambio de modelo cambia las dimensiones. Seguir escribiendo en la
      // colección vieja no fallaría —Qdrant rechaza el vector, o peor, la acepta
      // si coincide el tamaño— y el índice quedaría con vectores de dos modelos
      // distintos, que no son comparables entre sí. Las puntuaciones resultantes
      // no significan nada, y el umbral deja de querer decir lo que dice.
      if (tamano !== null && tamano !== dimensiones) {
        throw new Error(
          `La colección «${this.coleccion}» tiene vectores de ${tamano} dimensiones y se ` +
            `están generando de ${dimensiones}. Cambiar de modelo de embeddings invalida ` +
            'el índice entero. Bórralo y reingiere: `npm run conocimiento:reindexar`.',
        );
      }
      return;
    }

    await this.exigir(
      `/collections/${this.coleccion}`,
      {
        method: 'PUT',
        body: JSON.stringify({ vectors: { size: dimensiones, distance: this.metrica } }),
      },
      'crear la colección',
    );
  }

  async guardar(
    fragmentos: readonly Fragmento[],
    vectores: readonly (readonly number[])[],
  ): Promise<void> {
    if (fragmentos.length === 0) return;

    if (fragmentos.length !== vectores.length) {
      throw new Error(
        `Se intentan guardar ${fragmentos.length} fragmentos con ${vectores.length} vectores. ` +
          'Guardar con la correspondencia rota deja el vector de un fragmento apuntando al ' +
          'texto de otro, y eso no falla: recupera citas equivocadas.',
      );
    }

    const puntos = fragmentos.map((fragmento, i) => ({
      id: puntoDe(fragmento.fragmento_id),
      vector: vectores[i],
      payload: {
        fragmento_id: fragmento.fragmento_id,
        documento_id: fragmento.documento_id,
        titulo: fragmento.titulo,
        seccion: fragmento.seccion,
        texto: fragmento.texto,
        orden: fragmento.orden,
        suma_documento: fragmento.suma_documento,
      },
    }));

    // `wait=true`: la ingestión tiene que poder afirmar que lo guardado es
    // buscable al volver. Sin esperar, una prueba que ingiere y busca acto
    // seguido falla de forma intermitente, que es la peor clase de fallo.
    await this.exigir(
      `/collections/${this.coleccion}/points?wait=true`,
      { method: 'PUT', body: JSON.stringify({ points: puntos }) },
      'guardar puntos',
    );
  }

  async borrarDocumento(documentoId: string): Promise<void> {
    await this.exigir(
      `/collections/${this.coleccion}/points/delete?wait=true`,
      {
        method: 'POST',
        body: JSON.stringify({
          filter: { must: [{ key: 'documento_id', match: { value: documentoId } }] },
        }),
      },
      'borrar los fragmentos de un documento',
    );
  }

  async buscar(
    vector: readonly number[],
    maximo: number,
  ): Promise<readonly FragmentoRecuperado[]> {
    const cuerpo = await this.exigir(
      `/collections/${this.coleccion}/points/query`,
      {
        method: 'POST',
        body: JSON.stringify({ query: [...vector], limit: maximo, with_payload: true }),
      },
      'buscar',
    );

    const respuesta = EsquemaPuntos.safeParse(cuerpo);
    if (!respuesta.success) {
      throw new Error(`Qdrant devolvió una búsqueda inesperada: ${z.prettifyError(respuesta.error)}`);
    }

    return respuesta.data.result.points.map((p) => ({ ...p.payload, puntuacion: p.score }));
  }

  async contar(): Promise<number> {
    const respuesta = await this.pedir(`/collections/${this.coleccion}`);
    if (!respuesta.ok) return 0;

    const cuerpo = EsquemaColeccion.safeParse(await respuesta.json());
    return cuerpo.success ? cuerpo.data.result.points_count : 0;
  }

  /** Borra la colección entera. Solo lo usa la reindexación explícita. */
  async borrarColeccion(): Promise<void> {
    await this.pedir(`/collections/${this.coleccion}`, { method: 'DELETE' });
  }

  async disponible(): Promise<{ ok: true } | { ok: false; motivo: string }> {
    try {
      const respuesta = await this.pedir('/readyz');
      return respuesta.ok ? { ok: true } : { ok: false, motivo: `Qdrant respondió ${respuesta.status}` };
    } catch (error) {
      return { ok: false, motivo: `No responde en ${this.url}: ${String(error)}` };
    }
  }
}
