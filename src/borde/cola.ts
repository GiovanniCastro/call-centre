// La cola de entrada.
//
// Aquí solo está la **interfaz** y una implementación en memoria. La de Redis,
// con ventana de agrupación y persistencia entre reinicios, llega con la segunda
// mitad de la fase 1.
//
// La implementación en memoria no es un atajo permanente y no debe tratarse como
// tal: pierde todo al reiniciar, y el criterio «reiniciar el proceso no pierde la
// conversación en curso» no se puede cumplir con ella. Existe para que el borde
// se pueda construir, probar y arrancar antes que Redis, y **dice en voz alta lo
// que es** — `persistente: false` — para que ninguna superficie la confunda con
// la definitiva.

import type { MensajeCanonico } from '../core/mensaje.ts';

export interface Cola {
  /** ¿Sobrevive a un reinicio del proceso? */
  readonly persistente: boolean;
  encolar(mensaje: MensajeCanonico): Promise<void>;
  /** Cuántos hay esperando. Para el parte de arranque y las pruebas. */
  pendientes(): Promise<number>;
}

export class ColaEnMemoria implements Cola {
  readonly persistente = false;
  private readonly cola: MensajeCanonico[] = [];

  async encolar(mensaje: MensajeCanonico): Promise<void> {
    this.cola.push(mensaje);
  }

  async pendientes(): Promise<number> {
    return this.cola.length;
  }

  /** Solo para pruebas y para el registro de desarrollo. */
  vaciar(): readonly MensajeCanonico[] {
    return this.cola.splice(0, this.cola.length);
  }
}
