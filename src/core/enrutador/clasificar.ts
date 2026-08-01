// Clasificación determinista de tarea y de sensibilidad.
//
// **El modelo no clasifica.** Es la regla 6 del preámbulo al pie de la letra:
// clasificar, enrutar, validar y calcular ocurren en código auditable; el modelo
// redacta. Y hay una razón concreta más allá del principio: la clasificación de
// sensibilidad es lo que decide si un texto sale del perímetro. Pedirle esa
// decisión a un modelo significaría enviar el texto para saber si se puede
// enviar el texto.
//
// Ninguna regla es una heurística de confianza: cada una es una lista de
// marcadores, se aplican en orden y la primera que casa gana. El orden es la
// decisión de diseño de este archivo y está justificado abajo, marcador a
// marcador.

import type { ClaseSensibilidad, ClaseTarea } from '../../telemetry/evento.ts';
import { detectar, SENSIBILIDAD_POR_TIPO, type TipoIdentificador } from '../saneo/patrones.ts';

export type Clasificacion = {
  readonly clase_tarea: ClaseTarea;
  readonly clase_sensibilidad: ClaseSensibilidad;
  /** Legible por una persona. Va al campo `motivo_decision` del evento. */
  readonly motivo: string;
  /** Qué tipos se encontraron. Los valores no salen de aquí. */
  readonly identificadores: readonly TipoIdentificador[];
};

const SALUDOS = [
  'hola',
  'buenas',
  'buenos días',
  'buenas tardes',
  'buenas noches',
  'qué tal',
  'que tal',
  'gracias',
  'adiós',
  'adios',
  'hasta luego',
];

type Regla = {
  readonly clase: ClaseTarea;
  readonly marcadores: readonly string[];
  readonly porque: string;
};

/**
 * El orden es el contenido de la regla, no un detalle de implementación.
 *
 * **La queja va primero** porque un cliente enfadado casi siempre menciona
 * también el producto, el precio o su cita: «llevo tres semanas esperando el
 * pago de mi siniestro de auto» casa con catálogo y con agendamiento, y
 * tratarlo como una consulta de catálogo es responderle con una tarifa a quien
 * está protestando. **El saludo va el último de los específicos** por lo
 * contrario: «hola, quiero cancelar» es una cancelación con cortesía delante, y
 * clasificarla como saludo perdería el caso entero.
 */
const REGLAS: readonly Regla[] = [
  {
    clase: 'queja',
    marcadores: [
      'queja',
      'reclamación',
      'reclamacion',
      'protesta',
      'inaceptable',
      'llevo esperando',
      'llevo tres',
      'no me han',
      'nadie me',
      'me habéis',
      'me habeis',
      'estoy harto',
      'estoy harta',
      'indignado',
      'indignada',
      'denuncia',
      'no funciona',
      'sigo sin',
    ],
    porque: 'el mensaje expresa insatisfacción, y eso manda sobre lo demás que mencione',
  },
  {
    clase: 'agendamiento',
    marcadores: [
      'cita',
      'agendar',
      'agenda',
      'reservar',
      'peritaje',
      'peritación',
      'peritacion',
      'visita',
      'inspección',
      'inspeccion',
      'disponibilidad',
      'qué día',
      'que dia',
      'a qué hora',
      'a que hora',
    ],
    porque: 'pide o mueve una cita, que es una acción con calendario detrás',
  },
  {
    clase: 'extraccion',
    marcadores: [
      'mis datos',
      'te paso',
      'os paso',
      'apunta',
      'apunte',
      'mi número',
      'mi numero',
      'mi correo',
      'mi póliza',
      'mi poliza',
      'me llamo',
      'soy ',
      'quiero contratar',
      'dar de alta',
      'presentar un siniestro',
      'abrir un siniestro',
      'reclamar el',
    ],
    porque: 'el cliente aporta datos suyos o inicia un trámite que los requiere',
  },
  {
    clase: 'catalogo',
    marcadores: [
      'cuánto cuesta',
      'cuanto cuesta',
      'precio',
      'tarifa',
      'cubre',
      'cubrís',
      'cubris',
      'cobertura',
      'incluye',
      'deducible',
      'franquicia',
      'exclusión',
      'exclusion',
      'qué es',
      'que es',
      'aseguráis',
      'asegurais',
      'tenéis',
      'teneis',
      'ofrecéis',
      'ofreceis',
      'condiciones',
      'requisitos',
    ],
    porque: 'pregunta por lo que la empresa ofrece o por sus condiciones',
  },
];

