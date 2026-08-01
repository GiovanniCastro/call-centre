// Embeddings locales por Ollama.
//
// No importa el SDK `ollama`: habla con su API HTTP directamente. Un SDK aquí
// sería una dependencia más para tres campos de JSON, y el check
// `nucleo-sin-sdk-de-proveedor` lo bloquearía en cuanto alguien lo importara un
// salto más arriba.
//
// **Sobre el `fetch`.** La fase 3 confina toda salida en un módulo único con
// lista blanca (issue #10). Ollama corre DENTRO del perímetro —localhost, o una
// máquina de la propia red—, así que esto no es egreso y no cuenta datos que
// salen. Cuando llegue esa lista blanca, el destino local entra en ella de forma
// explícita en lugar de por descuido.

import { z } from 'zod';

import type { Embeddings } from '../../core/conocimiento/puertos.ts';

const EsquemaRespuesta = z.object({
  embeddings: z.array(z.array(z.number())),
});

export type OpcionesOllama = {
  readonly url: string;
  readonly modelo: string;
  readonly dimensiones: number;
  /** Corte por petición. Ollama no responde nada si el modelo no está descargado. */
  readonly tiempo_maximo_ms?: number;
};

export class EmbeddingsOllama implements Embeddings {
  readonly nombre: string;
  readonly dimensiones: number;

  private readonly url: string;
  private readonly modelo: string;
  private readonly tiempoMaximoMs: number;

  constructor(opciones: OpcionesOllama) {
    this.url = opciones.url.replace(/\/+$/, '');
    this.modelo = opciones.modelo;
    this.dimensiones = opciones.dimensiones;
    this.nombre = `ollama:${opciones.modelo}`;
    this.tiempoMaximoMs = opciones.tiempo_maximo_ms ?? 120_000;
  }

  async incrustar(textos: readonly string[]): Promise<readonly (readonly number[])[]> {
    if (textos.length === 0) return [];

    const respuesta = await fetch(`${this.url}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.modelo, input: [...textos] }),
      signal: AbortSignal.timeout(this.tiempoMaximoMs),
    });

    if (!respuesta.ok) {
      const cuerpo = await respuesta.text().catch(() => '');
      throw new Error(
        `Ollama respondió ${respuesta.status} al incrustar con «${this.modelo}»: ${cuerpo}. ` +
          `Comprueba que el modelo está descargado (\`ollama pull ${this.modelo}\`) y que ` +
          `el servicio escucha en ${this.url}.`,
      );
    }

    const cuerpo = EsquemaRespuesta.safeParse(await respuesta.json());
    if (!cuerpo.success) {
      throw new Error(
        `Ollama devolvió una respuesta que no encaja con lo esperado: ${z.prettifyError(cuerpo.error)}`,
      );
    }

    const vectores = cuerpo.data.embeddings;

    // Las dos comprobaciones de abajo defienden lo mismo: la correspondencia por
    // posición entre texto y vector. Si se rompe, el índice queda cruzado —el
    // vector de un fragmento apuntando al texto de otro— y nada falla: la
    // recuperación sigue funcionando y devolviendo citas equivocadas, que es
    // exactamente el fallo que este proyecto existe para no tener.
    if (vectores.length !== textos.length) {
      throw new Error(
        `Se pidieron ${textos.length} vectores a «${this.modelo}» y devolvió ${vectores.length}.`,
      );
    }

    for (const [i, vector] of vectores.entries()) {
      if (vector.length !== this.dimensiones) {
        throw new Error(
          `El vector ${i} de «${this.modelo}» tiene ${vector.length} dimensiones y la ` +
            `configuración declara ${this.dimensiones}. Un desajuste de dimensiones ` +
            'significa que se cambió el modelo sin actualizar `config/conocimiento.json`, ' +
            'y el índice existente ya no es comparable con lo que se está generando.',
        );
      }
    }

    return vectores;
  }

  /** ¿Responde el servicio y tiene el modelo? Se usa al arrancar, no por consulta. */
  async disponible(): Promise<{ ok: true } | { ok: false; motivo: string }> {
    try {
      const respuesta = await fetch(`${this.url}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!respuesta.ok) return { ok: false, motivo: `Ollama respondió ${respuesta.status}` };

      const cuerpo = z
        .object({ models: z.array(z.object({ name: z.string() })) })
        .safeParse(await respuesta.json());
      if (!cuerpo.success) return { ok: false, motivo: 'Respuesta inesperada de /api/tags' };

      const tiene = cuerpo.data.models.some(
        (m) => m.name === this.modelo || m.name.startsWith(`${this.modelo}:`),
      );
      return tiene
        ? { ok: true }
        : { ok: false, motivo: `El modelo «${this.modelo}» no está descargado` };
    } catch (error) {
      return { ok: false, motivo: `No responde en ${this.url}: ${String(error)}` };
    }
  }
}
