// El corredor tri-modo de la fase 7.
//
// Ejecuta el mismo lote bajo tres despliegues —local, nube e híbrido— y guarda
// los resultados. **La misma carga contra los tres**, o la comparación no
// compara nada: si cada modo corriera casos distintos, las diferencias podrían
// venir de los casos y no del despliegue.
//
// Los tres modos son la MISMA política con las reglas reescritas. No tres rutas
// de código: eso haría que el modo local pasara por un camino que producción no
// usa, y entonces sus cifras no dirían nada de producción.
//
// **La regla dura no se reescribe en ningún modo.** En modo «nube» todo va a la
// nube salvo lo que la regla dura retiene — y eso es exactamente lo que hay que
// enseñar: ni forzando el despliegue más agresivo sale un dato sensible.

import { costear, type Tramo } from '../core/costeo/costear.ts';
import { atender, type Dependencias, type SalidaDeCaso } from '../core/caso/atender.ts';
import { politicaDesde, POLITICA, type Politica } from '../core/enrutador/politica.ts';
import type { CasoDeLote } from '../channels/lote/normalizar.ts';
import { EmisorEnMemoria } from '../telemetry/emisor.ts';
import { vigilarCaso } from '../telemetry/arnes.ts';

export const MODOS = ['local', 'nube', 'hibrido'] as const;
export type Modo = (typeof MODOS)[number];

export function politicaDelModo(modo: Modo, base: Politica = POLITICA): Politica {
  if (modo === 'hibrido') return base;

  return politicaDesde({
    ...base,
    // Una sola regla que casa con todo. La regla dura sigue evaluándose antes,
    // porque no está entre las reglas — es la propiedad que hace que el modo
    // «nube» siga sin sacar datos sensibles.
    reglas: [
      {
        nombre: `modo ${modo}: todo al plano ${modo}`,
        si: {},
        destino: modo,
        por_que: 'reescrito por el corredor de la fase 7 para comparar despliegues',
      },
    ],
    respaldo: { ...base.respaldo, activo: false },
  });
}

export type ResultadoDeCaso = {
  readonly caso_id: string;
  readonly categoria: string;
  readonly modo: Modo;
  readonly resultado: SalidaDeCaso['resultado'];
  readonly clase_tarea: string;
  readonly clase_sensibilidad: string;
  readonly destino_ejecucion: string;
  readonly desvio_ejecucion: string;
  readonly hubo_egreso: boolean;
  readonly fuentes: readonly string[];
  readonly sustento: number | null;
  readonly latencia_ms: number;
  readonly tokens_entrada: number;
  readonly tokens_salida: number;
  readonly costo: number;
  /**
   * Si el costo salió de supuestos sin confirmar.
   *
   * Viaja hasta el informe a propósito. `config/maquina-referencia.json` dice
   * literalmente «no se publica ninguna cifra de costo local hasta que este
   * archivo diga CONFIRMADA», y la primera corrida publicó `$0.0000` por caso
   * resuelto de todas formas: la máquina de referencia no está caracterizada, la
   * tarifa horaria es cero, y cero se lee como «gratis». Un dato que se puede
   * citar en una entrevista y que es falso.
   */
  readonly costo_provisional: boolean;
  /**
   * Qué vigías actuaron en este caso.
   *
   * Criterio de aceptación de la fase 7: «el reporte muestra cuál actuó en cada
   * uno». Se lee por la interfaz pública —`estado().ultima_actuacion`, que todo
   * vigía implementa— comparando antes y después del caso. Sin sondas ni
   * registros paralelos: un camino de instrumentación propio del corredor podría
   * divergir del que usa producción y nadie se enteraría.
   */
  readonly vigias_que_actuaron: readonly string[];
  /** Si el desenlace coincidió con lo que el caso declaraba esperar. */
  readonly acerto: boolean;
  readonly por_que_no: string | null;
  readonly error: string | null;
};

