// El borde. Lo primero que toca una petición que viene de internet.
//
// El orden de este archivo **es** la regla de seguridad, y no es negociable:
//
//   1. límite de tasa por origen — antes de gastar nada en la petición
//   2. techo de tamaño           — antes de leer el cuerpo entero en memoria
//   3. verificar credencial      — sobre el cuerpo crudo, antes de analizarlo
//   4. analizar y normalizar
//   5. rechazo de repetición     — por mensaje, atómico
//   6. límite de tasa por contacto
//   7. agrupar
//
// Invertir 3 y 4 sería lo cómodo —analizar el JSON primero da mejores mensajes de
// error— y sería un fallo: significaría ejecutar el analizador sobre carga de
// cualquiera. Invertir 2 y 3 permitiría que una petición de un gigabyte agotara la
// memoria antes de que a nadie le importara si venía firmada.
//
// El borde no conoce ningún canal concreto: pide al registro el canal de la ruta y
// le delega la verificación y la normalización.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { ErrorDeCanal } from '../core/canal.ts';
import { claveDeGrupo, type AlmacenDeBorde } from './almacen.ts';
import { LIMITES, type Limites } from './limites.ts';
import type { NombreCanal } from '../core/canal.ts';
import type { RegistroDeCanales } from '../core/registro-canales.ts';

export type ResultadoBorde = {
  readonly estado: number;
  readonly cuerpo: string;
  /** Por qué se rechazó, cuando se rechazó. Para el registro, no para la respuesta. */
  readonly motivo?: string;
  readonly aceptados?: number;
  readonly repetidos?: number;
  readonly limitados?: number;
};

export type Opciones = {
  readonly registro: RegistroDeCanales;
  readonly almacen: AlmacenDeBorde;
  readonly limites?: Limites;
  /** Se inyecta para que las pruebas controlen el tiempo. */
  readonly ahora?: () => number;
  /** Se inyecta para que las pruebas no dependan de la consola. */
  readonly registrar?: (linea: string) => void;
};

export class ErrorDeTamano extends Error {
  override readonly name = 'ErrorDeTamano';
}

/**
 * Lee el cuerpo abortando en cuanto se pasa del techo.
 *
 * Cuenta **bytes**, no caracteres: un carácter fuera de ASCII ocupa entre dos y
 * cuatro, así que contar caracteres dejaría pasar hasta cuatro veces el techo.
 */
export async function leerCuerpo(
  peticion: IncomingMessage,
  techo = LIMITES.techo_cuerpo_bytes,
): Promise<string> {
  const declarado = peticion.headers['content-length'];
  if (declarado !== undefined && Number(declarado) > techo) {
    throw new ErrorDeTamano(`el cuerpo declara ${declarado} bytes; el techo es ${techo}`);
  }

  const trozos: Buffer[] = [];
  let acumulado = 0;

  for await (const trozo of peticion) {
    const buffer = Buffer.isBuffer(trozo) ? trozo : Buffer.from(String(trozo));
    acumulado += buffer.byteLength;

    // Se comprueba en cada trozo y no al final: un emisor que miente en
    // `content-length` no puede llenar la memoria antes de que le paremos.
    if (acumulado > techo) {
      throw new ErrorDeTamano(`el cuerpo supera los ${techo} bytes`);
    }
    trozos.push(buffer);
  }

  return Buffer.concat(trozos).toString('utf8');
}

/**
 * El camino de una entrega, sin nada de HTTP.
 *
 * Se separa del servidor a propósito: así las pruebas ejercitan el orden real de
 * las comprobaciones sin levantar un puerto, y el orden es lo que hay que probar.
 */
export async function procesarEntrega(
  opciones: Opciones,
  nombreCanal: NombreCanal,
  cabeceras: Readonly<Record<string, string | undefined>>,
  cuerpoCrudo: string,
): Promise<ResultadoBorde> {
  const limites = opciones.limites ?? LIMITES;
  const ahora = (opciones.ahora ?? Date.now)();

  let canal;
  try {
    canal = opciones.registro.obtener(nombreCanal);
  } catch (error) {
    if (error instanceof ErrorDeCanal) {
      // 503 y no 404: el canal existe en el plan, lo que no existe son sus
      // credenciales. Un 404 diría que la ruta está mal, y mandaría a quien lo
      // lea a buscar el problema donde no está.
      return { estado: 503, cuerpo: 'canal no configurado', motivo: error.message };
    }
    throw error;
  }

  // ── Verificación ANTES de analizar. No mover. ────────────────────────────
  const verificacion = canal.verificarCredencial({ cabeceras, cuerpoCrudo });
  if (!verificacion.valida) {
    return { estado: 401, cuerpo: 'no autorizado', motivo: verificacion.motivo };
  }

  let carga: unknown;
  try {
    carga = JSON.parse(cuerpoCrudo);
  } catch {
    // La credencial era válida, así que esto no es un atacante: es el proveedor
    // enviando algo que no esperábamos. Se responde 200 para que no reintente en
    // bucle, y queda registrado.
    return { estado: 200, cuerpo: 'ok', motivo: 'cuerpo no es JSON válido', aceptados: 0 };
  }

  const mensajes = canal.normalizar(carga);

  let aceptados = 0;
  let repetidos = 0;
  let limitados = 0;

  for (const mensaje of mensajes) {
    // Repetición primero: un mensaje repetido no debe consumir cuota de tasa,
    // porque entonces un reintento del proveedor acercaría al cliente a su límite.
    const esNuevo = await opciones.almacen.marcarVistoSiNuevo(
      mensaje.id_externo,
      limites.repeticion.ttl_segundos,
    );
    if (!esNuevo) {
      repetidos += 1;
      continue;
    }

    const clave = claveDeGrupo(mensaje);
    const enVentana = await opciones.almacen.registrarYContar(
      `contacto:${clave}`,
      limites.tasa_por_contacto.ventana_ms,
      ahora,
    );

    if (enVentana > limites.tasa_por_contacto.maximo) {
      // Se descarta en silencio: responder «has superado el límite» le diría al
      // emisor exactamente dónde está el techo, que es la información que
      // necesita para quedarse justo por debajo.
      limitados += 1;
      continue;
    }

    await opciones.almacen.anadirAlGrupo(
      clave,
      mensaje,
      limites.agrupacion.ventana_ms,
      ahora,
    );
    aceptados += 1;
  }

  // 200 inmediato: Telegram y WhatsApp reintentan la entrega si el webhook tarda,
  // y un reintento es un mensaje duplicado. El trabajo va en la cola.
  return { estado: 200, cuerpo: 'ok', aceptados, repetidos, limitados };
}

