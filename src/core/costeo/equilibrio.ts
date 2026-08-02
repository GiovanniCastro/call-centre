// El punto de equilibrio entre nube y local. Fase 6B.
//
// **No reimplementa el costeo. Le pasa otros parámetros.** `costear` ya acepta
// una `TablaDePrecios` como segundo argumento, así que «¿y si la máquina costara
// la mitad?» o «¿y si la nube bajara un 30 %?» son la misma función con otra
// tabla — no una aritmética paralela que se parece.
//
// Esa es la diferencia entre esta calculadora y una hoja de cálculo: la hoja
// tendría las fórmulas copiadas, y el día que cambiara la política de costeo
// seguiría dando la cifra vieja sin que nadie lo notara. Aquí, si `costear`
// cambia, la calculadora cambia con ella o falla la prueba de consistencia.
//
// Lo que sí vive aquí es la pregunta que el costeo no responde: **a partir de qué
// volumen sale a cuenta comprar la máquina.** Eso no es un precio, es una
// comparación entre dos costos totales, y depende de cuántos casos al mes haya.

import { costear, type Tramo } from './costear.ts';
import { TABLA, type TablaDePrecios } from './precios.ts';

/** Lo que el usuario puede mover en la calculadora. */
export type Escenario = {
  /** Casos al mes. Es la variable independiente: de ella depende todo. */
  readonly volumen_mensual: number;
  /** Coste de compra del equipo, en USD. */
  readonly costo_equipo: number;
  readonly vida_util_anios: number;
  /**
   * Utilización **mínima** de la máquina, por trabajo que no es esta carga.
   *
   * No es la utilización a secas, y la diferencia es la que hace que esta
   * calculadora signifique algo. La utilización real de esta carga **se deriva
   * del volumen**: mil casos de trece segundos ocupan la máquina tres horas y
   * media al mes, que sobre las horas de un mes es un 0.5 %. Con la máquina
   * parada el 99.5 % del tiempo, cada caso carga con una porción enorme de la
   * amortización — y por eso a bajo volumen la nube gana.
   *
   * Este parámetro es para cuando la máquina **también hace otra cosa**: si ya
   * está ocupada al 40 % con otro trabajo, la amortización se reparte entre los
   * dos y esta carga no debe pagarla entera.
   */
  readonly utilizacion_minima: number;
  readonly potencia_vatios: number;
  readonly precio_kwh: number;
  readonly mantenimiento_anual: number;
  /**
   * Cuánto baja el precio de nube en el horizonte, como fracción.
   *
   * `0.3` es «la nube cuesta un 30 % menos». Está aquí porque el argumento
   * comercial más fuerte contra comprar hardware es que el precio de la nube
   * baja, y una calculadora que no deje meterlo está discutiendo con un
   * espantapájaros.
   */
  readonly caida_precio_nube: number;
};

/** El perfil de un caso medio, medido por el corredor de la fase 7. */
export type PerfilDeCaso = {
  readonly modelo_local: string;
  readonly modelo_nube: string;
  readonly ms_computo_local: number;
  readonly tokens_entrada: number;
  readonly tokens_salida: number;
  /**
   * Qué fracción de los casos el modo híbrido manda a la nube.
   *
   * Sale del corredor, no de una estimación: es la proporción de casos que el
   * local no pudo resolver. Ponerla a ojo convertiría la vista honesta del
   * híbrido en la vista que más conviniera.
   */
  readonly fraccion_a_nube: number;
};

const MS_POR_MES = 30 * 24 * 3_600_000;

/**
 * La utilización que implica el volumen, con el suelo del escenario.
 *
 * **Aquí no hay aritmética de precios**: es una fracción de tiempo. El precio lo
 * sigue calculando `costear`, al que se le entrega esta fracción dentro de la
 * tabla. Esa es la diferencia entre parametrizar la función y reimplementarla.
 *
 * Se limita a 1 porque una máquina no puede computar más de lo que dura el mes.
 * Cuando el volumen la satura, la calculadora lo dice en vez de devolver una
 * utilización del 300 % que abarataría el caso hasta lo absurdo.
 */
