// Los otros cuatro vigías que observan: proveedor, vigencia, cola y silencio.
//
// Todos con autoridad de avisar. Un vigía que observa y detiene sería un vigía
// que detiene, y la diferencia entre 4B-1 y 4B-2 no es de importancia sino de
// autoridad: estos informan de que algo va mal para que alguien decida, no
// deciden ellos.
//
// **El de silencio es el único que detecta ausencia de señal en vez de exceso**,
// y por eso es el único que necesita saber qué esperar. Los demás disparan
// porque algo pasó; este dispara porque algo dejó de pasar, y «nada» solo es una
// anomalía si antes había algo.

import {
  actuacion,
  type Actuacion,
  type EstadoDeVigia,
  type RegistroDeActuaciones,
  type Vigia,
} from './vigia.ts';

// ── Proveedor ────────────────────────────────────────────────────────────────

export type OpcionesProveedor = {
  readonly ventana: number;
  /** Proporción de fallos a partir de la cual se avisa. */
  readonly umbral_error: number;
  /** Latencia en ms por encima de la cual una llamada cuenta como lenta. */
  readonly latencia_lenta_ms: number;
  readonly umbral_lentas: number;
  readonly registrar?: RegistroDeActuaciones;
};

export class VigiaDeProveedor implements Vigia {
  readonly nombre = 'proveedor';
  readonly autoridad = 'avisar' as const;

  private readonly opciones: OpcionesProveedor;
  private readonly registrar: RegistroDeActuaciones;
  private readonly ventana: { ok: boolean; ms: number }[] = [];
  private ultima: Actuacion | null = null;

  constructor(opciones: OpcionesProveedor) {
    this.opciones = opciones;
    this.registrar = opciones.registrar ?? (() => {});
  }

  observar(llamada: { readonly ok: boolean; readonly ms: number }): void {
    this.ventana.push({ ok: llamada.ok, ms: llamada.ms });
    if (this.ventana.length > this.opciones.ventana) this.ventana.shift();
    if (this.ventana.length < this.opciones.ventana) return;

    const fallos = this.ventana.filter((l) => !l.ok).length / this.ventana.length;
    if (fallos >= this.opciones.umbral_error) {
      this.avisar(
        this.opciones.umbral_error,
        fallos,
        `${(fallos * 100).toFixed(0)} % de las últimas ${this.ventana.length} llamadas al ` +
          'proveedor fallaron. Antes de tocar nada del agente, comprueba credencial, ' +
          'cuota y estado del servicio.',
        { sintoma: 'errores' },
      );
      return;
    }

    const lentas =
      this.ventana.filter((l) => l.ms >= this.opciones.latencia_lenta_ms).length /
      this.ventana.length;
    if (lentas >= this.opciones.umbral_lentas) {
      this.avisar(
        this.opciones.umbral_lentas,
        lentas,
        `${(lentas * 100).toFixed(0)} % de las llamadas superaron ${this.opciones.latencia_lenta_ms} ms. ` +
          'El proveedor responde, pero tarde: el respaldo a local empezará a dispararse ' +
          'y el reparto del panel se moverá sin que haya cambiado la política.',
        { sintoma: 'latencia' },
      );
    }
  }

  private avisar(
    umbral: number,
    valor: number,
    explicacion: string,
    contexto: Readonly<Record<string, string | number>>,
  ): void {
    const acto = actuacion(this.nombre, this.autoridad, umbral, valor, explicacion, contexto);
    this.ultima = acto;
    void this.registrar(acto);
  }

  estado(): EstadoDeVigia {
    const fallos =
      this.ventana.length === 0
        ? 0
        : this.ventana.filter((l) => !l.ok).length / this.ventana.length;
    return {
      nombre: this.nombre,
      autoridad: this.autoridad,
      umbral: this.opciones.umbral_error,
      valor_actual: fallos,
      ultima_actuacion: this.ultima,
    };
  }
}

// ── Vigencia ─────────────────────────────────────────────────────────────────

/** Algo con fecha de caducidad declarada. */
export type Fechado = {
  readonly que: string;
  /** ISO. Después de esta fecha, lo que declara ya no vale. */
  readonly vigente_hasta: string;
};

export type OpcionesVigencia = {
  /** Cuántos días antes de caducar se empieza a avisar. */
  readonly aviso_dias_antes: number;
  readonly registrar?: RegistroDeActuaciones;
  readonly ahora?: () => number;
};

