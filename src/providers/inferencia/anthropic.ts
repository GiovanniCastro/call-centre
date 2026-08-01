// Adaptador de inferencia en nube: Anthropic.
//
// **El SDK sale por nuestro `fetch`.** `new Anthropic({ fetch })` recibe
// `fetchDelPerimetro()`, así que todo el HTTP que hace el SDK pasa por la lista
// blanca y por el contador de egreso igual que el resto. Sin eso habría que
// elegir entre usar el SDK oficial y sostener el invariante 3; comprobado que la
// 0.115.0 admite `fetch` como opción de cliente antes de apostar por ello.
//
// **Lo que llega de fuera va delimitado y con su procedencia.** Las
// instrucciones van en `system`; el mensaje del cliente y los fragmentos del
// corpus van en el turno de usuario, cada fragmento como su propio bloque con el
// `fragmento_id` visible. Concatenarlo todo en `system` es la forma corta de que
// una inyección dentro de un documento se lea como si la hubiera escrito el
// perímetro.

import Anthropic from '@anthropic-ai/sdk';

import type {
  Inferencia,
  PeticionInferencia,
  RespuestaInferencia,
} from '../../core/inferencia/puerto.ts';
import { ErrorDeInferencia } from '../../core/inferencia/puerto.ts';
import { fetchDelPerimetro } from '../../salida/salir.ts';

export type OpcionesAnthropic = {
  readonly clave: string;
  readonly modelo: string;
};

export class InferenciaAnthropic implements Inferencia {
  readonly nombre: string;
  readonly modelo: string;
  readonly destino = 'nube' as const;

  private readonly cliente: Anthropic;

  constructor(opciones: OpcionesAnthropic) {
    this.modelo = opciones.modelo;
    this.nombre = `anthropic:${opciones.modelo}`;
    this.cliente = new Anthropic({
      apiKey: opciones.clave,
      fetch: fetchDelPerimetro(),
      // El SDK reintenta 429 y 5xx por su cuenta. Se deja en 2 —su valor por
      // omisión— y no en 0: un reintento del SDK es una llamada más, y esa
      // llamada pasa por el módulo de salida y se cuenta, que es lo que importa.
      maxRetries: 2,
    });
  }

  async redactar(peticion: PeticionInferencia): Promise<RespuestaInferencia> {
    const inicio = process.hrtime.bigint();

    const bloques: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        text: `<mensaje_del_cliente procedencia="canal">\n${peticion.mensaje}\n</mensaje_del_cliente>`,
      },
      ...peticion.fragmentos.map(
        (f): Anthropic.TextBlockParam => ({
          type: 'text',
          text:
            `<fragmento id="${f.fragmento_id}" documento="${f.titulo}" seccion="${f.seccion}" procedencia="corpus">\n` +
            `${f.texto}\n</fragmento>`,
        }),
      ),
    ];

    const respuesta = await this.cliente.messages.create(
      {
        model: this.modelo,
        max_tokens: peticion.maximo_tokens,
        system: peticion.instrucciones,
        messages: [{ role: 'user', content: bloques }],
        // Redactar a partir de fragmentos ya recuperados y verificados no
        // necesita deliberación: el trabajo difícil —decidir qué es cierto— ya
        // lo hizo la recuperación, y lo hará el verificador de procedencia de la
        // fase 4. Pensar aquí es latencia y tokens que el costo por caso paga.
        thinking: { type: 'disabled' },
        output_config:
          peticion.esquema === undefined
            ? { effort: 'low' }
            : // Salida estructurada: el proveedor restringe la respuesta al
              // esquema, así que lo que vuelve valida por construcción y no por
              // suerte. Sin esto, el verificador de procedencia tendría que
              // empezar por adivinar si el modelo devolvió JSON.
              { effort: 'low', format: { type: 'json_schema', schema: peticion.esquema } },
      },
      { timeout: peticion.tiempo_maximo_ms },
    );

    const latencia_ms = Number(process.hrtime.bigint() - inicio) / 1e6;

    // Los clasificadores de seguridad pueden declinar una petición: llega un 200
    // con `stop_reason: "refusal"` y `content` vacío. Leer `content[0]` sin mirar
    // antes revienta con un error que no dice lo que pasó.
    if (respuesta.stop_reason === 'refusal') {
      throw new ErrorDeInferencia(
        `El proveedor declinó la petición (categoría: ${respuesta.stop_details?.category ?? 'sin especificar'}). ` +
          'No es un fallo de red ni de credencial: el caso tiene que escalar a un humano.',
      );
    }

    const texto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return {
      texto,
      modelo: respuesta.model,
      tokens_entrada: respuesta.usage.input_tokens,
      tokens_salida: respuesta.usage.output_tokens,
      latencia_ms,
    };
  }

  async disponible(): Promise<{ ok: true } | { ok: false; motivo: string }> {
    try {
      // El corte va en las opciones de petición, que es el segundo argumento
      // posicional; `models.retrieve` toma parámetros de ruta en el primero.
      await this.cliente.models.retrieve(this.modelo, {}, { timeout: 5_000 });
      return { ok: true };
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      return { ok: false, motivo: `no se pudo consultar «${this.modelo}»: ${mensaje}` };
    }
  }
}
