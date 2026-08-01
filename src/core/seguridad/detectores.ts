// Los detectores de la fase 4C. **La segunda línea, no la primera.**
//
// El principio rector de esta fase es que la contención vence a la detección, y
// por eso las restricciones estructurales bajaron a las fases donde nace el
// código que protegen (R-004): la firma en la 1, la lista blanca y la
// delimitación por procedencia en la 3, el filtro de contacto en el repositorio
// en la 1. Lo que queda aquí es lo que ninguna estructura puede impedir —que
// alguien escriba un texto hostil— y por eso se detecta en vez de prevenirse.
//
// Un detector es, por definición, una lista de cosas que alguien pensó. Nunca
// está completa, y tratarlo como si lo estuviera es el error que convierte una
// segunda línea en una excusa para no tener primera. Todos los de aquí son
// deterministas: ninguno pregunta a un modelo si un texto es hostil, porque
// preguntárselo sería darle el texto hostil.

/** Qué se encontró y dónde. Nunca se agrupa: cada hallazgo es un incidente. */
export type Hallazgo = {
  readonly patron: string;
  readonly fragmento: string;
  readonly posicion: number;
};

export type Deteccion = {
  readonly hay: boolean;
  readonly hallazgos: readonly Hallazgo[];
};

function buscar(texto: string, patrones: readonly [string, RegExp][]): Deteccion {
  const hallazgos: Hallazgo[] = [];

  for (const [nombre, patron] of patrones) {
    const copia = new RegExp(patron.source, patron.flags.includes('g') ? patron.flags : `${patron.flags}g`);
    let coincidencia: RegExpExecArray | null;

    while ((coincidencia = copia.exec(texto)) !== null) {
      hallazgos.push({
        patron: nombre,
        // Se guarda el contexto, no solo la coincidencia: un incidente que dice
        // «patrón de secuestro» sin el texto no permite juzgar si fue un ataque
        // o alguien preguntando cómo funciona el sistema.
        fragmento: texto.slice(Math.max(0, coincidencia.index - 40), coincidencia.index + 120),
        posicion: coincidencia.index,
      });
      if (coincidencia[0] === '') copia.lastIndex += 1;
    }
  }

  return { hay: hallazgos.length > 0, hallazgos };
}

// ── Secuestro ────────────────────────────────────────────────────────────────

/**
 * Patrones de secuestro: texto que ordena ignorar reglas, cambia el rol del
 * agente, pide la configuración del sistema o datos de otro contacto.
 *
 * **La acción no es bloquear la conversación**: es no obedecer, responder con
 * normalidad, registrar el intento íntegro y elevar la vigilancia de ese
 * contacto. Cortarle a quien lo intenta le confirma que hay algo que atacar y le
 * dice exactamente qué frase lo activó — que es la mitad del trabajo hecho.
 */
const SECUESTRO: readonly [string, RegExp][] = [
  ['ignorar_instrucciones', /\b(ignora|olvida|desestima)\s+(las\s+)?(instrucciones|reglas|indicaciones)\s+(anteriores|previas|del sistema)/gi],
  ['ignorar_instrucciones_en', /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions|rules|prompts)/gi],
  ['cambio_de_rol', /\b(a partir de ahora|desde ahora|de ahora en adelante)\s+(eres|serás|actúa como|actua como)/gi],
  ['cambio_de_rol_en', /\byou are (now|no longer)\b|\bact as (a|an)\b|\bpretend (to be|you are)\b/gi],
  ['pide_configuracion', /\b(muestra|revela|dime|imprime|dame)\s+(tu|el|la)\s+(configuración|configuracion|prompt|instrucciones del sistema|system prompt|clave|api key)/gi],
  ['pide_configuracion_en', /\b(show|reveal|print|repeat|output)\s+(me\s+)?(your|the)\s+(system prompt|instructions|configuration|api key)/gi],
  ['pide_datos_de_otro', /\b(datos|información|informacion|póliza|poliza|teléfono|telefono|expediente)\s+(de|del)\s+(otro|otra|los demás|los demas|el último|el ultimo)\s*(cliente|usuario|contacto|persona)?/gi],
  ['modo_desarrollador', /\b(modo|activa)\s+(desarrollador|developer|debug|admin|administrador)\b|\bDAN mode\b/gi],
  ['nota_para_el_asistente', /\b(nota|instrucción|instruccion)\s+(operativa\s+)?(para|al)\s+(el\s+)?(asistente|modelo|agente|sistema)\s+(automático|automatico|ia)?/gi],
  ['no_menciones_esto', /\bno\s+(menciones|reveles|digas)\s+(esta|este|nada de|que has)\b/gi],
];

