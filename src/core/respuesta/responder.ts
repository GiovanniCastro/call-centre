// La orquestación de la fase 4: pedir estructura, validarla, verificar su
// procedencia, decidir, y reintentar UNA vez antes de escalar.
//
// El reintento no repite la misma petición: le dice al modelo **qué campos
// rechazó el verificador y por qué**. Repetir sin corregir sería tirar un dado
// dos veces; con el motivo delante, un modelo que parafraseó una cifra en vez de
// copiarla suele copiarla a la segunda. Si a la segunda sigue sin poder citar,
// el problema no es la redacción y seguir insistiendo es gastar presupuesto para
// llegar al mismo escalado más tarde.

import type { FragmentoRecuperado } from '../conocimiento/documento.ts';
import type { Inferencia, Muestreo, PeticionInferencia } from '../inferencia/puerto.ts';
import { POLITICA } from '../enrutador/politica.ts';
import type { ClaseTarea } from '../../telemetry/evento.ts';
import { esquemaJson, validarSalida, type SalidaEstructurada } from './esquemas.ts';
import { decidir, RESPUESTA, type ConfigRespuesta, type Decision } from './componer.ts';
import { verificar, type Veredicto } from './verificar.ts';

export type ClaseDeEscalado =
  | 'sin_sustento'
  | 'esquema_invalido'
  | 'modelo_no_puede'
  | 'sin_fuentes'
  | 'fallo_de_ejecucion';

export type Respondido = {
  readonly decision: Decision;
  readonly veredicto: Veredicto | null;
  readonly salida: SalidaEstructurada | null;
  /** Cuántas veces se pidió al modelo. 1 sin reintento, 2 con él. */
  readonly intentos: number;
  /** Presente solo si la decisión fue escalar. */
  readonly clase_escalado: ClaseDeEscalado | null;
  readonly tokens_entrada: number;
  readonly tokens_salida: number;
};

export type EntradaRespuesta = {
  readonly clase_tarea: ClaseTarea;
  readonly instrucciones: string;
  readonly mensaje: string;
  readonly fragmentos: readonly FragmentoRecuperado[];
  readonly maximo_tokens?: number;
  readonly tiempo_maximo_ms?: number;
  /**
   * Cómo se muestrea. Por omisión, lo que diga `config/politica.json`.
   *
   * No es un parámetro del corredor de la fase 7: si el lote pusiera temperatura
   * cero y producción no, el lote mediría un camino que producción no recorre —
   * exactamente el defecto que el propio corredor evita al no tener ruta de
   * código propia. La decisión es del proyecto entero. Ver R-025.
   */
  readonly muestreo?: Muestreo;
};

function peticionBase(entrada: EntradaRespuesta, extra: string): PeticionInferencia {
  return {
    instrucciones: entrada.instrucciones + extra,
    mensaje: entrada.mensaje,
    fragmentos: entrada.fragmentos.map((f) => ({
      fragmento_id: f.fragmento_id,
      titulo: f.titulo,
      seccion: f.seccion,
      texto: f.texto,
    })),
    maximo_tokens: entrada.maximo_tokens ?? 1024,
    tiempo_maximo_ms: entrada.tiempo_maximo_ms ?? 30_000,
    esquema: esquemaJson(entrada.clase_tarea),
    muestreo: entrada.muestreo ?? POLITICA.muestreo,
  };
}

/** Lo que se le añade al modelo en el reintento: qué falló y por qué. */
function correccion(veredicto: Veredicto): string {
  const fallos = veredicto.campos
    .filter((c) => !c.valido)
    .map((c) => `- «${c.campo.valor}» citando ${c.campo.fragmento_id}: ${c.explicacion ?? ''}`)
    .join('\n');

  return (
    '\n\nTu respuesta anterior fue rechazada por el verificador de procedencia:\n' +
    `${fallos}\n\n` +
    'Corrige SOLO eso. Cada valor que afirmes tiene que aparecer copiado literalmente ' +
    'del fragmento que cites, y solo puedes citar fragmentos de los que te he dado. ' +
    'Si un dato no está en ninguno, no lo afirmes: marca `no_puedo_responder`.'
  );
}

