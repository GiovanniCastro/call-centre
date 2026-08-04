// Los secretos de producción: qué hay, qué falta y cómo no se imprimen nunca.
//
// La fase 8 pide «secretos en producción fuera del repositorio y fuera del
// informe de salud». Lo primero ya lo sostienen `.gitignore` y `gitleaks` desde
// la fase 0. Lo segundo no lo sostenía nadie: hasta ahora, cualquier módulo que
// quisiera explicar un fallo de conexión podía escribir la URL de PostgreSQL
// entera —con su contraseña— en la consola, y nada lo detenía.
//
// Este módulo hace tres cosas, y la tercera es la que importa:
//
//   1. **Declara** cada secreto: de qué es, qué deja de funcionar sin él y cómo
//      se obtiene. La declaración es el mismo mecanismo que usan los canales
//      desde la fase 1 — un requisito que el sistema sabe enunciar vale más que
//      un párrafo en un README que nadie vuelve a leer.
//   2. **Informa** de cuáles están puestos y cuáles faltan, sin decir su valor.
//   3. **Redacta** cualquier texto que vaya a salir del proceso, en dos capas:
//      por valor —todo lo que coincida con un secreto del entorno— y por forma
//      —lo que tenga pinta de credencial aunque no esté declarado—.
//
// Las dos capas de la redacción hacen falta y ninguna sobra. La de valor no
// puede cubrir un secreto que este proceso no tiene en el entorno pero que
// aparece en un mensaje del proveedor; la de forma no puede cubrir una
// contraseña que no se parece a nada. Juntas, lo que se escapa de una lo tapa la
// otra.

/** De qué componente es un secreto, para agrupar el parte de arranque. */
export type Componente = 'perimetro' | 'telegram' | 'whatsapp' | 'nube' | 'proyeccion';

export type Secreto = {
  readonly variable: string;
  readonly componente: Componente;
  /** Qué deja de funcionar si falta. Nunca «es obligatorio»: qué se pierde. */
  readonly sin_el: string;
  /** Cómo se consigue. Un requisito que no dice de dónde sale no es accionable. */
  readonly de_donde_sale: string;
  /**
   * Si el valor viaja dentro de una URL.
   *
   * Cambia cómo se redacta: de `postgres://u:clave@host/db` hay que tapar la
   * contraseña y **conservar el host**, porque el host es justo lo que hace falta
   * para diagnosticar y no es el secreto.
   */
  readonly es_url: boolean;
};

/**
 * Todo lo que este sistema considera secreto.
 *
 * La lista no se mantiene a mano y con buena voluntad: `tests/secretos.test.ts`
 * recorre el árbol sintáctico de `src/`, `proyeccion/` y `lote/` buscando
 * lecturas de `process.env` con nombre de credencial, y **falla si alguna no está
 * declarada aquí**. Añadir una variable secreta nueva sin registrarla rompe el
 * CI, que es la única forma de que esta lista siga siendo cierta dentro de seis
 * meses.
 */
