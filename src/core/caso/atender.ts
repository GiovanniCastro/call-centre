// El ciclo del caso, con todos los guardianes cableados.
//
// Hasta aquí, los nueve vigías y los cinco detectores existían, disparaban y
// estaban probados — pero nadie los llamaba. Esto es lo que los llama, y el
// orden en que lo hace **es** el contenido de este archivo: cada comprobación
// está donde está porque hacerla antes o después cambia lo que protege.
//
//   1. ¿puede operar este contacto?      antes de gastar nada
//   2. detector de secuestro             sobre lo que ENTRA
//   3. vigía de bucle                    abre el caso; corta si se enreda
//   4. clasificar                        determinista
//   5. vigía de perímetro                antes de elegir plano
//   6. vigía de presupuesto              antes de gastar
//   7. recuperar                         fuentes
//   8. vigía de sustento                 observa índice y modelo
//   9. responder                         estructurado y verificado
//  10. fuga y aislamiento                sobre lo que SALE
//  11. escalar o enviar
//  12. emitir el evento                  exactamente uno, siempre
//
// El paso 12 no es opcional ni condicional: el arnés de la fase 0 falla si una
// ruta termina sin emitir, o emitiendo dos veces. Por eso el evento se construye
// en un solo sitio al final y no en cada rama — con un `emitir` por rama, la
// rama que alguien añada mañana se olvidará del suyo.

import type { Emisor } from '../../telemetry/emisor.ts';
import type {
  ClaseSensibilidad,
  ClaseTarea,
  DesvioEjecucion,
  DestinoEjecucion,
  Evento,
  Resultado,
} from '../../telemetry/evento.ts';
import type { FragmentoRecuperado } from '../conocimiento/documento.ts';
import type { Inferencia } from '../inferencia/puerto.ts';
import { clasificar } from '../enrutador/clasificar.ts';
import { decidir as decidirDestino, POLITICA, type Politica } from '../enrutador/politica.ts';
import { restituir, sanear } from '../saneo/sanear.ts';
import { responder, type ClaseDeEscalado } from '../respuesta/responder.ts';
import { RESPUESTA, type ConfigRespuesta } from '../respuesta/componer.ts';
import {
  comprobarAislamiento,
  detectarFuga,
  detectarSecuestro,
} from '../seguridad/detectores.ts';
import type { RespuestaGraduada } from '../seguridad/graduada.ts';
import type { VigiaDeBucle } from '../vigias/bucle.ts';
import type { VigiaDePerimetro } from '../vigias/perimetro.ts';
import type { VigiaDePresupuesto } from '../vigias/presupuesto.ts';
import type { VigiaDeSustento } from '../vigias/sustento.ts';

export type Guardianes = {
  readonly bucle: VigiaDeBucle;
  readonly perimetro: VigiaDePerimetro;
  readonly presupuesto: VigiaDePresupuesto;
  readonly sustento: VigiaDeSustento;
  readonly graduada: RespuestaGraduada;
};

export type EntradaDeCaso = {
  readonly caso_id: string;
  readonly contacto: string;
  readonly canal: Evento['canal'];
  readonly mensaje: string;
  readonly instrucciones: string;
  /** Identificadores de OTROS contactos, para la comprobación de aislamiento. */
  readonly ajenos?: readonly string[];
};

export type Planos = {
  readonly local: Inferencia;
  readonly nube?: Inferencia | undefined;
};

export type Recuperador = (consulta: string) => Promise<readonly FragmentoRecuperado[]>;

export type SalidaDeCaso = {
  readonly resultado: Resultado;
  /** Lo que se envía al cliente. Vacío si el caso no produjo respuesta. */
  readonly texto: string;
  readonly motivo_escalado: string | null;
  readonly clase_escalado: ClaseDeEscalado | 'peticion_bloqueada' | null;
  readonly evento: Evento;
};

export type Dependencias = {
  readonly guardianes: Guardianes;
  readonly planos: Planos;
  readonly recuperar: Recuperador;
  readonly emisor: Emisor;
  readonly politica?: Politica;
  readonly configRespuesta?: ConfigRespuesta;
  readonly mensajeDeContingencia?: string;
};

const CONTINGENCIA =
  'Ahora mismo no puedo darte una respuesta completa. Te paso con una persona del equipo.';

/**
 * Atiende un caso de principio a fin.
 *
 * Emite **exactamente un evento**, pase lo que pase. Quien llama debe envolverlo
 * en `vigilarCaso` para que eso deje de ser una promesa y sea una comprobación.
 */
