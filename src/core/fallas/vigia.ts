// El vigía de fallas — fase 9.
//
// Los nueve vigías anteriores observan un límite: un techo de gasto, una cola,
// un contador de egreso. Este observa **lo que se rompe**, que es un objeto
// distinto: no tiene un umbral natural, porque cero fallos no es un objetivo
// alcanzable ni sensato. Por eso el umbral no se pone sobre los fallos sino
// sobre el **presupuesto de error**: se declara qué disponibilidad se pretende
// sostener, y el margen que queda por debajo es lo que se puede gastar.
//
// Tres decisiones que cambian lo que el informe puede afirmar:
//
// **Un escalado no es una falla.** Un caso que se escala porque no hay fuente
// que lo sostenga es el sistema funcionando: el invariante 1 en acción. Contarlo
// como fallo haría que cumplir el invariante bajara la disponibilidad, y con el
// tiempo alguien «mejoraría» la cifra aflojando el invariante. Falla es que el
// sistema **no pudiera hacer su trabajo**, no que decidiera correctamente no
// hacerlo. La distinción vive en `observar()` y quien llama no puede saltársela:
// solo se le pasa `ok`, y quién es `ok` lo decide este archivo.
//
// **El denominador se publica siempre.** Con ocho observaciones, «100 % de
// disponibilidad» y «25 % de error» son la misma cifra con distinta suerte. Por
// debajo del mínimo configurado el vigía dice que no es concluyente en lugar de
// imprimir un número redondo. Es lo que R-032 enseñó con el vigía de perímetro,
// aplicado antes de tropezar en vez de después.
//
// **El tiempo medio de recuperación se mide por episodios, no por fallos.** Un
// episodio empieza en el primer fallo tras un éxito y termina en el primer éxito
// posterior. Mil fallos seguidos son un episodio, no mil, y su recuperación se
// mide una vez. Promediar sobre fallos daría un número que baja cuanto peor va
// todo, porque una racha larga aporta muchos intervalos cortos.

import { clasificar, type ClaseDeFalla, type ObservacionDeFalla } from './clasificar.ts';
import { huella, plantillaDe } from './huella.ts';
import { SALUD, type ConfigSalud } from './config.ts';
import {
  actuacion,
  type Actuacion,
  type EstadoDeVigia,
  type RegistroDeActuaciones,
  type Vigia,
} from '../vigias/vigia.ts';

/**
 * El caso mínimo para reproducir una falla, ya saneado.
 *
 * No lleva el contacto ni el texto crudo del cliente. Lleva lo que hace falta
 * para volver a provocarla: por dónde entró, de qué clase era la tarea, y el
 * mensaje **saneado**. Con eso un agente de código escribe un caso de prueba sin
 * abrir la base de datos, que es el segundo criterio de aceptación de la fase.
 */
export type Reproduccion = {
  readonly caso_id: string;
  readonly canal: string;
  readonly clase_tarea: string;
  /** Saneado. Nunca el texto tal como lo escribió una persona. */
  readonly mensaje_saneado: string;
  readonly operacion: string;
};

export type Observacion = {
  readonly operacion: string;
  /** ISO. Se pasa desde fuera para que las pruebas no dependan del reloj. */
  readonly momento: string;
  readonly caso_id?: string;
  readonly canal?: string;
  readonly clase_tarea?: string;
  /** El texto que entró. Se sanea aquí dentro; nunca se guarda crudo. */
  readonly mensaje?: string;
  /**
   * La falla, si la hubo. Ausente significa que la operación terminó bien —
   * **incluida** la que terminó escalando a un humano por falta de sustento.
   */
  readonly falla?: Omit<ObservacionDeFalla, 'operacion'>;
};

export type GrupoDeFallas = {
  readonly huella: string;
  readonly clase: ClaseDeFalla;
  readonly operacion: string;
  /** El mensaje sin sus partes variables. Es lo que se enseña. */
  readonly plantilla: string;
  readonly por_que_esa_clase: string;
  readonly veces: number;
  readonly primera_vez: string;
  readonly ultima_vez: string;
  readonly reproduccion: Reproduccion | null;
};

