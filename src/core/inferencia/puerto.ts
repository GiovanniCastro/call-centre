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
  /**
   * Esquema JSON al que debe ajustarse la respuesta.
   *
   * Va en la petición y no en un método aparte para que **ningún adaptador pueda
   * no soportarlo**: si fuera opcional a nivel de interfaz, un proveedor sin
   * salida estructurada devolvería prosa y el verificador de procedencia de la
   * fase 4 se quedaría sin nada que verificar — que es tanto como no tenerlo.
   * Presente, el adaptador la exige a su proveedor; ausente, redacta libre.
   */
  readonly esquema?: Record<string, unknown> | undefined;
  /**
   * Cómo se muestrea la respuesta. Declarada aquí y traducida por cada adaptador
   * al parámetro de su proveedor — invariante 4: el núcleo dice qué quiere, no
   * cómo se llama en la API de nadie.
   *
   * Existe porque el lote de la fase 7 dio 51 % y 43 % de acierto en dos corridas
   * de la MISMA carga contra el MISMO modelo (R-025). Ollama muestrea a
   * temperatura 0.8 por defecto, y con esa varianza la comparación local-contra-
   * nube que justifica el proyecto entero no compara despliegues: compara ruido.
   *
   * Y hay una razón anterior a la medición. Este agente se vende por auditable:
   * una traza que no se puede reproducir no se puede auditar, y la misma pregunta
   * respondida distinto dos veces no tiene explicación que dar al cliente.
   */
  readonly muestreo?: Muestreo | undefined;
};

export type Muestreo = {
  /** 0 es determinista. Es el valor por omisión del proyecto. */
  readonly temperatura: number;
  /**
   * Semilla, para los proveedores que la admiten.
   *
   * Ollama sí; la API de Anthropic no la expone. Un adaptador que no pueda
   * honrarla la ignora — y por eso la temperatura es lo que sostiene la
   * propiedad, no la semilla.
   */
  readonly semilla?: number | undefined;
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