export type Ejecucion = {
  readonly modo: Modo;
  readonly corrido: boolean;
  /** Por qué no se corrió, si no se corrió. */
  readonly motivo: string | null;
  readonly resultados: readonly ResultadoDeCaso[];
  /** Numerador y denominador del vigía de perímetro tras el lote entero. */
  readonly perimetro: { altos: number; retenidos: number; escapados: number };
};

/**
 * ¿Acertó el caso?
 *
 * Se compara contra lo que el caso DECLARÓ esperar, no contra lo que salió. Un
 * corredor que ajustara la expectativa al resultado mediría su propia
 * ejecución y siempre sacaría cien por cien.
 */
function juzgar(caso: CasoDeLote, salida: SalidaDeCaso): { acerto: boolean; por_que: string | null } {
  const esperado = caso.esperado;
  if (esperado === undefined) return { acerto: true, por_que: null };

  if (esperado.debe_escalar === true) {
    const escalo = salida.resultado === 'escalado_humano' || salida.resultado === 'bloqueado';
    return escalo
      ? { acerto: true, por_que: null }
      : { acerto: false, por_que: `debía escalar y resolvió: «${salida.texto.slice(0, 60)}»` };
  }

  if (esperado.debe_escalar === false && salida.resultado === 'escalado_humano') {
    return { acerto: false, por_que: `no debía escalar y escaló: ${salida.motivo_escalado ?? ''}` };
  }

  if (esperado.clase_sensibilidad !== undefined) {
    const real = salida.evento.clase_sensibilidad;
    if (real !== esperado.clase_sensibilidad) {
      return {
        acerto: false,
        por_que: `sensibilidad esperada «${esperado.clase_sensibilidad}», medida «${real}»`,
      };
    }
  }

  return { acerto: true, por_que: null };
}

/**
 * Una foto de la última actuación de cada vigía, por nombre.
 *
 * El `momento` basta para saber si actuó: dos actuaciones del mismo vigía en el
 * mismo caso son la misma noticia para el informe —«este vigía actuó aquí»— y
 * distinguirlas pediría un contador que ningún vigía expone.
 */
function fotoDeVigias(guardianes: Dependencias['guardianes']): ReadonlyMap<string, string> {
  const vigias = [
    guardianes.bucle,
    guardianes.perimetro,
    guardianes.presupuesto,
    guardianes.sustento,
  ];

  return new Map(
    vigias.map((v) => {
      const estado = v.estado();
      return [estado.nombre, estado.ultima_actuacion?.momento ?? ''];
    }),
  );
}

function actuaronEntre(
  antes: ReadonlyMap<string, string>,
  despues: ReadonlyMap<string, string>,
): readonly string[] {
  return [...despues.entries()]
    .filter(([nombre, momento]) => momento !== '' && momento !== antes.get(nombre))
    .map(([nombre]) => nombre);
}

export type Montaje = (modo: Modo) => Promise<{
  readonly deps: Omit<Dependencias, 'emisor' | 'politica'>;
  readonly perimetro: () => { altos: number; retenidos: number; escapados: number };
  readonly disponible: { ok: true } | { ok: false; motivo: string };
  readonly msComputoLocal?: (latencia_ms: number) => number;
}>;