export function detectarSecuestro(texto: string): Deteccion {
  return buscar(texto, SECUESTRO);
}

// ── Envenenamiento del índice ────────────────────────────────────────────────

/**
 * Envenenamiento: un documento que entra al corpus con instrucciones dentro.
 *
 * Es el mismo repertorio que el secuestro más lo que solo tiene sentido en un
 * documento. Y la diferencia importante está en la acción: un mensaje hostil de
 * un cliente se ignora y se registra; un **documento** hostil no se indexa. La
 * asimetría es deliberada — un mensaje afecta a una conversación, un documento
 * del índice afecta a todas.
 */
const ENVENENAMIENTO: readonly [string, RegExp][] = [
  ...SECUESTRO,
  ['comentario_oculto', /<!--[\s\S]{0,400}?(ignora|ignore|instrucci|instruction|asistente|assistant)[\s\S]{0,400}?-->/gi],
  ['bloque_de_sistema', /<\s*\/?\s*(system|instrucciones_del_sistema|system_prompt)\s*>/gi],
];

export function detectarEnvenenamiento(texto: string): Deteccion {
  return buscar(texto, ENVENENAMIENTO);
}

// ── Fuga en la respuesta ─────────────────────────────────────────────────────

/**
 * Filtro de fuga: nada de configuración, credenciales, rutas internas ni trazas.
 *
 * Se aplica a lo que **sale hacia el cliente**, no a lo que entra. Un secuestro
 * exitoso que no consigue sacar nada no ha conseguido nada, así que este es el
 * último control y el que menos puede fallar. Por eso sus patrones son los más
 * específicos: una clave de API tiene forma reconocible, y una ruta de sistema
 * también.
 */
const FUGA: readonly [string, RegExp][] = [
  ['clave_anthropic', /\bsk-ant-[A-Za-z0-9_-]{10,}/g],
  ['clave_generica', /\bsk-[A-Za-z0-9]{20,}/g],
  ['clave_google', /\bAIza[0-9A-Za-z_-]{30,}/g],
  ['token_portador', /\bBearer\s+[A-Za-z0-9._-]{20,}/g],
  ['cadena_de_conexion', /\b(postgres|postgresql|redis|mongodb):\/\/[^\s]+/gi],
  ['variable_de_entorno', /\b(ANTHROPIC_API_KEY|DATABASE_URL|REDIS_URL|QDRANT_URL|TELEGRAM_BOT_TOKEN|WHATSAPP_TOKEN|[A-Z_]{4,}_(KEY|SECRET|TOKEN|PASSWORD))\b/g],
  ['ruta_interna', /\b(?:[A-Za-z]:\\|\/)(?:src|config|migrations|node_modules|home|etc|var)[\\/][\w.\\/-]+/g],
  ['traza_de_pila', /\n\s+at\s+[\w.<>]+\s*\(/g],
  ['nombre_de_modulo_interno', /\bsrc\/(core|repos|providers|salida|conocimiento|channels)\/[\w./-]+/g],
];

export function detectarFuga(texto: string): Deteccion {
  return buscar(texto, FUGA);
}

// ── Aislamiento entre contactos ──────────────────────────────────────────────

export type ComprobacionDeAislamiento = {
  readonly aislada: boolean;
  readonly ajenos: readonly string[];
};

/**
 * ¿La respuesta contiene datos que no son de este contacto?
 *
 * Es el control **más grave** de los cuatro, y el único que compara contra algo
 * externo al texto. Se le pasa lo que este contacto ha dicho y lo que otros han
 * dicho; si un identificador de otro aparece en la respuesta, se bloquea y se
 * marca como incidente grave.
 *
 * No busca «datos de otro» en abstracto —eso no se puede—: busca literales
 * concretos que pertenecen a otros contactos. Es estrecho a propósito. Un
 * detector amplio aquí bloquearía respuestas legítimas y acabaría desactivado.
 */
export function comprobarAislamiento(
  respuesta: string,
  identificadoresAjenos: readonly string[],
): ComprobacionDeAislamiento {
  const normalizada = respuesta.toLowerCase();
  const ajenos = identificadoresAjenos
    .filter((id) => id.trim().length >= 6)
    .filter((id) => normalizada.includes(id.toLowerCase()));

  return { aislada: ajenos.length === 0, ajenos };
}