export type Encabezado = {
  readonly observaciones: number;
  readonly fallidas: number;
  /**
   * `false` cuando no hay observaciones suficientes. Con esto en `false`, las
   * cifras de abajo **no se publican**: se enseña el denominador y se dice que
   * no alcanza.
   */
  readonly concluyente: boolean;
  readonly minimo_para_concluir: number;
  readonly disponibilidad: number;
  readonly tasa_error: number;
  readonly objetivo_disponibilidad: number;
  /** Proporción del margen de fallo ya gastada. 1 es gastado entero. */
  readonly presupuesto_error_consumido: number;
  /** Media de los episodios cerrados, en ms. `null` si no cerró ninguno. */
  readonly recuperacion_media_ms: number | null;
  readonly episodios_cerrados: number;
  /** Un episodio abierto es una caída que sigue en curso al cerrar la ventana. */
  readonly episodios_abiertos: number;
};

type Episodio = { readonly inicio: number; fin: number | null };

export class VigiaDeFallas implements Vigia {
  readonly nombre = 'fallas';
  readonly autoridad = 'avisar' as const;

  private readonly config: ConfigSalud;
  private readonly registrar: RegistroDeActuaciones;
  private readonly grupos = new Map<string, GrupoDeFallas>();
  private readonly episodios: Episodio[] = [];
  private observaciones = 0;
  private fallidas = 0;
  private ultima: Actuacion | null = null;
  private yaAviso = false;

  constructor(opciones: { config?: ConfigSalud; registrar?: RegistroDeActuaciones } = {}) {
    this.config = opciones.config ?? SALUD;
    this.registrar = opciones.registrar ?? ((): void => {});
  }

  observar(observacion: Observacion): void {
    this.observaciones += 1;
    const instante = Date.parse(observacion.momento);

    if (observacion.falla === undefined) {
      this.cerrarEpisodio(instante);
      this.evaluar();
      return;
    }

    this.fallidas += 1;
    this.abrirEpisodio(instante);
    this.agrupar(observacion, observacion.falla);
    this.evaluar();
  }

  private abrirEpisodio(instante: number): void {
    const ultimo = this.episodios.at(-1);
    // Solo se abre si no hay ninguno en curso: una racha de fallos es UN
    // episodio, y contarla como muchos hundiría la media de recuperación.
    if (ultimo === undefined || ultimo.fin !== null) {
      this.episodios.push({ inicio: instante, fin: null });
    }
  }

  private cerrarEpisodio(instante: number): void {
    const ultimo = this.episodios.at(-1);
    if (ultimo !== undefined && ultimo.fin === null) ultimo.fin = instante;
  }

  private agrupar(observacion: Observacion, falla: Omit<ObservacionDeFalla, 'operacion'>): void {
    const clasificacion = clasificar({ ...falla, operacion: observacion.operacion });
    const plantilla = plantillaDe(falla.mensaje);
    const clave = huella(clasificacion.clase, observacion.operacion, plantilla);

    const previo = this.grupos.get(clave);
    if (previo !== undefined) {
      this.grupos.set(clave, {
        ...previo,
        veces: previo.veces + 1,
        ultima_vez: observacion.momento,
        // La reproducción se guarda solo la primera vez que se puede. Quedarse
        // con la última haría que el caso citado cambiara en cada aparición, y
        // un informe que señala un caso distinto cada vez que se genera no se
        // puede usar para seguir un arreglo.
        reproduccion: previo.reproduccion ?? reproduccionDe(observacion),
      });
      return;
    }

    this.grupos.set(clave, {
      huella: clave,
      clase: clasificacion.clase,
      operacion: observacion.operacion,
      plantilla,
      por_que_esa_clase: clasificacion.por_que,
      veces: 1,
      primera_vez: observacion.momento,
      ultima_vez: observacion.momento,
      reproduccion: reproduccionDe(observacion),
    });
  }