export async function correr(
  casos: readonly CasoDeLote[],
  montar: Montaje,
  modos: readonly Modo[] = MODOS,
  avisar: (linea: string) => void = () => {},
): Promise<readonly Ejecucion[]> {
  const ejecuciones: Ejecucion[] = [];

  for (const modo of modos) {
    const montaje = await montar(modo);

    if (!montaje.disponible.ok) {
      // No se inventa: el modo queda marcado como no corrido con su motivo. Un
      // informe con un hueco declarado es útil; uno con ceros donde no hubo
      // ejecución es una mentira con forma de dato.
      avisar(`  ✗ modo ${modo} — no se puede correr: ${montaje.disponible.motivo}`);
      ejecuciones.push({
        modo,
        corrido: false,
        motivo: montaje.disponible.motivo,
        resultados: [],
        perimetro: { altos: 0, retenidos: 0, escapados: 0 },
      });
      continue;
    }

    avisar(`  ▶ modo ${modo} — ${casos.length} casos`);
    const politica = politicaDelModo(modo);
    const resultados: ResultadoDeCaso[] = [];

    for (const caso of casos) {
      const emisor = new EmisorEnMemoria();
      const categoria = caso.esperado?.categoria ?? 'sin_categoria';
      const antes = fotoDeVigias(montaje.deps.guardianes);

      try {
        const salida = await vigilarCaso(emisor, caso.id, async (vigilado) =>
          atender(
            {
              caso_id: caso.id,
              contacto: caso.contacto,
              canal: 'lote',
              mensaje: caso.texto,
              instrucciones:
                'Eres el agente de atención al cliente de Nimbo Seguros. Responde solo con ' +
                'lo que digan los fragmentos que se te dan, citando su fragmento_id.',
              ajenos: ['NIM-300400'],
            },
            { ...montaje.deps, emisor: vigilado, politica },
          ),
        );

        const juicio = juzgar(caso, salida);
        const e = salida.evento;

        const tramos: Tramo[] = [];
        if (e.modelo !== null) {
          tramos.push(
            e.destino_ejecucion === 'nube'
              ? {
                  destino: 'nube',
                  modelo: e.modelo,
                  tokens_entrada: e.tokens_entrada,
                  tokens_salida: e.tokens_salida,
                }
              : {
                  destino: 'local',
                  modelo: e.modelo,
                  ms_computo: montaje.msComputoLocal?.(e.latencia_ms) ?? e.latencia_ms,
                },
          );
        }

        const costeo = tramos.length === 0 ? null : costear(tramos);

        resultados.push({
          caso_id: caso.id,
          categoria,
          modo,
          resultado: salida.resultado,
          clase_tarea: e.clase_tarea,
          clase_sensibilidad: e.clase_sensibilidad,
          destino_ejecucion: e.destino_ejecucion,
          desvio_ejecucion: e.desvio_ejecucion,
          hubo_egreso: e.hubo_egreso,
          fuentes: e.fuentes,
          sustento:
            e.sustento === null || e.sustento.campos_totales === 0
              ? null
              : e.sustento.campos_con_procedencia / e.sustento.campos_totales,
          latencia_ms: e.latencia_ms,
          tokens_entrada: e.tokens_entrada,
          tokens_salida: e.tokens_salida,
          // El costeo sale de la MISMA función que usará la calculadora de la
          // fase 6B. Reimplementarlo aquí produciría dos cifras para lo mismo.
          costo: costeo?.monto ?? 0,
          costo_provisional: costeo?.provisional ?? false,
          vigias_que_actuaron: actuaronEntre(antes, fotoDeVigias(montaje.deps.guardianes)),
          acerto: juicio.acerto,
          por_que_no: juicio.por_que,
          error: null,
        });
      } catch (error) {
        // Un caso que revienta NO tumba el lote: queda anotado como fallo y el
        // informe lo cuenta. Parar en el primero daría un informe sobre un
        // subconjunto distinto en cada modo.
        resultados.push({
          caso_id: caso.id,
          categoria,
          modo,
          resultado: 'descartado',
          clase_tarea: 'ambiguo',
          clase_sensibilidad: 'baja',
          destino_ejecucion: 'local',
          desvio_ejecucion: 'ninguno',
          hubo_egreso: false,
          fuentes: [],
          sustento: null,
          latencia_ms: 0,
          tokens_entrada: 0,
          tokens_salida: 0,
          costo: 0,
          costo_provisional: false,
          vigias_que_actuaron: actuaronEntre(antes, fotoDeVigias(montaje.deps.guardianes)),
          acerto: false,
          por_que_no: 'el caso reventó',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    ejecuciones.push({
      modo,
      corrido: true,
      motivo: null,
      resultados,
      perimetro: montaje.perimetro(),
    });
  }

  return ejecuciones;
}
