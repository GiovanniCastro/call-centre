// La respuesta graduada, y el registro de incidentes.
//
// Cuatro niveles: observar, limitar, cuarentena, detener el canal. **Cuarentena
// en vez de bloqueo permanente**, y ese es el punto entero: un detector es una
// lista de cosas que alguien pensó, así que va a haber falsos positivos, y un
// falso positivo con bloqueo permanente deja fuera a un cliente real sin que
// nadie se entere hasta que llama por teléfono enfadado.
//
// La cuarentena caduca sola. La reactivación anticipada la hace una persona, y
// queda registrada con su nombre: si no quedara, «alguien lo reactivó» sería
// todo lo que se podría decir de por qué un contacto marcado volvió a operar.
//
// **Los incidentes NO se agrupan.** Uno a uno, íntegros. Agrupar por huella es
// justo lo que hace el vigía de fallas de la fase 9 con los errores, y aquí sería
// un error: tres intentos de secuestro parecidos son tres intentos, y contarlos
// como «1 × 3» esconde que alguien está probando.

export const NIVELES = ['observar', 'limitar', 'cuarentena', 'detener_canal'] as const;
export type Nivel = (typeof NIVELES)[number];

export const CLASES_DE_INCIDENTE = [
  'secuestro',
  'envenenamiento',
  'fuga',
  'aislamiento',
  'credencial_caducada',
] as const;
export type ClaseDeIncidente = (typeof CLASES_DE_INCIDENTE)[number];

export type Incidente = {
  readonly id: string;
  readonly clase: ClaseDeIncidente;
  readonly contacto: string | null;
  readonly nivel: Nivel;
  /** El texto que lo provocó, íntegro. Sin él no se puede juzgar si fue ataque. */
  readonly evidencia: string;
  readonly patron: string;
  readonly momento: string;
};

/** Cuánto pesa cada clase. Determina a qué nivel se sube. */
const GRAVEDAD: Readonly<Record<ClaseDeIncidente, number>> = {
  // Un intento de secuestro es barato de hacer y no consigue nada por sí solo.
  secuestro: 1,
  // Una fuga significa que algo SALIÓ. Es un hecho consumado, no un intento.
  fuga: 3,
  // Datos de otro contacto en una respuesta es el peor fallo posible del sistema.
  aislamiento: 4,
  // Un documento envenenado afecta a todas las conversaciones, no a una.
  envenenamiento: 3,
  credencial_caducada: 2,
};

export type OpcionesGraduada = {
  /** Puntos acumulados a partir de los cuales se sube de nivel. */
  readonly escalones: Readonly<Record<Nivel, number>>;
  readonly cuarentena_ms: number;
  readonly ahora?: () => number;
};

export type EstadoDeContacto = {
  readonly contacto: string;
  readonly nivel: Nivel;
  readonly puntos: number;
  readonly incidentes: number;
  /** Cuándo caduca la cuarentena. Null si no está en cuarentena. */
  readonly cuarentena_hasta: number | null;
  readonly reactivado_por: string | null;
};

export class RespuestaGraduada {
  private readonly opciones: OpcionesGraduada;
  private readonly ahora: () => number;
  private readonly estados = new Map<string, { puntos: number; incidentes: number; hasta: number | null; reactivado: string | null }>();
  private readonly registro: Incidente[] = [];
  private siguiente = 0;

  constructor(opciones: OpcionesGraduada) {
    this.opciones = opciones;
    this.ahora = opciones.ahora ?? Date.now;
  }

  private nivelDe(puntos: number): Nivel {
    // De mayor a menor: gana el escalón más alto que se haya superado.
    if (puntos >= this.opciones.escalones.detener_canal) return 'detener_canal';
    if (puntos >= this.opciones.escalones.cuarentena) return 'cuarentena';
    if (puntos >= this.opciones.escalones.limitar) return 'limitar';
    return 'observar';
  }

  /**
   * Registra un incidente y devuelve el nivel resultante para ese contacto.
   *
   * La evidencia se guarda íntegra. Recortarla ahorraría espacio y quitaría lo
   * único que permite distinguir un ataque de alguien preguntando cómo funciona
   * el sistema — que es una pregunta legítima que dispara los mismos patrones.
   */
  registrar(
    clase: ClaseDeIncidente,
    contacto: string | null,
    evidencia: string,
    patron: string,
  ): Incidente {
    const puntos = GRAVEDAD[clase];
    let nivel: Nivel = this.nivelDe(puntos);

    if (contacto !== null) {
      const estado = this.estados.get(contacto) ?? {
        puntos: 0,
        incidentes: 0,
        hasta: null,
        reactivado: null,
      };
      estado.puntos += puntos;
      estado.incidentes += 1;
      nivel = this.nivelDe(estado.puntos);

      if (nivel === 'cuarentena' && estado.hasta === null) {
        estado.hasta = this.ahora() + this.opciones.cuarentena_ms;
      }
      this.estados.set(contacto, estado);
    }

    this.siguiente += 1;
    const incidente: Incidente = {
      id: `inc-${this.siguiente}`,
      clase,
      contacto,
      nivel,
      evidencia,
      patron,
      momento: new Date(this.ahora()).toISOString(),
    };

    // Uno a uno. Tres intentos parecidos son tres intentos: agruparlos
    // escondería que alguien está probando.
    this.registro.push(incidente);
    return incidente;
  }

  /** ¿Puede este contacto seguir operando? */
  puedeOperar(contacto: string): boolean {
    const estado = this.estados.get(contacto);
    if (estado === undefined) return true;

    const nivel = this.nivelDe(estado.puntos);
    if (nivel === 'detener_canal') return false;

    if (nivel === 'cuarentena' && estado.hasta !== null) {
      // La cuarentena CADUCA SOLA. Es la diferencia con un bloqueo: un falso
      // positivo se corrige aunque nadie mire.
      if (this.ahora() >= estado.hasta) {
        estado.puntos = 0;
        estado.hasta = null;
        this.estados.set(contacto, estado);
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Reactivación anticipada por una persona.
   *
   * Exige nombre, y queda en el estado. Sin él, «alguien lo reactivó» sería todo
   * lo que se podría decir de por qué un contacto marcado volvió a operar.
   */
  reactivar(contacto: string, operador: string): boolean {
    if (operador.trim() === '') {
      throw new Error(
        'Reactivar exige el nombre de quien lo hace. Una reactivación anónima no se ' +
          'puede auditar, y la reactivación es justo el momento en que alguien decide ' +
          'que un detector se equivocó.',
      );
    }

    const estado = this.estados.get(contacto);
    if (estado === undefined) return false;

    estado.puntos = 0;
    estado.hasta = null;
    estado.reactivado = operador;
    this.estados.set(contacto, estado);
    return true;
  }

  estadoDe(contacto: string): EstadoDeContacto {
    const estado = this.estados.get(contacto);
    if (estado === undefined) {
      return { contacto, nivel: 'observar', puntos: 0, incidentes: 0, cuarentena_hasta: null, reactivado_por: null };
    }

    return {
      contacto,
      nivel: this.nivelDe(estado.puntos),
      puntos: estado.puntos,
      incidentes: estado.incidentes,
      cuarentena_hasta: estado.hasta,
      reactivado_por: estado.reactivado,
    };
  }

  /** Todos los incidentes, sin agrupar. Es lo que enseña el panel. */
  incidentes(): readonly Incidente[] {
    return [...this.registro];
  }
}
