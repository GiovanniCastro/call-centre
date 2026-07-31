// La función de costeo. Fuente única de costo del sistema.
//
// Devuelve el monto **y los supuestos que usó**, porque un costo local sin sus
// supuestos —qué equipo, a cuántos años, con qué utilización— es un número que
// invita a una pregunta sin respuesta. El panel muestra las dos cosas juntas, y
// la calculadora de punto de equilibrio de la fase 6B importa esta función en
// lugar de reimplementarla.
//
// Un caso híbrido no es un tercer modo de costeo: es una lista de tramos con
// destinos distintos. Por eso la entrada es `Tramo[]` y no un solo destino.

import { TABLA, type MaquinaDeReferencia, type TablaDePrecios } from './precios.ts';

const MS_POR_HORA = 3_600_000;
const HORAS_POR_ANIO = 365 * 24;
const TOKENS_POR_MILLON = 1_000_000;

/** Un tramo de ejecución en la nube: se cobra por tokens. */
export type TramoNube = {
  readonly destino: 'nube';
  readonly modelo: string;
  readonly tokens_entrada: number;
  readonly tokens_salida: number;
};

/** Un tramo de ejecución local: se cobra por tiempo de cómputo. */
export type TramoLocal = {
  readonly destino: 'local';
  readonly modelo: string;
  readonly ms_computo: number;
};

export type Tramo = TramoNube | TramoLocal;

export type SupuestosNube = {
  readonly modelo: string;
  readonly proveedor: string;
  readonly entrada_por_millon: number;
  readonly salida_por_millon: number;
};

export type SupuestosLocales = {
  readonly equipo: string;
  readonly estado: MaquinaDeReferencia['estado'];
  readonly costo_equipo: number;
  readonly vida_util_anios: number;
  readonly utilizacion_asumida: number;
  readonly potencia_vatios: number;
  readonly precio_kwh: number;
  readonly mantenimiento_anual: number;
  /** Lo que cuesta una hora de cómputo, ya sumadas amortización, energía y mantenimiento. */
  readonly tarifa_hora: number;
  readonly horas_utiles_de_vida: number;
};

export type TramoCosteado = {
  readonly tramo: Tramo;
  readonly monto: number;
  readonly base: 'tokens' | 'tiempo';
};

export type Costeo = {
  readonly monto: number;
  readonly moneda: 'USD';
  /**
   * `true` cuando alguno de los supuestos usados todavía no está confirmado.
   * Toda superficie que muestre un costo provisional tiene que decirlo.
   */
  readonly provisional: boolean;
  readonly desglose: readonly TramoCosteado[];
  readonly supuestos: {
    readonly nube: readonly SupuestosNube[];
    readonly local: SupuestosLocales | null;
    readonly precios_actualizados: string;
  };
};

export class ErrorDeCosteo extends Error {
  override readonly name = 'ErrorDeCosteo';
}

/**
 * Lo que cuesta una hora de cómputo de la máquina de referencia.
 *
 * Amortización del equipo más mantenimiento, ambos prorrateados sobre las horas
 * que la máquina realmente trabaja en su vida útil, más la energía consumida en
 * esa hora. La utilización asumida es el supuesto que más mueve el resultado, y
 * es exactamente por eso que viaja de vuelta en `supuestos`.
 */
function tarifaPorHora(m: MaquinaDeReferencia): {
  tarifa_hora: number;
  horas_utiles_de_vida: number;
} {
  const horas_utiles_de_vida = m.vida_util_anios * HORAS_POR_ANIO * m.utilizacion_asumida;

  const amortizacion_hora = m.costo_equipo / horas_utiles_de_vida;
  const mantenimiento_hora = (m.mantenimiento_anual * m.vida_util_anios) / horas_utiles_de_vida;
  const energia_hora = (m.potencia_vatios / 1000) * m.precio_kwh;

  return {
    tarifa_hora: amortizacion_hora + mantenimiento_hora + energia_hora,
    horas_utiles_de_vida,
  };
}