export const SECRETOS: readonly Secreto[] = [
  {
    variable: 'DATABASE_URL',
    componente: 'perimetro',
    sin_el: 'no se guardan conversaciones ni telemetría; el sistema arranca y lo avisa',
    de_donde_sale: 'docker-compose.yml en local; el gestor de secretos del anfitrión en producción',
    es_url: true,
  },
  {
    variable: 'REDIS_URL',
    componente: 'perimetro',
    sin_el: 'el borde usa el almacén en memoria y la cola se pierde al reiniciar',
    de_donde_sale: 'docker-compose.yml en local; el gestor de secretos del anfitrión en producción',
    es_url: true,
  },
  {
    variable: 'QDRANT_URL',
    componente: 'perimetro',
    sin_el: 'no hay recuperación: sin fuente no hay respuesta, así que todo escala',
    de_donde_sale: 'docker-compose.yml en local; el gestor de secretos del anfitrión en producción',
    es_url: true,
  },
  {
    variable: 'TELEGRAM_BOT_TOKEN',
    componente: 'telegram',
    sin_el: 'el canal primario queda declarado y sin configurar',
    de_donde_sale: '@BotFather en Telegram, orden /newbot',
    es_url: false,
  },
  {
    variable: 'TELEGRAM_WEBHOOK_SECRET',
    componente: 'telegram',
    sin_el: 'el webhook no puede distinguir a Telegram de cualquiera que conozca la URL',
    de_donde_sale: 'lo eliges tú: `openssl rand -hex 32`, y lo registras con setWebhook',
    es_url: false,
  },
  {
    variable: 'WHATSAPP_TOKEN',
    componente: 'whatsapp',
    sin_el: 'el conector de WhatsApp sigue como no_configurado (R-020)',
    de_donde_sale: 'token de usuario del sistema en developers.facebook.com',
    es_url: false,
  },
  {
    variable: 'WHATSAPP_SECRETO_APP',
    componente: 'whatsapp',
    sin_el: 'no se puede verificar la firma HMAC de las entradas de Meta',
    de_donde_sale: 'tu aplicación → Configuración → Básica → clave secreta',
    es_url: false,
  },
  {
    variable: 'WHATSAPP_TOKEN_VERIFICACION',
    componente: 'whatsapp',
    sin_el: 'Meta no puede dar de alta el webhook',
    de_donde_sale: 'lo eliges tú y lo escribes también en el formulario de Meta',
    es_url: false,
  },
  {
    variable: 'ANTHROPIC_API_KEY',
    componente: 'nube',
    sin_el: 'el plano de nube queda sin configurar y el sistema conversa solo en local',
    de_donde_sale: 'console.anthropic.com → API keys',
    es_url: false,
  },
  {
    variable: 'EMBEDDINGS_NUBE_CLAVE',
    componente: 'nube',
    sin_el: 'los embeddings se generan en local por Ollama, que es lo que hacen hoy',
    de_donde_sale:
      'del panel del proveedor de embeddings, que sigue sin elegir — Anthropic no ofrece ' +
      'embeddings, así que sería un proveedor distinto al de la inferencia',
    es_url: false,
  },
  {
    variable: 'GOOGLE_APPLICATION_CREDENTIALS',
    componente: 'proyeccion',
    sin_el: 'el publicador escribe la proyección en archivos en vez de en Firestore',
    de_donde_sale:
      'consola de Firebase → Configuración del proyecto → Cuentas de servicio → generar clave privada. ' +
      'Es la ruta a un archivo, y ese archivo NO va al repositorio (.gitignore lo cubre)',
    es_url: false,
  },
];

/** Lo que se pone en lugar de un secreto. Longitud fija: ni siquiera se filtra cuánto medía. */
const TAPADO = '●●●●●●';

/**
 * Formas que delatan una credencial aunque no esté declarada.
 *
 * Segunda capa de la redacción. Cubre el caso que la primera no puede cubrir: un
 * secreto que este proceso no tiene en su entorno —el de otro despliegue, el que
 * viene dentro del mensaje de error de un proveedor, el que alguien pegó en un
 * caso de prueba— y que por tanto no está entre los valores a buscar.
 *
 * El orden importa: la contraseña dentro de una URL se tapa antes que nada, para
 * que el host sobreviva. Un mensaje que dice «no se pudo conectar a ●●●» no
 * ayuda a nadie a arreglar nada.
 */
const FORMAS: readonly { readonly nombre: string; readonly patron: RegExp; readonly con: string }[] = [
  {
    nombre: 'contraseña en URL de conexión',
    // El host se conserva a propósito: es lo que hace falta para diagnosticar.
    patron: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):[^\s@/]+@/gi,
    con: `$1:${TAPADO}@`,
  },
  {
    nombre: 'clave de API de Anthropic',
    patron: /\bsk-ant-[A-Za-z0-9_-]{10,}/g,
    con: TAPADO,
  },
  {
    nombre: 'token de bot de Telegram',
    // `123456789:AA...` — el identificador del bot es público; el que sigue no.
    patron: /\b(\d{6,12}):[A-Za-z0-9_-]{30,}/g,
    con: `$1:${TAPADO}`,
  },
  {
    nombre: 'clave privada en PEM',
    patron: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    con: `-----BEGIN PRIVATE KEY-----${TAPADO}-----END PRIVATE KEY-----`,
  },
];