  private evaluar(): void {
    const encabezado = this.encabezado();
    if (!encabezado.concluyente) return;
    if (encabezado.presupuesto_error_consumido < this.config.umbral_presupuesto_consumido) {
      // Si el presupuesto vuelve por debajo del umbral, se rearma. Un vigía que
      // avisa una vez y se calla para siempre deja de vigilar tras el primer
      // incidente.
      this.yaAviso = false;
      return;
    }
    if (this.yaAviso) return;

    this.yaAviso = true;
    const acto = actuacion(
      this.nombre,
      this.autoridad,
      this.config.umbral_presupuesto_consumido,
      encabezado.presupuesto_error_consumido,
      `El presupuesto de error está gastado al ${(encabezado.presupuesto_error_consumido * 100).toFixed(0)} %: ` +
        `${encabezado.fallidas} de ${encabezado.observaciones} operaciones fallaron, y el objetivo ` +
        `declarado es ${(this.config.objetivo_disponibilidad * 100).toFixed(1)} % de disponibilidad. ` +
        'Este vigía avisa; no detiene nada. Lo que hay que mirar está en el informe de salud, ' +
        'agrupado por huella y con su caso de reproducción.',
      {
        observaciones: encabezado.observaciones,
        fallidas: encabezado.fallidas,
        grupos: this.grupos.size,
        clase_mas_frecuente: this.claseMasFrecuente() ?? 'ninguna',
      },
    );

    this.ultima = acto;
    void this.registrar(acto);
  }

  private claseMasFrecuente(): ClaseDeFalla | null {
    let mejor: GrupoDeFallas | null = null;
    for (const grupo of this.grupos.values()) {
      if (mejor === null || grupo.veces > mejor.veces) mejor = grupo;
    }
    return mejor?.clase ?? null;
  }

  encabezado(): Encabezado {
    const observaciones = this.observaciones;
    const fallidas = this.fallidas;
    const concluyente = observaciones >= this.config.minimo_observaciones;

    const tasa_error = observaciones === 0 ? 0 : fallidas / observaciones;
    const margen = 1 - this.config.objetivo_disponibilidad;

    const cerrados = this.episodios.filter((e) => e.fin !== null);
    const suma = cerrados.reduce((s, e) => s + ((e.fin ?? 0) - e.inicio), 0);

    return {
      observaciones,
      fallidas,
      concluyente,
      minimo_para_concluir: this.config.minimo_observaciones,
      disponibilidad: observaciones === 0 ? 0 : 1 - tasa_error,
      tasa_error,
      objetivo_disponibilidad: this.config.objetivo_disponibilidad,
      // Con margen cero —objetivo del 100 %— cualquier fallo lo desborda y
      // ninguno lo toca. Es la única aritmética del archivo que puede dividir
      // entre cero, y se resuelve aquí en vez de dejar salir un `Infinity`.
      presupuesto_error_consumido: margen === 0 ? (fallidas > 0 ? 1 : 0) : tasa_error / margen,
      recuperacion_media_ms: cerrados.length === 0 ? null : suma / cerrados.length,
      episodios_cerrados: cerrados.length,
      episodios_abiertos: this.episodios.filter((e) => e.fin === null).length,
    };
  }

  /** Los grupos, del más frecuente al menos. */
  agrupadas(): readonly GrupoDeFallas[] {
    return [...this.grupos.values()].sort(
      (a, b) => b.veces - a.veces || a.huella.localeCompare(b.huella),
    );
  }

  estado(): EstadoDeVigia {
    return {
      nombre: this.nombre,
      autoridad: this.autoridad,
      umbral: this.config.umbral_presupuesto_consumido,
      valor_actual: this.encabezado().presupuesto_error_consumido,
      ultima_actuacion: this.ultima,
    };
  }
}

function reproduccionDe(observacion: Observacion): Reproduccion | null {
  if (observacion.caso_id === undefined) return null;

  return {
    caso_id: observacion.caso_id,
    canal: observacion.canal ?? 'desconocido',
    clase_tarea: observacion.clase_tarea ?? 'desconocida',
    // Se sanea con la misma función que usa el resto del perímetro, y por la
    // misma razón: el criterio de la fase pide que el informe pase por la capa
    // de saneo, no por una parecida escrita aquí.
    mensaje_saneado: observacion.mensaje === undefined ? '' : plantillaDe(observacion.mensaje),
    operacion: observacion.operacion,
  };
}
