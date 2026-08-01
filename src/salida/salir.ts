// **El único módulo del sistema que llama a `fetch`.**
//
// Lo sostienen dos redes distintas: el lint lo prohíbe en el archivo donde se
// escriba, y el check de arquitectura lo persigue por el grafo de dependencias.
// Son dos porque un `fetch` alcanzado a tres saltos no lo ve ESLint.
//
// Lo que esto compra es concreto. Sin lista blanca, una inyección exitosa
// convierte al agente en el mensajero del atacante: basta con que el modelo
// emita una URL para que el perímetro la visite con lo que tenga en contexto.
// Con la lista, la inyección puede pedir lo que quiera y el destino se rechaza
// **antes de abrir el socket** — no se resuelve el DNS, no se envía nada, no hay
// forma de exfiltrar por el tiempo de respuesta.
//
// La otra mitad de su trabajo es contar. Toda salida deja un registro con a
// dónde fue y si fue egreso de verdad; de ahí sale el numerador del vigía de
// perímetro de la fase 4B-1.

import { AsyncLocalStorage } from 'node:async_hooks';

import { DESTINOS, type Destino, type ListaDeDestinos } from './destinos.ts';

export class DestinoBloqueado extends Error {
  override readonly name = 'DestinoBloqueado';
  readonly anfitrion: string;

  constructor(anfitrion: string, motivo: string) {
    super(
      `Salida bloqueada hacia «${anfitrion}»: ${motivo}. ` +
        'Si el destino es legítimo, añádelo a config/destinos.json — con diff, autor y ' +
        'fecha. Si no lo es, esto es el sistema haciendo su trabajo.',
    );
    this.anfitrion = anfitrion;
  }
}

/** Lo que se registra de cada salida. Es la materia prima del vigía de perímetro. */
export type RegistroDeSalida = {
  readonly anfitrion: string;
  readonly clase: Destino['clase'];
  /** Falso para Ollama y Qdrant: el dato no abandonó la máquina. */
  readonly egreso: boolean;
  readonly metodo: string;
  /** Bytes del cuerpo enviado. No el cuerpo: esto no guarda contenido. */
  readonly bytes_enviados: number;
  readonly permitido: boolean;
  readonly motivo?: string;
};

export type Observador = (registro: RegistroDeSalida) => void;

const observadores = new Set<Observador>();

/**
 * Registra un observador de salidas y devuelve cómo darlo de baja.
 *
 * Es el punto de enganche del espía que exige el criterio de aceptación de la
 * fase 3 —«una petición marcada como sensible jamás produce una llamada externa,
 * probado con espía sobre el módulo de salida»—. Un espía que se enchufa aquí ve
 * **todas** las salidas, incluidas las bloqueadas: comprobar solo las permitidas
 * no distinguiría «no se intentó» de «se intentó y se paró», y son cosas muy
 * distintas.
 */
export function observarSalidas(observador: Observador): () => void {
  observadores.add(observador);
  return () => observadores.delete(observador);
}

/**
 * Recolector de salidas acotado a un caso.
 *
 * Los observadores de arriba son globales, y para el panel eso está bien. Para
 * el evento de telemetría de UN caso, no: dos casos que se atienden a la vez
 * verían cada uno las salidas del otro, y `hubo_egreso` diría que un caso sacó
 * datos que sacó otro. Con almacenamiento local asíncrono, cada caso recoge lo
 * suyo aunque se solapen — es la diferencia entre un contador y un contador que
 * sabe de quién es lo que cuenta.
 */
const porCaso = new AsyncLocalStorage<RegistroDeSalida[]>();

/**
 * Ejecuta `trabajo` recogiendo las salidas que ocurran **dentro de él**, sin
 * mezclarlas con las de otros casos concurrentes.
 */
export async function registrandoSalidas<T>(
  trabajo: () => Promise<T>,
): Promise<{ resultado: T; salidas: readonly RegistroDeSalida[] }> {
  const salidas: RegistroDeSalida[] = [];
  const resultado = await porCaso.run(salidas, trabajo);
  return { resultado, salidas };
}

function anunciar(registro: RegistroDeSalida): void {
  porCaso.getStore()?.push(registro);
  for (const observador of observadores) observador(registro);
}

