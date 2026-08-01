// El contrato común de los vigías.
//
// Invariante 7: **todo límite tiene un vigía, con umbral y acción declarada**, y
// los vigías son código determinista — jamás un modelo juzgando a otro. Nada de
// este archivo ni de sus implementaciones llama a un modelo, y esa propiedad es
// comprobable leyendo los imports.
//
// Dos decisiones de forma que hacen el trabajo:
//
// **La decisión es un tipo, no un booleano.** Un vigía que devolviera `false`
// para «no sigas» se puede ignorar con un `if` que nadie escribió. Devolver una
// unión discriminada obliga a quien llama a ramificar sobre `accion`, y olvidar
// una rama es un error de tipos, no un incidente en producción.
//
// **Toda actuación lleva umbral, valor observado y acción.** Un registro que
// dijera «el vigía de presupuesto actuó» no permite saber si actuó bien. Con los
// tres campos, cualquiera puede recalcular la decisión a mano — que es lo que
// convierte un aviso en una auditoría.

/** Qué puede hacer un vigía cuando su umbral se cruza. */
export const AUTORIDADES = ['avisar', 'degradar', 'detener'] as const;
export type Autoridad = (typeof AUTORIDADES)[number];

export type Actuacion = {
  readonly vigia: string;
  readonly autoridad: Autoridad;
  readonly umbral: number;
  readonly valor_observado: number;
  /** Legible por una persona. Es lo que se enseña en el panel. */
  readonly explicacion: string;
  readonly momento: string;
  /** Lo que hacía falta para entender el caso. Nunca contenido del cliente. */
  readonly contexto: Readonly<Record<string, string | number>>;
};

export type Decision =
  | { readonly accion: 'seguir' }
  | { readonly accion: 'degradar'; readonly actuacion: Actuacion }
  | { readonly accion: 'detener'; readonly actuacion: Actuacion };

/** Dónde van las actuaciones. Se inyecta para que las pruebas puedan mirarlas. */
export type RegistroDeActuaciones = (actuacion: Actuacion) => void | Promise<void>;

export type EstadoDeVigia = {
  readonly nombre: string;
  readonly autoridad: Autoridad;
  readonly umbral: number;
  readonly valor_actual: number;
  readonly ultima_actuacion: Actuacion | null;
};

export interface Vigia {
  readonly nombre: string;
  /** Lo máximo que este vigía puede hacer. El panel lo enseña. */
  readonly autoridad: Autoridad;
  /** Umbral, valor actual y última actuación. Es la fila del panel de la fase 6. */
  estado(): EstadoDeVigia;
}

export function actuacion(
  vigia: string,
  autoridad: Autoridad,
  umbral: number,
  valor_observado: number,
  explicacion: string,
  contexto: Readonly<Record<string, string | number>> = {},
): Actuacion {
  return {
    vigia,
    autoridad,
    umbral,
    valor_observado,
    explicacion,
    momento: new Date().toISOString(),
    contexto,
  };
}

/**
 * Un recolector en memoria, para las pruebas y para el arranque.
 *
 * La persistencia de actuaciones llega con el panel (fase 6): hasta que haya
 * quien las lea, guardarlas en PostgreSQL sería escribir una tabla que nadie
 * consulta. Lo que sí existe desde ya es el punto de enganche, para que
 * cambiarlo no toque ningún vigía.
 */
export function recolector(): {
  registrar: RegistroDeActuaciones;
  actuaciones: () => readonly Actuacion[];
  limpiar: () => void;
} {
  const recogidas: Actuacion[] = [];
  return {
    registrar: (a) => {
      recogidas.push(a);
    },
    actuaciones: () => [...recogidas],
    limpiar: () => {
      recogidas.length = 0;
    },
  };
}
