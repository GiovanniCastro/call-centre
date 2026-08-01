// El enrutador: de un mensaje a una respuesta, pasando por donde debe.
//
// Junta las piezas en el único orden que las hace ciertas:
//
//   1. clasificar        determinista, sin modelo
//   2. decidir           política declarativa, regla dura primero
//   3. sanear            ANTES de elegir adaptador, no después
//   4. redactar          en el destino que salió
//   5. respaldo          si el local no alcanza, desvío registrado como tal
//   6. restituir         los tokens vuelven a ser datos, ya dentro del perímetro
//
// El punto 3 va donde va por un motivo: si el saneo ocurriera dentro del
// adaptador, un adaptador nuevo podría olvidarlo, y el olvido no se notaría
// hasta que alguien mirara qué salió. Aquí es imposible llegar a un adaptador
// con texto sin sanear.
//
// Y el 5 no es un escalado. Un desvío de local a nube y una escalada a un
// humano son dos hechos distintos, y meterlos en el mismo contador produce dos
// cifras para lo mismo — el defecto que R-002 desdobló antes de escribir el
// primer evento.

import type {
  DesvioEjecucion,
  DestinoEjecucion,
} from '../../telemetry/evento.ts';
import type {
  Inferencia,
  PeticionInferencia,
  RespuestaInferencia,
} from '../inferencia/puerto.ts';
import { restituir, sanear } from '../saneo/sanear.ts';
import type { TipoIdentificador } from '../saneo/patrones.ts';
import { clasificar, type Clasificacion } from './clasificar.ts';
import { decidir, POLITICA, type Politica } from './politica.ts';

export type EntradaEnrutador = {
  readonly mensaje: string;
  readonly instrucciones: string;
  readonly fragmentos: PeticionInferencia['fragmentos'];
  readonly maximo_tokens?: number;
};

export type ResultadoEnrutado = {
  readonly texto: string;
  readonly clasificacion: Clasificacion;
  readonly destino_ejecucion: DestinoEjecucion;
  readonly desvio_ejecucion: DesvioEjecucion;
  readonly motivo_desvio: string | null;
  readonly motivo_decision: string;
  readonly modelo: string;
  readonly tokens_entrada: number;
  readonly tokens_salida: number;
  readonly latencia_ms: number;
  /** Qué tipos se enmascararon. Los valores no salen de aquí. */
  readonly identificadores: Readonly<Partial<Record<TipoIdentificador, number>>>;
};

/** Los adaptadores disponibles, por plano. El núcleo no sabe cuáles son. */
export type Planos = {
  readonly local: Inferencia;
  /** Puede faltar: sin credencial de nube, el sistema funciona solo en local. */
  readonly nube?: Inferencia | undefined;
};

export class SinPlanoDisponible extends Error {
  override readonly name = 'SinPlanoDisponible';
}

function elegir(planos: Planos, destino: DestinoEjecucion): Inferencia {
  const elegido = destino === 'local' ? planos.local : planos.nube;
  if (elegido === undefined) {
    throw new SinPlanoDisponible(
      `La política enruta a «${destino}» y no hay adaptador para ese plano. ` +
        'Ejecuta `npm run maquina` para ver qué proveedor falta y qué le falta a él.',
    );
  }
  return elegido;
}

export async function enrutar(
  entrada: EntradaEnrutador,
  planos: Planos,
  politica: Politica = POLITICA,
): Promise<ResultadoEnrutado> {
  const clasificacion = clasificar(entrada.mensaje);
  const decision = decidir(clasificacion, politica);

  // Se sanea SIEMPRE, vaya donde vaya. Enmascarar solo cuando el destino es la
  // nube dejaría el registro local con los datos en claro y, peor, haría que el
  // saneo dependiera de una decisión que puede cambiar en un JSON.
  const saneado = sanear(entrada.mensaje);

  const peticion: PeticionInferencia = {
    instrucciones: entrada.instrucciones,
    mensaje: saneado.texto,
    fragmentos: entrada.fragmentos,
    maximo_tokens: entrada.maximo_tokens ?? 1024,
    tiempo_maximo_ms: politica.respaldo.tiempo_maximo_ms,
  };

  const primero = elegir(planos, decision.destino);

  let respuesta: RespuestaInferencia;
  let destino_ejecucion = decision.destino;
  let desvio_ejecucion: DesvioEjecucion = 'ninguno';
  let motivo_desvio: string | null = null;

  try {
    respuesta = await primero.redactar(peticion);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);

    // La regla dura no admite respaldo: un caso retenido no puede acabar en la
    // nube porque el local haya fallado. Si el local no puede, el caso escala a
    // un humano — que es una decisión de la fase 4, no un desvío.
    if (!decision.admite_respaldo) throw error;

    const alternativo = elegir(planos, politica.respaldo.a);
    respuesta = await alternativo.redactar(peticion);

    destino_ejecucion = politica.respaldo.a;
    desvio_ejecucion =
      politica.respaldo.de === 'local' ? 'local_a_nube' : 'nube_a_local';
    motivo_desvio = `el plano «${politica.respaldo.de}» no alcanzó: ${motivo}`;
  }

  return {
    // La restitución ocurre aquí, ya dentro del perímetro. Lo que viajó fuera
    // llevaba tokens; lo que ve el cliente, sus datos.
    texto: restituir(respuesta.texto, saneado.restitucion),
    clasificacion,
    destino_ejecucion,
    desvio_ejecucion,
    motivo_desvio,
    motivo_decision: `${decision.motivo}. ${clasificacion.motivo}`,
    modelo: respuesta.modelo,
    tokens_entrada: respuesta.tokens_entrada,
    tokens_salida: respuesta.tokens_salida,
    latencia_ms: respuesta.latencia_ms,
    identificadores: saneado.recuento,
  };
}
