// El emisor que persiste. Es lo que convierte «el panel muestra cifras» en «toda
// cifra del panel se rastrea hasta un evento real en PostgreSQL».
//
// **`emitir` no escribe.** La interfaz `Emisor` es síncrona a propósito —una ruta
// de ejecución no puede quedarse esperando a una base de datos para poder decir
// que terminó— así que aquí se valida y se acumula, y `volcar()` escribe.
//
// Esa separación tiene una consecuencia que hay que mirar de frente: entre el
// `emitir` y el `volcar` los eventos viven en memoria, y un proceso que muere en
// medio los pierde. Se acepta, y se acota:
//
//   - `volcar()` se llama al cerrar cada caso, no cada hora.
//   - `pendientes()` expone cuántos quedan, para que un apagado ordenado pueda
//     comprobar que no deja nada.
//   - Lo que falla al escribir **vuelve a la cola** y `volcar()` lo dice. Un
//     emisor que se comiera el error dejaría el panel con un total que no cuadra
//     y nadie sabría por qué.
//
// La alternativa —escribir dentro de `emitir` con un `void promesa`— pierde los
// errores de verdad: la promesa rechazada no la mira nadie.

import { EsquemaEvento, type Evento } from './evento.ts';
import { ErrorDeEvento, type Emisor } from './emisor.ts';
import { guardarEvento } from '../repos/eventos.ts';
import type { Consultador } from '../repos/cliente.ts';
import type { AlcanceContacto } from '../repos/alcance.ts';

export type ResultadoDeVolcado = {
  readonly escritos: number;
  /** Ya estaban: `evento_id` es único y reintentar no duplica. */
  readonly repetidos: number;
  /** Siguen en la cola. Que no sea cero es una noticia, no un detalle. */
  readonly fallidos: number;
  readonly errores: readonly string[];
};

export class EmisorPostgres implements Emisor {
  private readonly cola: Evento[] = [];
  private readonly bd: Consultador;
  private readonly alcance: AlcanceContacto;
  private readonly contacto_id: string | null;
  private readonly conversacion_id: string | null;

  constructor(opciones: {
    bd: Consultador;
    alcance: AlcanceContacto;
    contacto_id?: string | null;
    conversacion_id?: string | null;
  }) {
    this.bd = opciones.bd;
    this.alcance = opciones.alcance;
    this.contacto_id = opciones.contacto_id ?? null;
    this.conversacion_id = opciones.conversacion_id ?? null;
  }

  /**
   * Valida y encola. Valida **aquí** y no en el volcado: un evento malformado
   * tiene que reventar en la ruta que lo produjo, donde todavía se sabe cuál
   * era. Descubrirlo al volcar deja un error sin dueño.
   */
  emitir(evento: Evento): void {
    const resultado = EsquemaEvento.safeParse(evento);
    if (!resultado.success) {
      throw new ErrorDeEvento(
        `Evento inválido para el caso «${String(evento.caso_id)}»: ` +
          JSON.stringify(resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)),
      );
    }
    this.cola.push(resultado.data);
  }

  pendientes(): number {
    return this.cola.length;
  }

  /** Escribe lo acumulado. Lo que falla vuelve a la cola y sale en el resultado. */
  async volcar(): Promise<ResultadoDeVolcado> {
    const porEscribir = this.cola.splice(0, this.cola.length);
    let escritos = 0;
    let repetidos = 0;
    const errores: string[] = [];
    const devueltos: Evento[] = [];

    for (const evento of porEscribir) {
      try {
        const { guardado } = await guardarEvento(
          this.alcance,
          this.bd,
          evento,
          this.contacto_id,
          this.conversacion_id,
        );
        if (guardado) escritos += 1;
        else repetidos += 1;
      } catch (error) {
        devueltos.push(evento);
        errores.push(
          `${evento.caso_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.cola.unshift(...devueltos);

    return { escritos, repetidos, fallidos: devueltos.length, errores };
  }
}