/**
 * Los valores que hay que tapar por coincidencia exacta.
 *
 * Se ordenan de más largo a más corto porque los secretos se solapan: si
 * `DATABASE_URL` contiene la contraseña y también se declarara la contraseña
 * suelta, tapar primero la corta dejaría la URL medio redactada y reconocible.
 */
function valoresATapar(entorno: Readonly<Record<string, string | undefined>>): readonly string[] {
  const valores: string[] = [];

  for (const secreto of SECRETOS) {
    const valor = entorno[secreto.variable];
    if (valor === undefined || valor.trim() === '') continue;

    if (secreto.es_url) {
      // De una URL solo es secreta la contraseña. Se extrae para taparla sola y
      // dejar el host en pie; si no se puede analizar, se tapa la URL entera —
      // fallar hacia el lado seguro no cuesta nada aquí.
      try {
        const url = new URL(valor);
        if (url.password !== '') valores.push(url.password);
      } catch {
        valores.push(valor);
      }
      continue;
    }

    valores.push(valor);
  }

  // Los valores muy cortos no se tapan por coincidencia: `PUERTO=8787` haría que
  // toda aparición de «8787» —incluido un número de línea— saliera tapada, y un
  // texto lleno de ●●● es tan inútil como uno que filtra.
  return [...new Set(valores.filter((v) => v.length >= 8))].sort((a, b) => b.length - a.length);
}

/** Escapa un valor para meterlo en una expresión regular sin que sus símbolos actúen. */
function comoLiteral(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Quita de un texto todo lo que sea —o parezca— una credencial.
 *
 * Se aplica a cualquier cosa que salga del proceso: consola, mensajes de error,
 * el parte de arranque, el informe de la fase 9 y las órdenes que este módulo
 * imprime antes de ejecutarlas.
 *
 * @param entorno Se pasa en lugar de leerse de dentro para que la prueba pueda
 *   ejercitarlo con valores inventados sin tocar el entorno del proceso.
 */
export function redactar(
  texto: string,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): string {
  let resultado = texto;

  // Capa 1 — por valor. Va primero: es exacta, y lo que tapa deja de estar.
  for (const valor of valoresATapar(entorno)) {
    resultado = resultado.replaceAll(new RegExp(comoLiteral(valor), 'g'), TAPADO);
  }

  // Capa 2 — por forma. Lo que la primera no podía conocer.
  for (const forma of FORMAS) {
    resultado = resultado.replace(forma.patron, forma.con);
  }

  return resultado;
}

export type EstadoDeSecreto = {
  readonly secreto: Secreto;
  readonly puesto: boolean;
};

/** Qué secretos hay puestos y cuáles no. Nunca sus valores. */
export function estadoDeSecretos(
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): readonly EstadoDeSecreto[] {
  return SECRETOS.map((secreto) => ({
    secreto,
    puesto: (entorno[secreto.variable] ?? '').trim() !== '',
  }));
}

/**
 * El parte de secretos que se imprime al arrancar.
 *
 * Mismo criterio que el parte de canales de la fase 1: lo que falta se dice, con
 * qué se pierde por faltar y de dónde sale. Un secreto ausente no impide
 * arrancar —eso dejaría el sistema rehén de un trámite ajeno— pero tampoco pasa
 * callado, porque entonces el fallo se descubre con el primer mensaje de un
 * cliente real.
 */
export function parteDeSecretos(
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const estado = estadoDeSecretos(entorno);
  const puestos = estado.filter((e) => e.puesto);
  const faltan = estado.filter((e) => !e.puesto);

  const lineas: string[] = [
    '',
    `Secretos: ${puestos.length} puesto(s), ${faltan.length} sin poner.`,
  ];

  if (puestos.length > 0) {
    lineas.push(`  puestos: ${puestos.map((e) => e.secreto.variable).join(', ')}`);
  }

  for (const { secreto } of faltan) {
    lineas.push(`  ✗ ${secreto.variable} (${secreto.componente}) — sin él, ${secreto.sin_el}`);
    lineas.push(`      de dónde sale: ${secreto.de_donde_sale}`);
  }

  lineas.push('');

  // El parte se redacta también. No debería tener nada que tapar —solo nombres de
  // variable— y precisamente por eso: el día que alguien añada un valor a este
  // texto, la redacción ya está puesta y no depende de que se acuerde.
  return redactar(lineas.join('\n'), entorno);
}