/** Palabras de salud: entran en el cuestionario de vida y son datos sensibles. */
const MARCADORES_DE_SALUD = [
  'diagnóstico',
  'diagnostico',
  'enfermedad',
  'tratamiento médico',
  'tratamiento medico',
  'medicación',
  'medicacion',
  'cáncer',
  'cancer',
  'diabetes',
  'historial médico',
  'historial medico',
  'fumador',
  'psiquiátr',
  'psiquiatr',
];

function esSoloSaludo(normalizado: string): boolean {
  // Corto **y** compuesto de fórmulas de cortesía. Solo la longitud dejaría
  // pasar «cancelad mi póliza» como saludo por ser breve.
  if (normalizado.length > 40) return false;
  return SALUDOS.some((s) => normalizado.includes(s));
}

export function clasificarTarea(texto: string): { clase: ClaseTarea; porque: string } {
  const normalizado = texto.toLowerCase().trim();

  if (normalizado === '') {
    return { clase: 'ambiguo', porque: 'el mensaje no tiene contenido que clasificar' };
  }

  for (const regla of REGLAS) {
    const marcador = regla.marcadores.find((m) => normalizado.includes(m));
    if (marcador !== undefined) {
      return { clase: regla.clase, porque: `${regla.porque} (marcador: «${marcador.trim()}»)` };
    }
  }

  if (esSoloSaludo(normalizado)) {
    return { clase: 'saludo', porque: 'mensaje breve de cortesía, sin petición dentro' };
  }

  // `ambiguo` no es un fallo del clasificador: es el clasificador diciendo que
  // no lo sabe, que es información. La política puede decidir escalarlo en lugar
  // de tratarlo como una consulta cualquiera.
  return { clase: 'ambiguo', porque: 'ningún marcador de tarea casó con el mensaje' };
}

export function clasificarSensibilidad(texto: string): {
  clase: ClaseSensibilidad;
  porque: string;
  identificadores: readonly TipoIdentificador[];
} {
  const hallazgos = detectar(texto);
  const tipos = [...new Set(hallazgos.map((h) => h.tipo))];

  const salud = MARCADORES_DE_SALUD.find((m) => texto.toLowerCase().includes(m));
  if (salud !== undefined) {
    return {
      clase: 'alta',
      porque: `el mensaje menciona información de salud («${salud}»), que en el ramo de vida es dato de suscripción`,
      identificadores: tipos,
    };
  }

  const altos = tipos.filter((t) => SENSIBILIDAD_POR_TIPO[t] === 'alta');
  if (altos.length > 0) {
    return {
      clase: 'alta',
      porque: `el mensaje contiene ${altos.join(', ')}, que identifican a la persona ante un tercero`,
      identificadores: tipos,
    };
  }

  if (tipos.length > 0) {
    return {
      clase: 'media',
      porque: `el mensaje contiene datos personales (${tipos.join(', ')}) pero ninguno de los que no salen del perímetro`,
      identificadores: tipos,
    };
  }

  return { clase: 'baja', porque: 'no se detectó ningún identificador', identificadores: [] };
}

export function clasificar(texto: string): Clasificacion {
  const tarea = clasificarTarea(texto);
  const sensibilidad = clasificarSensibilidad(texto);

  return {
    clase_tarea: tarea.clase,
    clase_sensibilidad: sensibilidad.clase,
    identificadores: sensibilidad.identificadores,
    motivo: `tarea «${tarea.clase}»: ${tarea.porque}. Sensibilidad «${sensibilidad.clase}»: ${sensibilidad.porque}`,
  };
}
