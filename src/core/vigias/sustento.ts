// El vigía de sustento. Autoridad: avisar.
//
// **Su trabajo real es distinguir dos cosas que se parecen desde fuera**: que el
// índice esté roto y que el modelo haya empeorado. Las dos se ven igual —bajan
// las respuestas bien sustentadas— y piden arreglos opuestos.
//
// La distinción es observable sin ningún modelo: si la **recuperación** empieza
// a devolver vacío, el problema está antes del modelo. Si la recuperación trae
// fragmentos con buena puntuación y aun así el sustento cae, el problema es del
// modelo o del prompt. Por eso este vigía mira las dos series y no una.
//
// Es la diferencia entre un aviso que dice «el índice está sospechoso, mira
// Qdrant» y uno que dice «el agente ha empeorado», que manda a quien lo lee a
// buscar donde no está.

import {
  actuacion,
  type Actuacion,
  type EstadoDeVigia,
  type RegistroDeActuaciones,
  type Vigia,
} from './vigia.ts';

export type ObservacionDeCaso = {
  /** Cuántos fragmentos devolvió la recuperación. Cero es la señal importante. */
  readonly fragmentos_recuperados: number;
  /** Proporción de campos con procedencia válida. Null si el caso no afirmó nada. */
  readonly sustento: number | null;
};

export type OpcionesSustento = {
  /** Cuántos casos mira hacia atrás. Una ventana corta salta con el ruido. */
  readonly ventana: number;
  /** Proporción de recuperaciones vacías que marca el índice como sospechoso. */
  readonly umbral_vacios: number;
  /** Sustento medio por debajo del cual se avisa, con recuperación sana. */
  readonly umbral_sustento: number;
  readonly registrar?: RegistroDeActuaciones;
};

export type Diagnostico = 'sano' | 'indice_sospechoso' | 'sustento_bajo';

export class VigiaDeSustento implements Vigia {
  readonly nombre = 'sustento';
  readonly autoridad = 'avisar' as const;

  private readonly opciones: OpcionesSustento;
  private readonly registrar: RegistroDeActuaciones;
  private readonly ventana: ObservacionDeCaso[] = [];
  private ultima: Actuacion | null = null;
  private diagnostico: Diagnostico = 'sano';

  constructor(opciones: OpcionesSustento) {
    this.opciones = opciones;
    this.registrar = opciones.registrar ?? (() => {});
  }

  observar(caso: ObservacionDeCaso): Diagnostico {
    this.ventana.push(caso);
    if (this.ventana.length > this.opciones.ventana) this.ventana.shift();

    // No se juzga con media ventana: una racha de tres vacíos al arrancar
    // dispararía una alerta sobre un índice que nadie ha usado todavía.
    if (this.ventana.length < this.opciones.ventana) {
      this.diagnostico = 'sano';
      return this.diagnostico;
    }

    const vacios = this.ventana.filter((c) => c.fragmentos_recuperados === 0).length;
    const proporcionVacios = vacios / this.ventana.length;

    if (proporcionVacios >= this.opciones.umbral_vacios) {
      // El índice, no el agente. Es el aviso que manda a mirar Qdrant.
      this.avisar(
        'indice_sospechoso',
        this.opciones.umbral_vacios,
        proporcionVacios,
        `${vacios} de ${this.ventana.length} recuperaciones devolvieron VACÍO. Eso no es el ` +
          'agente empeorando: es la recuperación no encontrando nada. Mira el índice de ' +
          'Qdrant antes de tocar el prompt o el modelo.',
      );
      return this.diagnostico;
    }

    // Con recuperación sana, un sustento bajo sí apunta al modelo o al prompt.
    const conSustento = this.ventana.filter((c) => c.sustento !== null);
    if (conSustento.length === 0) {
      this.diagnostico = 'sano';
      return this.diagnostico;
    }

    const medio =
      conSustento.reduce((suma, c) => suma + (c.sustento ?? 0), 0) / conSustento.length;

    if (medio < this.opciones.umbral_sustento) {
      this.avisar(
        'sustento_bajo',
        this.opciones.umbral_sustento,
        medio,
        `el sustento medio de los últimos ${this.ventana.length} casos es ${(medio * 100).toFixed(0)} %, ` +
          'con la recuperación devolviendo fragmentos con normalidad. El índice está bien; ' +
          'lo que falla está en el modelo o en las instrucciones.',
      );
      return this.diagnostico;
    }

    this.diagnostico = 'sano';
    return this.diagnostico;
  }

  private avisar(
    diagnostico: Exclude<Diagnostico, 'sano'>,
    umbral: number,
    valor: number,
    explicacion: string,
  ): void {
    this.diagnostico = diagnostico;
    const acto = actuacion(this.nombre, this.autoridad, umbral, valor, explicacion, {
      diagnostico,
      ventana: this.ventana.length,
    });
    this.ultima = acto;
    void this.registrar(acto);
  }

  get indiceSospechoso(): boolean {
    return this.diagnostico === 'indice_sospechoso';
  }

  estado(): EstadoDeVigia {
    const conSustento = this.ventana.filter((c) => c.sustento !== null);
    const medio =
      conSustento.length === 0
        ? 1
        : conSustento.reduce((s, c) => s + (c.sustento ?? 0), 0) / conSustento.length;

    return {
      nombre: this.nombre,
      autoridad: this.autoridad,
      umbral: this.opciones.umbral_sustento,
      valor_actual: medio,
      ultima_actuacion: this.ultima,
    };
  }
}