/**
 * El vigía de vigencia.
 *
 * Existe por algo concreto: `corpus/07-precios-y-deducibles.md` declara «tarifas
 * vigentes del 1 de enero al 31 de diciembre de 2026». El 1 de enero de 2027 ese
 * documento sigue en el índice, se sigue recuperando y se sigue citando — y todo
 * lo que el agente diga apoyándose en él será falso con una cita perfectamente
 * verificable. El verificador de procedencia no lo puede atrapar: el valor SÍ
 * aparece literalmente en el fragmento. Solo la fecha lo delata.
 */
export class VigiaDeVigencia implements Vigia {
  readonly nombre = 'vigencia';
  readonly autoridad = 'avisar' as const;

  private readonly opciones: OpcionesVigencia;
  private readonly registrar: RegistroDeActuaciones;
  private readonly ahora: () => number;
  private ultima: Actuacion | null = null;
  private caducados = 0;

  constructor(opciones: OpcionesVigencia) {
    this.opciones = opciones;
    this.registrar = opciones.registrar ?? (() => {});
    this.ahora = opciones.ahora ?? Date.now;
  }

  revisar(fechados: readonly Fechado[]): readonly Fechado[] {
    const ahora = this.ahora();
    const margen = this.opciones.aviso_dias_antes * 86_400_000;
    const problematicos: Fechado[] = [];

    for (const fechado of fechados) {
      const limite = Date.parse(fechado.vigente_hasta);
      if (Number.isNaN(limite)) continue;

      const caducado = ahora > limite;
      if (!caducado && ahora + margen < limite) continue;

      problematicos.push(fechado);
      const dias = Math.round((limite - ahora) / 86_400_000);

      const acto = actuacion(
        this.nombre,
        this.autoridad,
        0,
        dias,
        caducado
          ? `«${fechado.que}» caducó hace ${Math.abs(dias)} días y sigue en uso. El verificador ` +
            'de procedencia NO puede atrapar esto: el valor aparece literalmente en el ' +
            'fragmento, y la cita es correcta. Solo la fecha lo delata.'
          : `«${fechado.que}» caduca en ${dias} días.`,
        { que: fechado.que, caducado: caducado ? 1 : 0 },
      );

      if (caducado) this.caducados += 1;
      this.ultima = acto;
      void this.registrar(acto);
    }

    return problematicos;
  }

  estado(): EstadoDeVigia {
    return {
      nombre: this.nombre,
      autoridad: this.autoridad,
      umbral: 0,
      valor_actual: this.caducados,
      ultima_actuacion: this.ultima,
    };
  }
}

// ── Cola ─────────────────────────────────────────────────────────────────────

export type OpcionesCola = {
  readonly profundidad_maxima: number;
  readonly antiguedad_maxima_ms: number;
  readonly registrar?: RegistroDeActuaciones;
};

export class VigiaDeCola implements Vigia {
  readonly nombre = 'cola';
  readonly autoridad = 'avisar' as const;

  private readonly opciones: OpcionesCola;
  private readonly registrar: RegistroDeActuaciones;
  private ultima: Actuacion | null = null;
  private profundidad = 0;

  constructor(opciones: OpcionesCola) {
    this.opciones = opciones;
    this.registrar = opciones.registrar ?? (() => {});
  }

  observar(estado: { readonly profundidad: number; readonly mas_antiguo_ms: number }): void {
    this.profundidad = estado.profundidad;

    // La antigüedad va primero: una cola corta pero parada es peor que una
    // larga que avanza. La profundidad sola no distingue las dos.
    if (estado.mas_antiguo_ms >= this.opciones.antiguedad_maxima_ms) {
      this.avisar(
        this.opciones.antiguedad_maxima_ms,
        estado.mas_antiguo_ms,
        `hay trabajo esperando desde hace ${Math.round(estado.mas_antiguo_ms / 1000)} s. ` +
          'Una cola corta que no avanza es peor que una larga que sí: apunta a un ' +
          'despachador parado, no a exceso de tráfico.',
        { sintoma: 'antiguedad', profundidad: estado.profundidad },
      );
      return;
    }

    if (estado.profundidad >= this.opciones.profundidad_maxima) {
      this.avisar(
        this.opciones.profundidad_maxima,
        estado.profundidad,
        `la cola tiene ${estado.profundidad} elementos y avanza. Entra más de lo que sale.`,
        { sintoma: 'profundidad' },
      );
    }
  }

  private avisar(
    umbral: number,
    valor: number,
    explicacion: string,
    contexto: Readonly<Record<string, string | number>>,
  ): void {
    const acto = actuacion(this.nombre, this.autoridad, umbral, valor, explicacion, contexto);
    this.ultima = acto;
    void this.registrar(acto);
  }