function bytesDe(cuerpo: RequestInit['body']): number {
  if (cuerpo === null || cuerpo === undefined) return 0;
  if (typeof cuerpo === 'string') return Buffer.byteLength(cuerpo, 'utf8');
  if (cuerpo instanceof ArrayBuffer) return cuerpo.byteLength;
  if (ArrayBuffer.isView(cuerpo)) return cuerpo.byteLength;
  // Flujos y formularios: no se puede medir sin consumirlos, y consumirlos los
  // rompería. Se registra 0 y se anota que es desconocido, en lugar de inventar
  // una cifra que acabaría en el panel.
  return 0;
}

export type Veredicto =
  | { readonly permitido: true; readonly destino: Destino; readonly anfitrion: string }
  | { readonly permitido: false; readonly anfitrion: string; readonly motivo: string };

/**
 * ¿Se puede salir hacia ahí? Función pura: no abre nada.
 *
 * Se exporta aparte de `salir` para que se pueda comprobar un destino sin
 * intentarlo — y para que las pruebas puedan afirmar sobre la decisión sin
 * levantar un servidor.
 */
export function evaluarDestino(url: string, lista: ListaDeDestinos = DESTINOS): Veredicto {
  let analizada: URL;
  try {
    analizada = new URL(url);
  } catch {
    return { permitido: false, anfitrion: url, motivo: 'no es una URL absoluta válida' };
  }

  const anfitrion = analizada.hostname.toLowerCase();
  const esquema = analizada.protocol.replace(':', '');
  const destino = lista.porAnfitrion.get(anfitrion);

  if (destino === undefined) {
    return { permitido: false, anfitrion, motivo: 'no está en la lista blanca' };
  }

  // El esquema se comprueba aparte del anfitrión: declarar `api.anthropic.com`
  // no autoriza a hablar con él en claro. Un `https` degradado a `http` por una
  // URL construida a partir de texto del modelo es exactamente la clase de
  // detalle que se cuela cuando solo se mira el dominio.
  if (!destino.esquemas.includes(esquema as 'http' | 'https')) {
    return {
      permitido: false,
      anfitrion,
      motivo: `el esquema «${esquema}» no está autorizado para ese destino (permitidos: ${destino.esquemas.join(', ')})`,
    };
  }

  return { permitido: true, destino, anfitrion };
}

/**
 * La única salida del perímetro.
 *
 * @throws {DestinoBloqueado} Antes de abrir ninguna conexión.
 */
export async function salir(
  url: string,
  opciones: RequestInit = {},
  lista: ListaDeDestinos = DESTINOS,
): Promise<Response> {
  const veredicto = evaluarDestino(url, lista);
  const metodo = (opciones.method ?? 'GET').toUpperCase();
  const bytes = bytesDe(opciones.body);

  if (!veredicto.permitido) {
    anunciar({
      anfitrion: veredicto.anfitrion,
      clase: 'externo',
      egreso: false,
      metodo,
      bytes_enviados: bytes,
      permitido: false,
      motivo: veredicto.motivo,
    });
    throw new DestinoBloqueado(veredicto.anfitrion, veredicto.motivo);
  }

  // El registro se emite **antes** de la llamada, no después. Si se emitiera
  // después, una salida que revienta a mitad no dejaría rastro — y el caso en
  // que más importa saber qué salió es justo ese.
  anunciar({
    anfitrion: veredicto.anfitrion,
    clase: veredicto.destino.clase,
    egreso: veredicto.destino.egreso,
    metodo,
    bytes_enviados: bytes,
    permitido: true,
  });

  return fetch(url, opciones);
}

/**
 * `salir` con la forma de `fetch`, para inyectarlo en un SDK.
 *
 * Es lo que permite usar el SDK oficial de Anthropic sin abrir un agujero en el
 * invariante 3: el SDK hace su propio HTTP, pero lo hace **con esta función**, así
 * que su tráfico pasa por la lista blanca y por el contador igual que el resto.
 * Sin esto habría que elegir entre el SDK y el invariante.
 */
export function fetchDelPerimetro(
  lista: ListaDeDestinos = DESTINOS,
): (url: string | URL | Request, opciones?: RequestInit) => Promise<Response> {
  return async (url, opciones = {}) => {
    const texto =
      typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    return salir(texto, opciones, lista);
  };
}
