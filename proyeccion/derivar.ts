// De agregados de PostgreSQL a los documentos que lee el panel.
//
// El criterio de aceptación de la fase 6 que más cuesta cumplir no es ninguna
// regla de Firebase: es **«dos métricas que cuenten lo mismo se derivan del mismo
// campo»**. La maqueta original del panel enseñaba dos cifras distintas de
// escalados en la misma pantalla, y ese defecto no se arregla revisando las dos
// —se arregla haciendo que solo exista una.
//
// Por eso aquí no hay dos cálculos que casualmente coinciden. Hay un `recuento`
// que se calcula una vez, y tanto el KPI de arriba como el reparto de abajo leen
// de él. Que cuadren no es una comprobación: es que son el mismo número mirado
// dos veces.

import { costoPorCasoResuelto } from '../src/core/costeo/costear.ts';
import type {
  LatenciaDePrimeraRespuesta,
  RecuentoDeEgreso,
  RecuentoDeEscalado,
  RecuentoDeSustento,
  RecuentoPorDestino,
  RecuentoPorResultado,
  Ventana,
} from '../src/repos/agregados.ts';
import type { Resultado } from '../src/telemetry/evento.ts';

export type Agregados = {
  readonly ventana: Ventana;
  readonly por_resultado: readonly RecuentoPorResultado[];
  readonly por_destino: readonly RecuentoPorDestino[];
  readonly egreso: readonly RecuentoDeEgreso[];
  readonly escalados: readonly RecuentoDeEscalado[];
  readonly sustento: RecuentoDeSustento;
  readonly latencias: LatenciaDePrimeraRespuesta;
  /** Supuestos del costeo local. Van con la cifra, nunca aparte. */
  readonly supuestos_costeo: Record<string, unknown>;
  readonly costo_provisional: boolean;
};

export type Proyeccion = {
  readonly generado_en: string;
  readonly ventana: Ventana;
  readonly kpi: Kpi;
  readonly reparto: Reparto;
  readonly perimetro: readonly PerimetroPorClase[];
  readonly escalados_por_motivo: readonly RecuentoDeEscalado[];
  readonly sustento: { totales: number; con_procedencia: number; proporcion: number | null };
  readonly latencia: LatenciaDePrimeraRespuesta;
  readonly costeo: { provisional: boolean; supuestos: Record<string, unknown> };
};

export type Kpi = {
  readonly casos: number;
  readonly resueltos: number;
  readonly escalados_a_humano: number;
  readonly bloqueados: number;
  readonly descartados: number;
  /** Fracción de casos resueltos sin que interviniera una persona. */
  readonly resueltos_sin_intervencion: number | null;
  /**
   * Costo por caso resuelto, o `null`.
   *
   * `null` cuando no se resolvió ninguno —cero diría «gratis», que es lo
   * contrario de la verdad— y la marca `provisional` viaja aparte, en `costeo`,
   * para que el panel no pueda enseñar el número sin ella.
   */
  readonly costo_por_resuelto: number | null;
};

export type Reparto = {
  readonly por_destino: readonly RecuentoPorDestino[];
  /** El MISMO número que `kpi.escalados_a_humano`, leído del mismo recuento. */
  readonly escalados_a_humano: number;
  readonly costo_total: number;
};

export type PerimetroPorClase = {
  readonly clase_sensibilidad: string;
  /** El denominador. Sin él, «0 escapados» no afirma nada. */
  readonly casos: number;
  readonly con_egreso: number;
  readonly retenidos: number;
  /** Cómo se lee, con el denominador cero resuelto por escrito. */
  readonly como_texto: string;
};

function recuentoPorResultado(filas: readonly RecuentoPorResultado[]): Map<Resultado, number> {
  const mapa = new Map<Resultado, number>();
  for (const f of filas) mapa.set(f.resultado, f.casos);
  return mapa;
}

function proporcion(parte: number, total: number): number | null {
  // Denominador cero devuelve `null`, no 0 ni 1. Las dos serían afirmaciones
  // sacadas de ninguna observación, y el panel las enseñaría como porcentaje.
  return total === 0 ? null : parte / total;
}

export function derivar(agregados: Agregados, generado_en: string): Proyeccion {
  // UNA sola vez. Todo lo que cuente desenlaces lee de aquí.
  const recuento = recuentoPorResultado(agregados.por_resultado);
  const resueltos = recuento.get('resuelto') ?? 0;
  const escalados = recuento.get('escalado_humano') ?? 0;
  const bloqueados = recuento.get('bloqueado') ?? 0;
  const descartados = recuento.get('descartado') ?? 0;
  const casos = resueltos + escalados + bloqueados + descartados;

  const costoTotal = agregados.por_destino.reduce((s, d) => s + Number(d.costo ?? 0), 0);

  return {
    generado_en,
    ventana: agregados.ventana,
    kpi: {
      casos,
      resueltos,
      escalados_a_humano: escalados,
      bloqueados,
      descartados,
      resueltos_sin_intervencion: proporcion(resueltos, casos),
      // La aritmética de precios vive en src/core/costeo/, y es la MISMA función
      // que usan el informe de la fase 7 y la calculadora de la 6B.
      costo_por_resuelto: costoPorCasoResuelto(costoTotal, resueltos),
    },
    reparto: {
      por_destino: agregados.por_destino,
      // No se recalcula: es la misma variable. Un segundo cálculo que «también»
      // cuente escalados es un segundo número esperando a divergir.
      escalados_a_humano: escalados,
      costo_total: costoTotal,
    },
    perimetro: agregados.egreso.map((e) => ({
      clase_sensibilidad: e.clase_sensibilidad,
      casos: e.casos,
      con_egreso: e.con_egreso,
      retenidos: e.casos - e.con_egreso,
      como_texto:
        e.casos === 0
          ? 'sin casos de esta clase: no hay nada que afirmar'
          : `${e.casos - e.con_egreso} de ${e.casos} retenidos`,
    })),
    escalados_por_motivo: agregados.escalados,
    sustento: {
      totales: agregados.sustento.campos_totales,
      con_procedencia: agregados.sustento.campos_con_procedencia,
      proporcion: proporcion(
        agregados.sustento.campos_con_procedencia,
        agregados.sustento.campos_totales,
      ),
    },
    latencia: agregados.latencias,
    costeo: { provisional: agregados.costo_provisional, supuestos: agregados.supuestos_costeo },
  };
}