  estado(): EstadoDeVigia {
    return {
      nombre: this.nombre,
      autoridad: this.autoridad,
      umbral: this.opciones.profundidad_maxima,
      valor_actual: this.profundidad,
      ultima_actuacion: this.ultima,
    };
  }
}

// ── Silencio ─────────────────────────────────────────────────────────────────

/** Cuántos mensajes se esperan por hora del día, de 0 a 23. */
export type TraficoEsperado = readonly number[];

export type OpcionesSilencio = {
  readonly esperado_por_hora: TraficoEsperado;
  /** Minutos sin nada que se toleran en una franja con tráfico esperado. */
  readonly tolerancia_min: number;
  readonly registrar?: RegistroDeActuaciones;
  readonly ahora?: () => number;
};

/**
 * El vigía de silencio: detecta **ausencia** de señal.
 *
 * Es el único que necesita saber qué esperar, porque «no ha llegado nada» solo
 * es una anomalía si antes llegaba algo. A las cuatro de la mañana el silencio
 * es lo normal; a las once de un martes, es un webhook caído — y ese fallo no
 * genera ningún error en ningún sitio, que es lo que lo hace peligroso. Todo lo
 * demás del sistema se entera de los problemas porque algo falla; de este, solo
 * se entera alguien que estaba contando lo que no pasó.
 */
export class VigiaDeSilencio implements Vigia {
  readonly nombre = 'silencio';
  readonly autoridad = 'avisar' as const;

  private readonly opciones: OpcionesSilencio;
  private readonly registrar: RegistroDeActuaciones;
  private readonly ahora: () => number;
  private ultimoMensaje: number;
  private ultima: Actuacion | null = null;

  constructor(opciones: OpcionesSilencio) {
    if (opciones.esperado_por_hora.length !== 24) {
      throw new Error('El tráfico esperado necesita las 24 horas: sin una, esa hora no se vigila.');
    }
    this.opciones = opciones;
    this.registrar = opciones.registrar ?? (() => {});
    this.ahora = opciones.ahora ?? Date.now;
    this.ultimoMensaje = this.ahora();
  }

  hubo(): void {
    this.ultimoMensaje = this.ahora();
  }

  /**
   * Desde cuándo cuenta el silencio.
   *
   * No desde el último mensaje a secas: desde el último mensaje **o desde que
   * empezó la franja activa**, lo que sea más tarde. Sin esto, cinco horas de
   * silencio nocturno —que es lo normal— se acumulan y disparan la alarma a las
   * nueve en punto, cuando la franja acaba de abrir y nadie ha tenido tiempo de
   * escribir todavía. Una alerta que salta cada mañana es una alerta que se
   * desactiva, y entonces no vigila nada.
   */
  private cuentaDesde(ahora: number): number {
    const fecha = new Date(ahora);
    let hora = fecha.getHours();

    // Se retrocede mientras la hora anterior también esperara tráfico: la franja
    // es el bloque contiguo, no la hora suelta.
    while (hora > 0 && (this.opciones.esperado_por_hora[hora - 1] ?? 0) > 0) hora -= 1;

    const inicioDeFranja = new Date(fecha);
    inicioDeFranja.setHours(hora, 0, 0, 0);

    return Math.max(this.ultimoMensaje, inicioDeFranja.getTime());
  }

  /** Se llama periódicamente. No espera a que llegue algo: eso nunca pasaría. */
  comprobar(): boolean {
    const ahora = this.ahora();
    const hora = new Date(ahora).getHours();
    const esperado = this.opciones.esperado_por_hora[hora] ?? 0;

    // En una franja donde no se espera tráfico, el silencio no es información.
    if (esperado === 0) return false;

    const callado = ahora - this.cuentaDesde(ahora);
    const tolerancia = this.opciones.tolerancia_min * 60_000;
    if (callado < tolerancia) return false;

    const acto = actuacion(
      this.nombre,
      this.autoridad,
      tolerancia,
      callado,
      `${Math.round(callado / 60_000)} minutos sin un solo mensaje en una franja donde se ` +
        `esperan ${esperado} por hora. Un webhook caído no genera ningún error en ningún ` +
        'sitio: la única forma de enterarse es contar lo que no llegó.',
      { hora, esperado },
    );

    this.ultima = acto;
    void this.registrar(acto);
    return true;
  }

  estado(): EstadoDeVigia {
    return {
      nombre: this.nombre,
      autoridad: this.autoridad,
      umbral: this.opciones.tolerancia_min * 60_000,
      valor_actual: this.ahora() - this.ultimoMensaje,
      ultima_actuacion: this.ultima,
    };
  }
}
