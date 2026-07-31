// El despachador: convierte grupos vencidos en trabajo encolado.
//
// Es lo que hace que «cinco mensajes en tres segundos» sea **una** ejecución. Los
// mensajes se acumulan en su grupo mientras la ventana está abierta; cuando
// vence, el grupo entero pasa a la cola como un solo elemento.
//
// El reloj y el disparador se inyectan. Un despachador que llame a `setInterval`
// por su cuenta no se puede probar sin esperar de verdad, y una prueba que espera
// tres segundos es una prueba que un día falla porque la máquina iba cargada.

import type { AlmacenDeBorde } from './almacen.ts';
import type { Cola } from './cola.ts';

export type Despachador = {
  /** Recoge lo vencido y lo encola. Devuelve cuántos grupos despachó. */
  despachar(ahoraMs: number): Promise<number>;
};

export function crearDespachador(almacen: AlmacenDeBorde, cola: Cola): Despachador {
  return {
    async despachar(ahoraMs: number): Promise<number> {
      const grupos = await almacen.recogerGruposVencidos(ahoraMs);

      for (const grupo of grupos) {
        // Un grupo vacío no genera caso. Puede ocurrir si todos sus mensajes se
        // descartaron al releerlos —por ejemplo, tras un cambio de esquema— y
        // encolarlo produciría una ejecución sin nada que procesar.
        if (grupo.mensajes.length > 0) await cola.encolar(grupo);
      }

      return grupos.length;
    },
  };
}

/**
 * Arranca el despachador contra el reloj real.
 *
 * @returns Una función para detenerlo. Se devuelve en lugar de guardarse dentro
 *   porque el proceso tiene que poder cerrarse limpiamente, y un temporizador que
 *   nadie puede parar mantiene el proceso vivo para siempre.
 */
export function arrancarDespachador(
  despachador: Despachador,
  cadaMs: number,
  alFallar: (error: unknown) => void,
): () => void {
  const temporizador = setInterval(() => {
    void despachador.despachar(Date.now()).catch(alFallar);
  }, cadaMs);

  // Sin `unref`, este temporizador impediría que el proceso terminara solo.
  temporizador.unref();

  return () => clearInterval(temporizador);
}
