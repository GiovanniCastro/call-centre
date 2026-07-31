// Arnés de instrumentación — invariante 5.
//
// «Ninguna ruta de ejecución puede terminar sin emitir su evento de telemetría,
// ni emitirlo dos veces.» Eso no es una regla que se lea en un documento: es una
// comprobación que envuelve al emisor y hace fallar la prueba.
//
// Las dos mitades importan por razones distintas. **Cero eventos** deja un caso
// invisible: el panel muestra 189 de 190 y nadie lo nota. **Dos eventos** hace
// lo contrario, infla el denominador, y en ese momento el costo por caso
// resuelto —el número que vende el proyecto— es mentira.
//
// El arnés comprueba también las rutas que terminan en excepción, que son
// justamente las que se olvidan.

import { EsquemaEvento, type Evento } from './evento.ts';
import type { Emisor } from './emisor.ts';

export class ErrorDeInstrumentacion extends Error {
  override readonly name = 'ErrorDeInstrumentacion';
  readonly caso_id: string;
  readonly emitidos: number;

  constructor(mensaje: string, caso_id: string, emitidos: number, causa?: unknown) {
    super(mensaje, causa === undefined ? undefined : { cause: causa });
    this.caso_id = caso_id;
    this.emitidos = emitidos;
  }
}

/**
 * Emisor que cuenta lo que pasa por él, separando el caso vigilado del resto.
 *
 * Sin propiedades de parámetro en el constructor: el intérprete de TypeScript de
 * Node solo borra tipos, y esa sintaxis genera código. Ver `erasableSyntaxOnly`.
 */
class EmisorVigilado implements Emisor {
  delCaso = 0;
  readonly deOtrosCasos: string[] = [];

  private readonly interno: Emisor;
  private readonly caso_id: string;

  constructor(interno: Emisor, caso_id: string) {
    this.interno = interno;
    this.caso_id = caso_id;
  }

  emitir(evento: Evento): void {
    this.interno.emitir(evento);
    if (evento.caso_id === this.caso_id) {
      this.delCaso += 1;
    } else {
      this.deOtrosCasos.push(evento.caso_id);
    }
  }
}

/**
 * Ejecuta una ruta y exige que emita exactamente un evento del caso vigilado.
 *
 * @param emisor Emisor real; el arnés lo envuelve, no lo sustituye.
 * @param caso_id El caso cuya instrumentación se vigila.
 * @param ejecutar La ruta. Recibe el emisor envuelto y **debe usarlo**.
 * @returns Lo que devuelva la ruta.
 * @throws {ErrorDeInstrumentacion} Si emitió cero eventos, más de uno, o eventos
 *   de otro caso. Si la ruta además falló, el error original viaja en `cause`:
 *   un fallo de instrumentación nunca debe tapar el fallo que lo provocó.
 */
export async function vigilarCaso<T>(
  emisor: Emisor,
  caso_id: string,
  ejecutar: (emisor: Emisor) => Promise<T>,
): Promise<T> {
  const vigilado = new EmisorVigilado(emisor, caso_id);

  // La ruta se ejecuta primero y su desenlace se guarda; las comprobaciones de
  // instrumentación corren después, pasara lo que pasara. Una ruta que revienta
  // sin emitir su evento es precisamente el caso que hay que atrapar.
  let salida: { ok: true; valor: T } | { ok: false; error: unknown };
  try {
    salida = { ok: true, valor: await ejecutar(vigilado) };
  } catch (error) {
    salida = { ok: false, error };
  }

  const hubofallo = !salida.ok;
  const fallo = salida.ok ? undefined : salida.error;

  if (vigilado.deOtrosCasos.length > 0) {
    throw new ErrorDeInstrumentacion(
      `La ruta del caso «${caso_id}» emitió eventos de otros casos: ` +
        `${vigilado.deOtrosCasos.join(', ')}. Un evento atribuido al caso equivocado ` +
        'desplaza costo y latencia de un sitio a otro sin que ningún total cambie, ' +
        'que es la clase de error que nadie encuentra.',
      caso_id,
      vigilado.delCaso,
      hubofallo ? fallo : undefined,
    );
  }

  if (vigilado.delCaso === 0) {
    throw new ErrorDeInstrumentacion(
      `La ruta del caso «${caso_id}» terminó sin emitir su evento de telemetría` +
        (hubofallo ? ' (terminó con una excepción; ver `cause`)' : '') +
        '. Invariante 5: un caso invisible no aparece en ningún agregado, ' +
        'y el panel muestra un total que no cuadra con la realidad.',
      caso_id,
      0,
      hubofallo ? fallo : undefined,
    );
  }

  if (vigilado.delCaso > 1) {
    throw new ErrorDeInstrumentacion(
      `La ruta del caso «${caso_id}» emitió ${vigilado.delCaso} eventos; debe emitir ` +
        'exactamente uno. Invariante 5: contar dos veces el mismo caso infla el ' +
        'denominador, y con él el costo por caso resuelto.',
      caso_id,
      vigilado.delCaso,
      hubofallo ? fallo : undefined,
    );
  }

  if (!salida.ok) throw salida.error;
  return salida.valor;
}

/**
 * Comprueba que un lote de eventos instrumenta exactamente una vez cada caso.
 * Es la versión de conjunto del arnés, para el corredor de la fase 7.
 */
export function verificarLote(
  eventos: readonly Evento[],
  casosEsperados: readonly string[],
): void {
  const cuenta = new Map<string, number>();
  for (const evento of eventos) {
    EsquemaEvento.parse(evento);
    cuenta.set(evento.caso_id, (cuenta.get(evento.caso_id) ?? 0) + 1);
  }

  const sinEvento = casosEsperados.filter((caso) => !cuenta.has(caso));
  const duplicados = [...cuenta.entries()].filter(([, n]) => n > 1);
  const inesperados = [...cuenta.keys()].filter((caso) => !casosEsperados.includes(caso));

  const problemas: string[] = [];
  if (sinEvento.length > 0) problemas.push(`sin evento: ${sinEvento.join(', ')}`);
  if (duplicados.length > 0) {
    problemas.push(`duplicados: ${duplicados.map(([c, n]) => `${c}×${n}`).join(', ')}`);
  }
  if (inesperados.length > 0) problemas.push(`no esperados: ${inesperados.join(', ')}`);

  if (problemas.length > 0) {
    throw new ErrorDeInstrumentacion(
      `El lote no instrumenta uno a uno — ${problemas.join('; ')}.`,
      casosEsperados.join(','),
      eventos.length,
    );
  }
}
