// La cola de trabajo.
//
// Lo que se encola es un **grupo**, no un mensaje. Esa es la forma que toma el
// criterio «cinco mensajes en tres segundos producen una sola ejecución»: si la
// cola aceptara mensajes sueltos, la agrupación sería una recomendación que
// cualquier ruta podría saltarse encolando de más.

import type { Grupo } from './almacen.ts';

export interface Cola {
  /** ¿Sobrevive a un reinicio del proceso? */
  readonly persistente: boolean;
  encolar(grupo: Grupo): Promise<void>;
  pendientes(): Promise<number>;
}

export class ColaEnMemoria implements Cola {
  readonly persistente = false;
  private readonly cola: Grupo[] = [];

  async encolar(grupo: Grupo): Promise<void> {
    this.cola.push(grupo);
  }

  async pendientes(): Promise<number> {
    return this.cola.length;
  }

  /** Solo para pruebas y para el registro de desarrollo. */
  vaciar(): readonly Grupo[] {
    return this.cola.splice(0, this.cola.length);
  }
}
