// El vigía de perímetro. Umbral cero, autoridad detener.
//
// Es el vigía que sostiene la tesis del proyecto: **ningún caso de sensibilidad
// alta sale del perímetro**. La regla dura del enrutador ya lo impide por
// política; esto es la segunda línea, y existe porque una política se puede
// editar en un JSON y un contador no se puede convencer.
//
// **Registra numerador Y denominador**, y ese es el criterio de aceptación que
// lo distingue de un contador cualquiera. Un cero con denominador cero no prueba
// nada: puede querer decir «retuve todos» o «no llegó ninguno», y son cosas muy
// distintas. El panel tiene que poder enseñar «31 de 31 retenidos», y para eso
// hace falta contar también los que llegaron.

import type { ClaseSensibilidad } from '../../telemetry/evento.ts';
import {
  actuacion,
  type Actuacion,
  type Decision,
  type EstadoDeVigia,
  type RegistroDeActuaciones,
  type Vigia,
} from './vigia.ts';

export type RecuentoDePerimetro = {
  /** Casos clasificados como sensibilidad alta. El DENOMINADOR. */
  readonly altos: number;
  /** De esos, cuántos se retuvieron dentro. El numerador. */
  readonly retenidos: number;
  /** De esos, cuántos salieron. Tiene que ser siempre 0. */
  readonly escapados: number;
};

export class VigiaDePerimetro implements Vigia {
  readonly nombre = 'perimetro';
  readonly autoridad = 'detener' as const;
  /** Cero, y no es configurable. Un umbral de fuga distinto de cero no es un umbral. */
  readonly umbral = 0;

  private altos = 0;
  private retenidos = 0;
  private escapados = 0;
  private ultima: Actuacion | null = null;

  private readonly registrar: RegistroDeActuaciones;

  constructor(registrar: RegistroDeActuaciones = () => {}) {
    this.registrar = registrar;
  }

  /**
   * ¿Puede este caso salir del perímetro?
   *
   * Se llama con la clasificación y el destino **antes** de ejecutar. Contar
   * después de salir sería un forense, no un vigía.
   */
  puedeSalir(clase_sensibilidad: ClaseSensibilidad, hay_egreso: boolean): Decision {
    if (clase_sensibilidad !== 'alta') return { accion: 'seguir' };

    // El denominador se incrementa por CADA caso alto que se evalúa, salga o no.
    // Si solo se contaran los que intentan salir, «31 de 31» sería «0 de 0» en un
    // sistema que funciona bien — y no probaría nada.
    this.altos += 1;

    if (!hay_egreso) {
      this.retenidos += 1;
      return { accion: 'seguir' };
    }

    this.escapados += 1;
    const acto = actuacion(
      this.nombre,
      this.autoridad,
      this.umbral,
      this.escapados,
      'un caso clasificado como sensibilidad alta iba a producir egreso. Se detiene. ' +
        'La regla dura del enrutador debería haberlo impedido antes: que este vigía ' +
        'haya tenido que actuar significa que algo la esquivó.',
      { clase_sensibilidad, altos: this.altos, retenidos: this.retenidos },
    );

    this.ultima = acto;
    void this.registrar(acto);
    return { accion: 'detener', actuacion: acto };
  }

  /** Numerador y denominador. Es lo que el panel enseña como «31 de 31». */
  recuento(): RecuentoDePerimetro {
    return { altos: this.altos, retenidos: this.retenidos, escapados: this.escapados };
  }

  estado(): EstadoDeVigia {
    return {
      nombre: this.nombre,
      autoridad: this.autoridad,
      umbral: this.umbral,
      valor_actual: this.escapados,
      ultima_actuacion: this.ultima,
    };
  }

  /**
   * Cómo se lee el recuento, con el denominador cero resuelto por escrito.
   *
   * Sin esto, el panel tendría que decidir qué enseñar cuando nadie ha mandado
   * un caso sensible, y acabaría enseñando «100 %» — que es una afirmación
   * fuerte sacada de ninguna observación.
   */
  comoTexto(): string {
    if (this.altos === 0) {
      return 'sin casos de sensibilidad alta todavía: no hay nada que afirmar';
    }
    return `${this.retenidos} de ${this.altos} retenidos`;
  }
}
