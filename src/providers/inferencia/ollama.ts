// Adaptador de inferencia local: Ollama.
//
// Sin SDK, por HTTP, y por `salir()` como todo lo demás. Ollama corre dentro del
// perímetro, así que no es egreso — pero se valida contra la lista igual, y esa
// distinción la lleva `config/destinos.json` en el campo `clase`.
//
// La delimitación del contenido externo es la misma que en el adaptador de nube,
// con la misma forma. Que dos adaptadores construyan la petición distinto
// significaría que cambiar de destino cambia lo que el modelo ve, y entonces la
// comparación local/nube del panel mediría dos cosas en vez de una.

import { z } from 'zod';

import type {
  Inferencia,
  PeticionInferencia,
  RespuestaInferencia,
} from '../../core/inferencia/puerto.ts';
import { salir } from '../../salida/salir.ts';

const EsquemaRespuesta = z.object({
  model: z.string(),
  message: z.object({ content: z.string() }),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
});

export type OpcionesOllama = {
  readonly url: string;
  readonly modelo: string;
};

/** Mismo armado que el adaptador de nube, para que el modelo vea lo mismo. */
export function componerTurno(peticion: PeticionInferencia): string {
  const partes = [
    `<mensaje_del_cliente procedencia="canal">\n${peticion.mensaje}\n</mensaje_del_cliente>`,
    ...peticion.fragmentos.map(
      (f) =>
        `<fragmento id="${f.fragmento_id}" documento="${f.titulo}" seccion="${f.seccion}" procedencia="corpus">\n` +
        `${f.texto}\n</fragmento>`,
    ),
  ];
  return partes.join('\n\n');
}

export class InferenciaOllama implements Inferencia {
  readonly nombre: string;
  readonly modelo: string;
  readonly destino = 'local' as const;

  private readonly url: string;

  constructor(opciones: OpcionesOllama) {
    this.url = opciones.url.replace(/\/+$/, '');
    this.modelo = opciones.modelo;
    this.nombre = `ollama:${opciones.modelo}`;
  }

  async redactar(peticion: PeticionInferencia): Promise<RespuestaInferencia> {
    const inicio = process.hrtime.bigint();

    const respuesta = await salir(`${this.url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.modelo,
        stream: false,
        messages: [
          { role: 'system', content: peticion.instrucciones },
          { role: 'user', content: componerTurno(peticion) },
        ],
        options: { num_predict: peticion.maximo_tokens },
        // Ollama admite un esquema JSON en `format` y restringe la generación a
        // él. Es el equivalente local de la salida estructurada del proveedor de
        // nube: los dos planos devuelven la misma forma, o la comparación entre
        // modos estaría comparando dos contratos distintos.
        ...(peticion.esquema === undefined ? {} : { format: peticion.esquema }),
      }),
      signal: AbortSignal.timeout(peticion.tiempo_maximo_ms),
    });

    if (!respuesta.ok) {
      const cuerpo = await respuesta.text().catch(() => '');
      throw new Error(
        `Ollama respondió ${respuesta.status} al redactar con «${this.modelo}»: ${cuerpo}`,
      );
    }

    const cuerpo = EsquemaRespuesta.safeParse(await respuesta.json());
    if (!cuerpo.success) {
      throw new Error(`Ollama devolvió una respuesta inesperada: ${z.prettifyError(cuerpo.error)}`);
    }

    return {
      texto: cuerpo.data.message.content,
      modelo: cuerpo.data.model,
      // Ollama no siempre devuelve los contadores. Se registra 0 y no una
      // estimación: una cifra inventada aquí acabaría en el panel como si
      // se hubiera medido.
      tokens_entrada: cuerpo.data.prompt_eval_count ?? 0,
      tokens_salida: cuerpo.data.eval_count ?? 0,
      latencia_ms: Number(process.hrtime.bigint() - inicio) / 1e6,
    };
  }

  async disponible(): Promise<{ ok: true } | { ok: false; motivo: string }> {
    try {
      const respuesta = await salir(`${this.url}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });
      if (!respuesta.ok) return { ok: false, motivo: `Ollama respondió ${respuesta.status}` };

      const cuerpo = z
        .object({ models: z.array(z.object({ name: z.string() })) })
        .safeParse(await respuesta.json());
      if (!cuerpo.success) return { ok: false, motivo: 'respuesta inesperada de /api/tags' };

      const tiene = cuerpo.data.models.some(
        (m) => m.name === this.modelo || m.name.startsWith(`${this.modelo}:`),
      );
      return tiene
        ? { ok: true }
        : { ok: false, motivo: `el modelo «${this.modelo}» no está descargado` };
    } catch (error) {
      return { ok: false, motivo: `no responde en ${this.url}: ${String(error)}` };
    }
  }
}
