// El emisor de eventos. La escritura real a PostgreSQL llega con la capa de
// repositorio, en la fase 1; aquí vive el contrato y el emisor en memoria que
// usan las pruebas.

import { EsquemaEvento, type Evento } from './evento.ts';

export interface Emisor {
  /**
   * Emite el evento de una ruta de ejecución. Valida contra el esquema antes de
   * aceptar: un evento malformado que llega a la base es una cifra falsa en el
   * panel tres fases más tarde, y para entonces nadie sabe de dónde salió.
   */
  emitir(evento: Evento): void;
}

export class ErrorDeEvento extends Error {
  override readonly name = 'ErrorDeEvento';
}

/** Emisor de pruebas. Guarda lo emitido y valida cada evento al entrar. */
export class EmisorEnMemoria implements Emisor {
  readonly emitidos: Evento[] = [];

  emitir(evento: Evento): void {
    const resultado = EsquemaEvento.safeParse(evento);
    if (!resultado.success) {
      throw new ErrorDeEvento(
        `Evento inválido para el caso «${String(evento.caso_id)}»: ` +
          JSON.stringify(resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)),
      );
    }
    this.emitidos.push(resultado.data);
  }

  deCaso(caso_id: string): Evento[] {
    return this.emitidos.filter((e) => e.caso_id === caso_id);
  }
}