const RUTAS_WEBHOOK: Readonly<Record<string, NombreCanal>> = {
  '/webhook/telegram': 'telegram',
  '/webhook/whatsapp': 'whatsapp',
};

const INDICE = `Perímetro — borde

  GET  /salud                 estado del proceso
  GET  /canales               qué canales hay y qué les falta
  POST /webhook/telegram      entrega de Telegram  (cabecera X-Telegram-Bot-Api-Secret-Token)
  POST /webhook/whatsapp      entrega de WhatsApp  (cabecera X-Hub-Signature-256)

Esto es el perímetro, no el panel. El panel es la fase 6.
Nada de aquí responde todavía a un usuario: el enrutador y el modelo son la fase 3.
`;

export function crearServidor(opciones: Opciones): Server {
  const registrar = opciones.registrar ?? ((linea: string) => console.warn(linea));
  const limites = opciones.limites ?? LIMITES;
  const relojDe = opciones.ahora ?? Date.now;

  return createServer((peticion: IncomingMessage, respuesta: ServerResponse) => {
    void (async () => {
      const url = new URL(peticion.url ?? '/', 'http://localhost');
      const ruta = url.pathname;

      if (peticion.method === 'GET' && (ruta === '/' || ruta === '/index.html')) {
        return responder(respuesta, 200, INDICE);
      }

      if (peticion.method === 'GET' && ruta === '/salud') {
        return responder(respuesta, 200, 'ok');
      }

      if (peticion.method === 'GET' && ruta === '/canales') {
        const estados = opciones.registro.listar().map((e) => ({
          canal: e.nombre,
          estado: e.estado,
          faltan: e.estado === 'no_configurado' ? e.faltan : [],
        }));
        return responder(
          respuesta,
          200,
          JSON.stringify({ canales: estados }, null, 2),
          'application/json',
        );
      }

      const canal = RUTAS_WEBHOOK[ruta];
      if (canal === undefined || peticion.method !== 'POST') {
        return responder(respuesta, 404, 'no encontrado');
      }

      // ── Caudal por origen, antes de gastar nada en la petición. ───────────
      const origen = peticion.socket.remoteAddress ?? 'desconocido';
      const desdeOrigen = await opciones.almacen.registrarYContar(
        `origen:${origen}`,
        limites.tasa_por_origen.ventana_ms,
        relojDe(),
      );

      if (desdeOrigen > limites.tasa_por_origen.maximo) {
        registrar(`[borde] ${ruta} → 429: ${origen} superó el techo por origen`);
        return responder(respuesta, 429, 'demasiadas peticiones');
      }

      let cuerpoCrudo: string;
      try {
        cuerpoCrudo = await leerCuerpo(peticion, limites.techo_cuerpo_bytes);
      } catch (error) {
        if (error instanceof ErrorDeTamano) {
          registrar(`[borde] rechazado por tamaño en ${ruta}: ${error.message}`);
          return responder(respuesta, 413, 'cuerpo demasiado grande');
        }
        throw error;
      }

      const cabeceras: Record<string, string | undefined> = {};
      for (const [nombre, valor] of Object.entries(peticion.headers)) {
        cabeceras[nombre.toLowerCase()] = Array.isArray(valor) ? valor[0] : valor;
      }

      const resultado = await procesarEntrega(opciones, canal, cabeceras, cuerpoCrudo);

      if (resultado.motivo !== undefined) {
        registrar(`[borde] ${ruta} → ${resultado.estado}: ${resultado.motivo}`);
      } else {
        registrar(
          `[borde] ${ruta} → ${resultado.estado}, aceptados ${resultado.aceptados ?? 0}, ` +
            `repetidos ${resultado.repetidos ?? 0}, limitados ${resultado.limitados ?? 0}`,
        );
      }

      return responder(respuesta, resultado.estado, resultado.cuerpo);
    })().catch((error: unknown) => {
      registrar(`[borde] fallo no previsto: ${String(error)}`);
      if (!respuesta.headersSent) responder(respuesta, 500, 'error interno');
    });
  });
}

function responder(
  respuesta: ServerResponse,
  estado: number,
  cuerpo: string,
  tipo = 'text/plain; charset=utf-8',
): void {
  respuesta.writeHead(estado, { 'content-type': tipo });
  respuesta.end(cuerpo);
}