export function utilizacionDe(escenario: Escenario, perfil: PerfilDeCaso): {
  readonly utilizacion: number;
  readonly saturada: boolean;
} {
  const ocupacion = (escenario.volumen_mensual * perfil.ms_computo_local) / MS_POR_MES;
  return {
    utilizacion: Math.min(1, Math.max(ocupacion, escenario.utilizacion_minima)),
    saturada: ocupacion > 1,
  };
}

function tablaDelEscenario(
  escenario: Escenario,
  perfil: PerfilDeCaso,
  base: TablaDePrecios,
): TablaDePrecios {
  const nube = new Map(base.nube);

  // La caída de precio se aplica a la tabla, no al resultado. Aplicarla al final
  // daría el mismo número hoy y dejaría de darlo en cuanto el costeo hiciera algo
  // que no fuera multiplicar — un mínimo por petición, un tramo con descuento.
  if (escenario.caida_precio_nube !== 0) {
    const factor = 1 - escenario.caida_precio_nube;
    for (const [id, entrada] of nube) {
      nube.set(id, {
        proveedor: entrada.proveedor,
        modelo: {
          ...entrada.modelo,
          entrada_por_millon: entrada.modelo.entrada_por_millon * factor,
          salida_por_millon: entrada.modelo.salida_por_millon * factor,
        },
      });
    }
  }

  return {
    actualizado: base.actualizado,
    nube,
    maquina: {
      ...base.maquina,
      // El escenario **confirma** la máquina: si el usuario pone cifras, deja de
      // ser provisional para ese cálculo. La proyección real sigue marcada, y por
      // eso la calculadora enseña sus supuestos junto al número igual que el panel.
      estado: 'CONFIRMADA',
      equipo: `escenario: $${escenario.costo_equipo} a ${escenario.vida_util_anios} años`,
      costo_equipo: escenario.costo_equipo,
      vida_util_anios: escenario.vida_util_anios,
      // Derivada del volumen, no tomada del escenario. Es la pieza que hace que
      // el punto de equilibrio exista: sin ella, local y nube serían dos rectas
      // por el origen que nunca se cruzan, y «a partir de qué volumen sale a
      // cuenta comprar» no tendría respuesta.
      utilizacion_asumida: utilizacionDe(escenario, perfil).utilizacion,
      potencia_vatios: escenario.potencia_vatios,
      precio_kwh: escenario.precio_kwh,
      mantenimiento_anual: escenario.mantenimiento_anual,
    },
  };
}

function tramosDeUnCaso(perfil: PerfilDeCaso, modo: 'local' | 'nube'): Tramo[] {
  return modo === 'nube'
    ? [
        {
          destino: 'nube',
          modelo: perfil.modelo_nube,
          tokens_entrada: perfil.tokens_entrada,
          tokens_salida: perfil.tokens_salida,
        },
      ]
    : [{ destino: 'local', modelo: perfil.modelo_local, ms_computo: perfil.ms_computo_local }];
}

export type CostoDeModo = {
  readonly modo: 'nube' | 'local' | 'hibrido';
  readonly por_caso: number;
  readonly mensual: number;
  /** Solo en híbrido: cuántos casos acabaron en la nube y qué costó esa corrección. */
  readonly correccion?: { readonly casos_a_nube: number; readonly costo_extra_mensual: number };
};

/**
 * Lo que cuesta el mes bajo cada despliegue.
 *
 * El híbrido se cobra **entero**: cada caso paga su tramo local, y los que además
 * fueron a la nube pagan los dos. No es «un porcentaje de cada uno» — un caso que
 * empieza en local y acaba en la nube ya gastó el tiempo de cómputo local, y
 * descontarlo haría que el híbrido pareciera más barato de lo que es.
 */
