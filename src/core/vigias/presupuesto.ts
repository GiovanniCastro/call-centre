// El vigía de presupuesto. Dos umbrales y dos autoridades distintas.
//
//   umbral suave  → degradar: todo a modelo local. Se sigue atendiendo.
//   umbral duro   → detener las llamadas de nube y responder con contingencia.
//
// Que sean dos y no uno es la decisión de este archivo. Un único techo obliga a
// elegir entre gastar de más o dejar de atender, y las dos son malas. Con el
// suave el sistema se abarata solo antes de quedarse sin margen; el duro es el
// freno de mano, no el de servicio.
//
// **Cuatro ventanas, no una**: por conversación, por contacto, por hora y por
// día. Un techo diario protege la factura del mes y no protege de nada más: un
// bucle de un solo contacto puede consumirlo entero en dos minutos y dejar sin
// servicio a todos los demás durante veintidós horas. El techo por contacto es
// el que impide que un caso se lleve el presupuesto de todos.

import {
  actuacion,
  type Actuacion,
  type Decision,
  type EstadoDeVigia,
  type RegistroDeActuaciones,
  type Vigia,
} from './vigia.ts';

export type VentanaDePresupuesto = 'conversacion' | 'contacto' | 'hora' | 'dia';

export type TechosDePresupuesto = Readonly<Record<VentanaDePresupuesto, number>>;

export type OpcionesPresupuesto = {
  /** Umbral duro por ventana, en dólares. */
  readonly techos: TechosDePresupuesto;
  /** Fracción del techo a partir de la cual se degrada. 0.8 = al 80 %. */
  readonly fraccion_suave: number;
  readonly registrar?: RegistroDeActuaciones;
  /** Se inyecta para que las pruebas no dependan del reloj. */
  readonly ahora?: () => number;
};

type Acumulado = { gastado: number; desde: number };

const DURACION_MS: Readonly<Record<VentanaDePresupuesto, number | null>> = {
  // Conversación y contacto no caducan por tiempo: se reinician cuando termina
  // la conversación o cuando alguien lo decide. Un techo por contacto que se
  // vacía cada hora no protege de un bucle que espera una hora.
  conversacion: null,
  contacto: null,
  hora: 3_600_000,
  dia: 86_400_000,
};

export class VigiaDePresupuesto implements Vigia {
  readonly nombre = 'presupuesto';
  readonly autoridad = 'detener' as const;

  private readonly techos: TechosDePresupuesto;
  private readonly fraccionSuave: number;
  private readonly registrar: RegistroDeActuaciones;
  private readonly ahora: () => number;
  private readonly acumulados = new Map<string, Acumulado>();
  private ultima: Actuacion | null = null;

  constructor(opciones: OpcionesPresupuesto) {
    if (opciones.fraccion_suave <= 0 || opciones.fraccion_suave >= 1) {
      throw new Error(
        'La fracción del umbral suave tiene que estar entre 0 y 1 sin incluirlos. ' +
          'En 1 el umbral suave y el duro serían el mismo, y el sistema pasaría de ' +
          'atender con normalidad a no atender sin ningún escalón intermedio.',
      );
    }

    this.techos = opciones.techos;
    this.fraccionSuave = opciones.fraccion_suave;
    this.registrar = opciones.registrar ?? (() => {});
    this.ahora = opciones.ahora ?? Date.now;
  }

  private clave(ventana: VentanaDePresupuesto, sujeto: string): string {
    return `${ventana}:${sujeto}`;
  }

  private acumuladoDe(ventana: VentanaDePresupuesto, sujeto: string): Acumulado {
    const clave = this.clave(ventana, sujeto);
    const duracion = DURACION_MS[ventana];
    const ahora = this.ahora();
    const actual = this.acumulados.get(clave);

    if (actual === undefined) {
      const nuevo = { gastado: 0, desde: ahora };
      this.acumulados.set(clave, nuevo);
      return nuevo;
    }

    if (duracion !== null && ahora - actual.desde >= duracion) {
      const nuevo = { gastado: 0, desde: ahora };
      this.acumulados.set(clave, nuevo);
      return nuevo;
    }

    return actual;
  }

  /** Apunta lo gastado. Se llama DESPUÉS de cada llamada, con su costo real. */
  apuntar(sujetos: Readonly<Partial<Record<VentanaDePresupuesto, string>>>, costo: number): void {
    if (costo < 0) throw new Error('Un costo negativo devolvería presupuesto gastado.');

    for (const [ventana, sujeto] of Object.entries(sujetos)) {
      if (sujeto === undefined) continue;
      const acumulado = this.acumuladoDe(ventana as VentanaDePresupuesto, sujeto);
      acumulado.gastado += costo;
    }
  }

  /**
   * ¿Se puede hacer otra llamada de nube?
   *
   * Se consulta ANTES, con lo gastado hasta ahora. Consultar después sería
   * comprobar si el presupuesto se pasó, que no es lo mismo que impedir que se
   * pase.
   */
  puedeGastar(sujetos: Readonly<Partial<Record<VentanaDePresupuesto, string>>>): Decision {
    let peor: { ventana: VentanaDePresupuesto; gastado: number; techo: number } | null = null;

    for (const [ventana, sujeto] of Object.entries(sujetos)) {
      if (sujeto === undefined) continue;
      const v = ventana as VentanaDePresupuesto;
      const gastado = this.acumuladoDe(v, sujeto).gastado;
      const techo = this.techos[v];

      // Gana la ventana más apretada en proporción, no la de más gasto absoluto:
      // 9 de 10 dólares por hora aprieta más que 20 de 100 al día.
      if (peor === null || gastado / techo > peor.gastado / peor.techo) {
        peor = { ventana: v, gastado, techo };
      }
    }

    if (peor === null) return { accion: 'seguir' };

    if (peor.gastado >= peor.techo) {
      const acto = actuacion(
        this.nombre,
        'detener',
        peor.techo,
        peor.gastado,
        `techo duro de la ventana «${peor.ventana}» alcanzado. Se detienen las llamadas ` +
          'de nube y se responde con el mensaje de contingencia.',
        { ventana: peor.ventana },
      );
      this.ultima = acto;
      void this.registrar(acto);
      return { accion: 'detener', actuacion: acto };
    }

    const suave = peor.techo * this.fraccionSuave;
    if (peor.gastado >= suave) {
      const acto = actuacion(
        this.nombre,
        'degradar',
        suave,
        peor.gastado,
        `umbral suave de la ventana «${peor.ventana}» alcanzado. Todo a modelo local: ` +
          'se sigue atendiendo, más barato, antes de quedarse sin margen.',
        { ventana: peor.ventana, techo_duro: peor.techo },
      );
      this.ultima = acto;
      void this.registrar(acto);
      return { accion: 'degradar', actuacion: acto };
    }

    return { accion: 'seguir' };
  }

  gastado(ventana: VentanaDePresupuesto, sujeto: string): number {
    return this.acumuladoDe(ventana, sujeto).gastado;
  }

  /** Al cerrar una conversación, su acumulado deja de tener sentido. */
  olvidar(ventana: VentanaDePresupuesto, sujeto: string): void {
    this.acumulados.delete(this.clave(ventana, sujeto));
  }

  estado(): EstadoDeVigia {
    return {
      nombre: this.nombre,
      autoridad: this.autoridad,
      umbral: this.techos.dia,
      valor_actual: this.ultima?.valor_observado ?? 0,
      ultima_actuacion: this.ultima,
    };
  }
}