export async function atender(
  entrada: EntradaDeCaso,
  deps: Dependencias,
): Promise<SalidaDeCaso> {
  const politica = deps.politica ?? POLITICA;
  const inicio = process.hrtime.bigint();
  const { guardianes } = deps;

  // Lo que el evento necesita, se vaya por donde se vaya. Un solo sitio donde se
  // llena y un solo `emitir` al final.
  let clase_tarea: ClaseTarea = 'ambiguo';
  let clase_sensibilidad: ClaseSensibilidad = 'baja';
  let destino_ejecucion: DestinoEjecucion = 'local';
  let desvio_ejecucion: DesvioEjecucion = 'ninguno';
  let motivo_desvio: string | null = null;
  let motivo_decision = 'sin decisión: el caso no llegó al enrutador';
  let fuentes: readonly string[] = [];
  let sustento: Evento['sustento'] = null;
  let tokens_entrada = 0;
  let tokens_salida = 0;
  let modelo: string | null = null;
  let hubo_egreso = false;
  const destinos_egreso: string[] = [];

  const cerrar = (
    resultado: Resultado,
    texto: string,
    motivo_escalado: string | null,
    clase_escalado: SalidaDeCaso['clase_escalado'],
  ): SalidaDeCaso => {
    const evento: Evento = {
      version_esquema: 1,
      evento_id: crypto.randomUUID(),
      caso_id: entrada.caso_id,
      marca_tiempo: new Date().toISOString(),
      canal: entrada.canal,
      clase_tarea,
      clase_sensibilidad,
      destino_ejecucion,
      desvio_ejecucion,
      motivo_desvio,
      resultado,
      motivo_escalado,
      motivo_decision,
      hubo_egreso,
      destinos_egreso,
      fuentes: [...fuentes],
      sustento,
      latencia_ms: Number(process.hrtime.bigint() - inicio) / 1e6,
      tokens_entrada,
      tokens_salida,
      modelo,
      costo: 0,
      costo_provisional: true,
      precios_actualizados: '2026-07-31',
    };

    deps.emisor.emitir(evento);
    return { resultado, texto, motivo_escalado, clase_escalado, evento };
  };

  // ── 1. ¿Puede operar este contacto? ────────────────────────────────────────
  // Lo primero de todo: un contacto en cuarentena no debe consumir ni una
  // clasificación. Comprobarlo después sería pagar el caso para luego tirarlo.
  if (!guardianes.graduada.puedeOperar(entrada.contacto)) {
    motivo_decision = 'el contacto está en cuarentena por la respuesta graduada';
    return cerrar('bloqueado', '', motivo_decision, 'peticion_bloqueada');
  }

  // ── 2. Detector de secuestro, sobre lo que ENTRA ───────────────────────────
  // **No se corta la conversación.** Se registra, se eleva la vigilancia y se
  // sigue atendiendo con normalidad. Cortarle a quien lo intenta le confirma que
  // hay algo que atacar y le dice qué frase lo activó.
  const secuestro = detectarSecuestro(entrada.mensaje);
  for (const hallazgo of secuestro.hallazgos) {
    guardianes.graduada.registrar('secuestro', entrada.contacto, hallazgo.fragmento, hallazgo.patron);
  }

  const caso = guardianes.bucle.vigilar(entrada.caso_id);

  // ── 4. Clasificar ──────────────────────────────────────────────────────────
  const clasificacion = clasificar(entrada.mensaje);
  clase_tarea = clasificacion.clase_tarea;
  clase_sensibilidad = clasificacion.clase_sensibilidad;

  const decision = decidirDestino(clasificacion, politica);
  destino_ejecucion = decision.destino;
  motivo_decision = `${decision.motivo}. ${clasificacion.motivo}`;

  // ── 5. Vigía de perímetro ──────────────────────────────────────────────────
  const perimetro = guardianes.perimetro.puedeSalir(
    clase_sensibilidad,
    decision.destino === 'nube',
  );
  if (perimetro.accion === 'detener') {
    motivo_decision = `${motivo_decision}. ${perimetro.actuacion.explicacion}`;
    return cerrar('bloqueado', '', 'el vigía de perímetro detuvo el caso', 'peticion_bloqueada');
  }

  // ── 6. Vigía de presupuesto ────────────────────────────────────────────────
  const sujetos = { conversacion: entrada.caso_id, contacto: entrada.contacto, hora: 'h', dia: 'd' };
  const presupuesto = guardianes.presupuesto.puedeGastar(sujetos);

  if (presupuesto.accion === 'detener') {
    motivo_decision = `${motivo_decision}. ${presupuesto.actuacion.explicacion}`;
    return cerrar(
      'escalado_humano',
      deps.mensajeDeContingencia ?? CONTINGENCIA,
      'techo de presupuesto alcanzado',
      'fallo_de_ejecucion',
    );
  }

  if (presupuesto.accion === 'degradar' && destino_ejecucion === 'nube') {
    // Degradar NO es un desvío por fallo: es una decisión de política ante el
    // umbral suave. Se anota como desvío igual —el plano cambió— pero con su
    // motivo propio, para que el panel no lo cuente como «el local no alcanzó».
    destino_ejecucion = 'local';
    desvio_ejecucion = 'nube_a_local';
    motivo_desvio = presupuesto.actuacion.explicacion;
  }

  // ── 7. Recuperar ───────────────────────────────────────────────────────────
  if (caso.paso().accion === 'detener') {
    return cerrar('escalado_humano', '', 'el vigía de bucle cortó el caso', 'fallo_de_ejecucion');
  }

  const fragmentos = await deps.recuperar(entrada.mensaje);

  // ── 8. Vigía de sustento ───────────────────────────────────────────────────
  guardianes.sustento.observar({ fragmentos_recuperados: fragmentos.length, sustento: null });

  // ── 9. Responder, con el mensaje SANEADO ───────────────────────────────────
  const saneado = sanear(entrada.mensaje);
  const plano = destino_ejecucion === 'nube' ? deps.planos.nube : deps.planos.local;

  if (plano === undefined) {
    return cerrar(
      'escalado_humano',
      deps.mensajeDeContingencia ?? CONTINGENCIA,
      `no hay adaptador para el plano «${destino_ejecucion}»`,
      'fallo_de_ejecucion',
    );
  }

  if (caso.paso().accion === 'detener') {
    return cerrar('escalado_humano', '', 'el vigía de bucle cortó el caso', 'fallo_de_ejecucion');
  }

  const respondido = await responder(
    {
      clase_tarea,
      instrucciones: entrada.instrucciones,
      mensaje: saneado.texto,
      fragmentos,
    },
    plano,
    deps.configRespuesta ?? RESPUESTA,
  );

  modelo = plano.modelo;
  tokens_entrada = respondido.tokens_entrada;
  tokens_salida = respondido.tokens_salida;
  hubo_egreso = plano.destino === 'nube';
  if (hubo_egreso) destinos_egreso.push('api.anthropic.com');

  if (respondido.veredicto !== null) {
    fuentes = respondido.veredicto.fuentes;
    sustento = respondido.veredicto.sustento;
    // Segunda observación, ahora con el sustento real: es la que permite
    // distinguir «índice roto» de «modelo flojo».
    guardianes.sustento.observar({
      fragmentos_recuperados: fragmentos.length,
      sustento:
        respondido.veredicto.sustento.campos_totales === 0
          ? null
          : respondido.veredicto.sustento.campos_con_procedencia /
            respondido.veredicto.sustento.campos_totales,
    });
  }

  guardianes.presupuesto.apuntar(sujetos, 0);

  if (respondido.decision.accion === 'escalar') {
    return cerrar(
      'escalado_humano',
      '',
      respondido.decision.motivo,
      respondido.clase_escalado ?? 'sin_sustento',
    );
  }

  // ── 10. Fuga y aislamiento, sobre lo que SALE ──────────────────────────────
  // Se comprueba el texto YA RESTITUIDO, que es el que verá el cliente.
  // Comprobar el saneado dejaría pasar una fuga que solo aparece al devolver los
  // valores reales.
  const texto = restituir(respondido.decision.texto, saneado.restitucion);

  const fuga = detectarFuga(texto);
  if (fuga.hay) {
    for (const hallazgo of fuga.hallazgos) {
      guardianes.graduada.registrar('fuga', entrada.contacto, hallazgo.fragmento, hallazgo.patron);
    }
    return cerrar('bloqueado', '', 'la respuesta contenía una fuga', 'peticion_bloqueada');
  }

  const aislamiento = comprobarAislamiento(texto, entrada.ajenos ?? []);
  if (!aislamiento.aislada) {
    for (const ajeno of aislamiento.ajenos) {
      guardianes.graduada.registrar('aislamiento', entrada.contacto, ajeno, 'identificador_ajeno');
    }
    return cerrar(
      'bloqueado',
      '',
      'la respuesta contenía datos de otro contacto',
      'peticion_bloqueada',
    );
  }

  return cerrar('resuelto', texto, null, null);
}