function exigirFinitoNoNegativo(valor: number, campo: string): void {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new ErrorDeCosteo(
      `${campo} tiene que ser un número finito y no negativo; llegó ${String(valor)}. ` +
        'Un costo calculado sobre un valor inválido se propaga en silencio hasta el panel.',
    );
  }
}

/**
 * Calcula el costo de una ejecución.
 *
 * @param tramos Los tramos por los que pasó el caso, en orden. Un caso que se
 *   desvió de local a nube tiene dos: el local que no alcanzó y el de nube que
 *   lo resolvió. El costo del desvío es la suma de ambos, no solo el segundo.
 * @param tabla La tabla de precios. Se inyecta para que las pruebas puedan
 *   demostrar que cambiar `config/` cambia los totales.
 */
export function costear(tramos: readonly Tramo[], tabla: TablaDePrecios = TABLA): Costeo {
  const desglose: TramoCosteado[] = [];
  const supuestosNube: SupuestosNube[] = [];
  const modelosNubeVistos = new Set<string>();
  let supuestosLocales: SupuestosLocales | null = null;
  let monto = 0;

  for (const tramo of tramos) {
    if (tramo.destino === 'nube') {
      const entrada = tabla.nube.get(tramo.modelo);
      if (entrada === undefined) {
        throw new ErrorDeCosteo(
          `El modelo «${tramo.modelo}» no está en config/precios.json. ` +
            'Un modelo sin precio declarado no se puede costear, y un caso sin costo ' +
            'contamina todos los agregados del panel. Declara su precio o corrige el modelo.',
        );
      }

      exigirFinitoNoNegativo(tramo.tokens_entrada, `tokens_entrada de «${tramo.modelo}»`);
      exigirFinitoNoNegativo(tramo.tokens_salida, `tokens_salida de «${tramo.modelo}»`);

      const { modelo, proveedor } = entrada;
      const costoTramo =
        (tramo.tokens_entrada / TOKENS_POR_MILLON) * modelo.entrada_por_millon +
        (tramo.tokens_salida / TOKENS_POR_MILLON) * modelo.salida_por_millon;

      monto += costoTramo;
      desglose.push({ tramo, monto: costoTramo, base: 'tokens' });

      if (!modelosNubeVistos.has(tramo.modelo)) {
        modelosNubeVistos.add(tramo.modelo);
        supuestosNube.push({
          modelo: tramo.modelo,
          proveedor,
          entrada_por_millon: modelo.entrada_por_millon,
          salida_por_millon: modelo.salida_por_millon,
        });
      }
      continue;
    }

    exigirFinitoNoNegativo(tramo.ms_computo, `ms_computo de «${tramo.modelo}»`);

    const m = tabla.maquina;
    const { tarifa_hora, horas_utiles_de_vida } = tarifaPorHora(m);
    const costoTramo = tarifa_hora * (tramo.ms_computo / MS_POR_HORA);

    monto += costoTramo;
    desglose.push({ tramo, monto: costoTramo, base: 'tiempo' });

    supuestosLocales ??= {
      equipo: m.equipo,
      estado: m.estado,
      costo_equipo: m.costo_equipo,
      vida_util_anios: m.vida_util_anios,
      utilizacion_asumida: m.utilizacion_asumida,
      potencia_vatios: m.potencia_vatios,
      precio_kwh: m.precio_kwh,
      mantenimiento_anual: m.mantenimiento_anual,
      tarifa_hora,
      horas_utiles_de_vida,
    };
  }

  return {
    monto,
    moneda: 'USD',
    provisional: supuestosLocales !== null && supuestosLocales.estado !== 'CONFIRMADA',
    desglose,
    supuestos: {
      nube: supuestosNube,
      local: supuestosLocales,
      precios_actualizados: tabla.actualizado,
    },
  };
}
