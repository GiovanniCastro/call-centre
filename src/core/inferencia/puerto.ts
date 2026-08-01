// La interfaz de inferencia y el estado de un proveedor.
//
// El núcleo conoce esto y nada más. Que un proveedor sea Anthropic, Ollama o el
// que se añada mañana no cambia una línea del enrutador — invariante 4, y lo
// sostiene `nucleo-sin-adaptadores` sobre el grafo completo.
//
// **El armado de la petición vive en el adaptador, no aquí.** Esta interfaz
// recibe las piezas por separado —instrucciones, mensaje del cliente, fragmentos
// recuperados con su procedencia— y es cada adaptador quien decide cómo las
// coloca en el formato de su proveedor. Si el núcleo entregara una cadena ya
// concatenada, el contenido externo viajaría dentro de la zona de instrucciones
// y la delimitación por procedencia sería una convención de quien la escribió,
// no una propiedad del sistema.

import type { Requisito } from '../canal.ts';
import type { DestinoEjecucion } from '../../telemetry/evento.ts';

/** Un fragmento del corpus, tal como se le entrega al modelo: delimitado. */
export type FragmentoConProcedencia = {
  readonly fragmento_id: string;
  readonly titulo: string;
  readonly seccion: string;
  readonly texto: string;
};

export type PeticionInferencia = {
  /** Instrucciones del sistema. Las escribe el perímetro; nunca vienen de fuera. */
  readonly instrucciones: string;
  /**
   * Lo que dijo el cliente. **Ya saneado**: el adaptador no enmascara, recibe
   * enmascarado. Poner el saneo en el adaptador significaría que un adaptador
   * nuevo puede olvidarlo.
   */
  readonly mensaje: string;
  readonly fragmentos: readonly FragmentoConProcedencia[];
  readonly maximo_tokens: number;
  readonly tiempo_maximo_ms: number;
};

export type RespuestaInferencia = {
  readonly texto: string;
  readonly modelo: string;
  readonly tokens_entrada: number;
  readonly tokens_salida: number;
  readonly latencia_ms: number;
};

export interface Inferencia {
  /** Cómo se identifica en la telemetría: `anthropic:claude-sonnet-5`. */
  readonly nombre: string;
  readonly modelo: string;
  readonly destino: DestinoEjecucion;

  redactar(peticion: PeticionInferencia): Promise<RespuestaInferencia>;

  /** ¿Responde y tiene el modelo? Se llama al arrancar, no por caso. */
  disponible(): Promise<{ ok: true } | { ok: false; motivo: string }>;
}

/**
 * Un proveedor está utilizable, o es una declaración de lo que le falta.
 *
 * Mismo patrón que los canales y que los embeddings, y por la misma razón: un
 * proveedor a medias falla en la primera petición real. Aquí además tiene un
 * uso nuevo — es la lista que el panel enseña y donde se ve, proveedor a
 * proveedor, qué clave hay que pegar para activarlo.
 */
export type EstadoProveedor =
  | {
      readonly estado: 'configurado';
      readonly proveedor: string;
      readonly inferencia: Inferencia;
    }
  | {
      readonly estado: 'no_configurado';
      readonly proveedor: string;
      readonly requisitos: readonly Requisito[];
      readonly faltan: readonly string[];
    }
  | {
      /**
       * Declarado en el registro pero sin adaptador escrito. Es distinto de
       * «no configurado»: pegar la clave no lo activaría, porque no hay código
       * que la use. Confundirlos haría que el panel prometiera algo que no pasa.
       */
      readonly estado: 'sin_adaptador';
      readonly proveedor: string;
      readonly requisitos: readonly Requisito[];
      readonly nota: string;
    };

export class ErrorDeInferencia extends Error {
  override readonly name = 'ErrorDeInferencia';
}

/** El proveedor listo para usar, o un error que dice exactamente qué falta. */
export function exigirProveedor(estado: EstadoProveedor): Inferencia {
  if (estado.estado === 'configurado') return estado.inferencia;

  if (estado.estado === 'sin_adaptador') {
    throw new ErrorDeInferencia(
      `El proveedor «${estado.proveedor}» está declarado pero no tiene adaptador escrito. ` +
        `${estado.nota} Poner la clave no lo activaría.`,
    );
  }

  const detalle = estado.requisitos
    .filter((r) => estado.faltan.includes(r.variable))
    .map((r) => `  ✗ ${r.variable}\n      ${r.descripcion}\n      ${r.como_obtenerlo}`)
    .join('\n');

  throw new ErrorDeInferencia(
    `El proveedor «${estado.proveedor}» está declarado pero no configurado.\n` +
      `Faltan ${estado.faltan.length} de ${estado.requisitos.length} requisitos:\n${detalle}`,
  );
}

/** Lo que se imprime al arrancar y lo que leerá el panel de la fase 6. */
export function describirProveedor(estado: EstadoProveedor): string {
  switch (estado.estado) {
    case 'configurado':
      return `  ✓ ${estado.proveedor} — activo (${estado.inferencia.modelo})`;
    case 'sin_adaptador':
      return `  · ${estado.proveedor} — declarado, sin adaptador escrito`;
    case 'no_configurado':
      return `  ✗ ${estado.proveedor} — falta: ${estado.faltan.join(', ')}`;
  }
}
