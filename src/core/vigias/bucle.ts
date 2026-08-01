// El vigía de bucle. Corta y escala.
//
// Cuatro límites duros por caso: pasos, llamadas a herramientas, reintentos y
// tiempo total con cancelación. Los cuatro porque un bucle se puede dar en
// cuatro sitios y cerrar tres deja abierto el cuarto — un caso que alterna dos
// herramientas eternamente no supera el límite de pasos si nadie cuenta las
// herramientas.
//
// **El tiempo se cuenta con cancelación, no solo se mide.** Un límite temporal
// que solo comprueba al terminar cada paso no corta un paso que no termina; hace
// falta poder abortar lo que está en vuelo, y por eso el vigía expone una señal.
//
// Cuando corta, **escala**: el caso pasa a un humano con su hilo. Cortar y
// devolver un error dejaría al cliente sin respuesta y sin nadie mirándolo.

import {
  actuacion,
  type Actuacion,
  type Decision,
  type EstadoDeVigia,
  type RegistroDeActuaciones,
  type Vigia,
} from './vigia.ts';

export type LimitesDeBucle = {
  readonly pasos: number;
  readonly herramientas: number;
  readonly reintentos: number;
  readonly tiempo_ms: number;
};

export type Contador = 'pasos' | 'herramientas' | 'reintentos';

export type OpcionesBucle = {
  readonly limites: LimitesDeBucle;
  readonly registrar?: RegistroDeActuaciones;
  readonly ahora?: () => number;
};

/**
 * Un caso en curso. Se crea uno por caso y se descarta al terminar.
 *
 * Es un objeto y no un contador global a propósito: dos casos atendidos a la vez
 * comparten proceso, y un contador global haría que el segundo heredara los
 * pasos del primero — cortando casos sanos y dejando pasar bucles.
 */
export class CasoVigilado {
  private readonly limites: LimitesDeBucle;
  private readonly registrar: RegistroDeActuaciones;
  private readonly ahora: () => number;
  private readonly inicio: number;
  private readonly control = new AbortController();
  private readonly contadores: Record<Contador, number> = {
    pasos: 0,
    herramientas: 0,
    reintentos: 0,
  };

  private ultima: Actuacion | null = null;

  readonly caso_id: string;

  // Campos declarados y asignados a mano: el proyecto corre con
  // `erasableSyntaxOnly`, que prohíbe las propiedades de parámetro.
  constructor(
    caso_id: string,
    limites: LimitesDeBucle,
    registrar: RegistroDeActuaciones,
    ahora: () => number,
  ) {
    this.caso_id = caso_id;
    this.limites = limites;
    this.registrar = registrar;
    this.ahora = ahora;
    this.inicio = ahora();
  }

  /** Para pasar a `fetch` y a los adaptadores: cancela lo que esté en vuelo. */
  get senal(): AbortSignal {
    return this.control.signal;
  }

  get transcurrido_ms(): number {
    return this.ahora() - this.inicio;
  }

  private cortar(
    motivo: string,
    umbral: number,
    valor: number,
    contexto: Readonly<Record<string, string | number>>,
  ): Decision {
    const acto = actuacion('bucle', 'detener', umbral, valor, motivo, {
      caso_id: this.caso_id,
      ...contexto,
    });

    this.ultima = acto;
    void this.registrar(acto);
    // Se aborta AQUÍ, no en quien llama: si dependiera de que el llamante se
    // acuerde, un llamante distraído dejaría la petición en vuelo consumiendo
    // presupuesto después de que el vigía dijera que parara.
    this.control.abort(new Error(motivo));
    return { accion: 'detener', actuacion: acto };
  }

  /** Antes de cada paso. Devuelve `detener` cuando toca cortar. */
  paso(cual: Contador = 'pasos'): Decision {
    // El tiempo se comprueba en cada paso además de por señal: si el caso hace
    // muchos pasos rápidos, el reloj es el único límite que lo detiene.
    if (this.transcurrido_ms >= this.limites.tiempo_ms) {
      return this.cortar(
        `el caso lleva ${this.transcurrido_ms} ms, por encima del máximo de ${this.limites.tiempo_ms} ms. ` +
          'Se corta y se escala: un caso que tarda esto ya ha perdido al cliente aunque acabe respondiendo.',
        this.limites.tiempo_ms,
        this.transcurrido_ms,
        { contador: 'tiempo_ms' },
      );
    }

    this.contadores[cual] += 1;
    const limite = this.limites[cual];

    if (this.contadores[cual] > limite) {
      return this.cortar(
        `el caso superó el límite de ${cual} (${limite}). Se corta y se escala.`,
        limite,
        this.contadores[cual],
        { contador: cual },
      );
    }

    return { accion: 'seguir' };
  }

  cuenta(cual: Contador): number {
    return this.contadores[cual];
  }

  get ultima_actuacion(): Actuacion | null {
    return this.ultima;
  }
}

export class VigiaDeBucle implements Vigia {
  readonly nombre = 'bucle';
  readonly autoridad = 'detener' as const;

  private readonly limites: LimitesDeBucle;
  private readonly registrar: RegistroDeActuaciones;
  private readonly ahora: () => number;
  private ultima: Actuacion | null = null;
  private cortados = 0;

  constructor(opciones: OpcionesBucle) {
    this.limites = opciones.limites;
    this.ahora = opciones.ahora ?? Date.now;
    this.registrar = (a) => {
      this.ultima = a;
      this.cortados += 1;
      return (opciones.registrar ?? (() => {}))(a);
    };
  }

  vigilar(caso_id: string): CasoVigilado {
    return new CasoVigilado(caso_id, this.limites, this.registrar, this.ahora);
  }

  estado(): EstadoDeVigia {
    return {
      nombre: this.nombre,
      autoridad: this.autoridad,
      umbral: this.limites.pasos,
      valor_actual: this.cortados,
      ultima_actuacion: this.ultima,
    };
  }
}