export function costosPorModo(
  escenario: Escenario,
  perfil: PerfilDeCaso,
  base: TablaDePrecios = TABLA,
): readonly CostoDeModo[] {
  const tabla = tablaDelEscenario(escenario, perfil, base);
  const v = escenario.volumen_mensual;

  const nubePorCaso = costear(tramosDeUnCaso(perfil, 'nube'), tabla).monto;
  const localPorCaso = costear(tramosDeUnCaso(perfil, 'local'), tabla).monto;

  const casosANube = Math.round(v * perfil.fraccion_a_nube);
  const hibridoMensual = v * localPorCaso + casosANube * nubePorCaso;

  return [
    { modo: 'nube', por_caso: nubePorCaso, mensual: v * nubePorCaso },
    { modo: 'local', por_caso: localPorCaso, mensual: v * localPorCaso },
    {
      modo: 'hibrido',
      por_caso: v === 0 ? 0 : hibridoMensual / v,
      mensual: hibridoMensual,
      correccion: { casos_a_nube: casosANube, costo_extra_mensual: casosANube * nubePorCaso },
    },
  ];
}

export type Recomendacion = {
  readonly modo: 'nube' | 'local' | 'hibrido';
  readonly por_que: string;
  /** Volumen mensual a partir del cual el local sale más barato que la nube. */
  readonly equilibrio_mensual: number | null;
};

/**
 * El volumen mensual a partir del cual el local sale más barato que la nube.
 *
 * Se busca en vez de resolverse en cerrado, y hay motivo: el costo local por caso
 * depende del volumen a través de la utilización, que va **limitada a 1** y con un
 * suelo. Eso hace la función definida a trozos, y una fórmula cerrada tendría que
 * tratar cada trozo — con el riesgo de que un cambio en `costear` la deje muda sin
 * que ninguna prueba se entere. La búsqueda binaria llama a `costear`, así que
 * sigue a la función a donde vaya.
 *
 * Devuelve `null` cuando no hay cruce en el rango explorado. **No devuelve un
 * número enorme**: «el equilibrio está en 4 millones de casos» se lee como una
 * medida cuando en realidad es un «nunca, para este negocio».
 */
export function volumenDeEquilibrio(
  escenario: Escenario,
  perfil: PerfilDeCaso,
  base: TablaDePrecios = TABLA,
  techo = 1_000_000,
): number | null {
  const localGana = (v: number): boolean => {
    const costos = costosPorModo({ ...escenario, volumen_mensual: v }, perfil, base);
    const nube = costos.find((c) => c.modo === 'nube')?.mensual ?? 0;
    const local = costos.find((c) => c.modo === 'local')?.mensual ?? 0;
    return local < nube;
  };

  if (!localGana(techo)) return null;
  if (localGana(1)) return 1;

  let bajo = 1;
  let alto = techo;
  while (alto - bajo > 1) {
    const medio = Math.floor((bajo + alto) / 2);
    if (localGana(medio)) alto = medio;
    else bajo = medio;
  }

  return alto;
}

/** Qué conviene hoy, con el volumen del escenario. */
export function recomendar(
  escenario: Escenario,
  perfil: PerfilDeCaso,
  base: TablaDePrecios = TABLA,
): Recomendacion {
  const costos = costosPorModo(escenario, perfil, base);
  const nube = costos.find((c) => c.modo === 'nube');
  const local = costos.find((c) => c.modo === 'local');
  const hibrido = costos.find((c) => c.modo === 'hibrido');

  if (nube === undefined || local === undefined || hibrido === undefined) {
    throw new Error('costosPorModo no devolvió los tres modos');
  }

  const masBarato = [nube, local, hibrido].reduce((a, b) => (b.mensual < a.mensual ? b : a));
  const equilibrio = volumenDeEquilibrio(escenario, perfil, base);

  return {
    modo: masBarato.modo,
    equilibrio_mensual: equilibrio,
    por_que:
      `a ${escenario.volumen_mensual} casos al mes, ${masBarato.modo} cuesta ` +
      `$${masBarato.mensual.toFixed(2)} frente a $${nube.mensual.toFixed(2)} en nube y ` +
      `$${local.mensual.toFixed(2)} en local` +
      (escenario.caida_precio_nube !== 0
        ? `, con la nube un ${(escenario.caida_precio_nube * 100).toFixed(0)} % más barata`
        : ''),
  };
}