export async function responder(
  entrada: EntradaRespuesta,
  inferencia: Inferencia,
  config: ConfigRespuesta = RESPUESTA,
): Promise<Respondido> {
  // Sin fragmentos no hay nada que citar, y el invariante 1 no admite responder.
  // Se corta antes de gastar una llamada: pedirle al modelo que redacte sin
  // fuentes es pedirle que invente.
  const esFactual = ['catalogo', 'extraccion', 'agendamiento'].includes(entrada.clase_tarea);
  if (esFactual && entrada.fragmentos.length === 0) {
    return {
      decision: {
        accion: 'escalar',
        motivo: 'la recuperación no devolvió ningún fragmento para una tarea factual',
        sustento: 0,
        rechazados: [],
      },
      veredicto: null,
      salida: null,
      intentos: 0,
      clase_escalado: 'sin_fuentes',
      tokens_entrada: 0,
      tokens_salida: 0,
    };
  }

  let tokensEntrada = 0;
  let tokensSalida = 0;
  let intentos = 0;
  let extra = '';
  let ultimoVeredicto: Veredicto | null = null;
  let ultimaSalida: SalidaEstructurada | null = null;
  let ultimaClase: ClaseDeEscalado = 'sin_sustento';
  let ultimoMotivo = '';

  const maximoIntentos = config.reintento.activo ? 1 + config.reintento.maximo : 1;

  while (intentos < maximoIntentos) {
    intentos += 1;

    const respuesta = await inferencia.redactar(peticionBase(entrada, extra));
    tokensEntrada += respuesta.tokens_entrada;
    tokensSalida += respuesta.tokens_salida;

    let crudo: unknown;
    try {
      crudo = JSON.parse(respuesta.texto);
    } catch {
      // Un fallo de validación NUNCA llega al usuario y SIEMPRE se registra.
      ultimaClase = 'esquema_invalido';
      ultimoMotivo = 'el modelo no devolvió JSON analizable';
      extra =
        '\n\nTu respuesta anterior no era JSON válido. Devuelve únicamente el objeto ' +
        'JSON del esquema, sin texto alrededor.';
      continue;
    }

    const validada = validarSalida(entrada.clase_tarea, crudo);
    if (!validada.valida) {
      ultimaClase = 'esquema_invalido';
      ultimoMotivo = `la salida no cumple el esquema de «${entrada.clase_tarea}»: ${validada.motivo}`;
      extra = `\n\nTu respuesta anterior no cumplió el esquema:\n${validada.motivo}`;
      continue;
    }

    ultimaSalida = validada.salida;
    const veredicto = verificar(validada.salida, entrada.fragmentos);
    ultimoVeredicto = veredicto;

    const decision = decidir(validada.salida, veredicto, config);

    if (decision.accion !== 'escalar') {
      return {
        decision,
        veredicto,
        salida: validada.salida,
        intentos,
        clase_escalado: null,
        tokens_entrada: tokensEntrada,
        tokens_salida: tokensSalida,
      };
    }

    ultimaClase = validada.salida.no_puedo_responder ? 'modelo_no_puede' : 'sin_sustento';
    ultimoMotivo = decision.motivo;

    // El modelo que declara no poder responder no mejora reintentando: ya dijo
    // que con estas fuentes no llega. Insistir sería no creerle.
    if (validada.salida.no_puedo_responder) break;

    extra = correccion(veredicto);
  }

  return {
    decision: {
      accion: 'escalar',
      motivo: ultimoMotivo,
      sustento: ultimoVeredicto === null ? 0 : ultimoVeredicto.sustento.campos_con_procedencia /
        Math.max(1, ultimoVeredicto.sustento.campos_totales),
      rechazados:
        ultimoVeredicto === null
          ? []
          : ultimoVeredicto.campos
              .filter((c) => !c.valido)
              .map((c) => `${c.campo.fragmento_id}: ${c.explicacion ?? ''}`),
    },
    veredicto: ultimoVeredicto,
    salida: ultimaSalida,
    intentos,
    clase_escalado: ultimaClase,
    tokens_entrada: tokensEntrada,
    tokens_salida: tokensSalida,
  };
}
