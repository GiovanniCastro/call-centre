// El informe comparativo de la fase 7.
//
// **De aquí salen las cifras del portafolio, y de ningún otro sitio.** Es un
// criterio de aceptación, no una recomendación: cualquier número del panel o de
// la página que no se pueda señalar en este informe es un número inventado.
//
// Por eso el informe declara sus huecos en lugar de rellenarlos. Un modo que no
// se pudo correr sale como no corrido con su motivo; poner ceros ahí daría un
// informe completo y falso, que es peor que uno incompleto y honesto.

import { costoPorCasoResuelto } from '../core/costeo/costear.ts';
import type { Ejecucion, Modo, ResultadoDeCaso } from './corredor.ts';

export type ResumenDeModo = {
  readonly modo: Modo;
  readonly corrido: boolean;
  readonly motivo: string | null;
  readonly casos: number;
  readonly aciertos: number;
  readonly resueltos: number;
  readonly escalados: number;
  readonly bloqueados: number;
  readonly descartados: number;
  /** Bloqueados o escalados por falta de sustento verificado. */
  readonly sin_sustento: number;
  readonly con_egreso: number;
  readonly latencia_media_ms: number;
  readonly latencia_p95_ms: number;
  readonly costo_total: number;
  readonly costo_por_resuelto: number | null;
  /** Si algún tramo se costeó con supuestos sin confirmar. */
  readonly costo_provisional: boolean;
  readonly perimetro: { altos: number; retenidos: number; escapados: number };
};

function percentil(valores: readonly number[], p: number): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, indice)] ?? 0;
}

export function resumir(ejecucion: Ejecucion): ResumenDeModo {
  const r = ejecucion.resultados;
  const resueltos = r.filter((x) => x.resultado === 'resuelto').length;
  const latencias = r.map((x) => x.latencia_ms);
  const costo = r.reduce((s, x) => s + x.costo, 0);

  return {
    modo: ejecucion.modo,
    corrido: ejecucion.corrido,
    motivo: ejecucion.motivo,
    casos: r.length,
    aciertos: r.filter((x) => x.acerto).length,
    resueltos,
    escalados: r.filter((x) => x.resultado === 'escalado_humano').length,
    bloqueados: r.filter((x) => x.resultado === 'bloqueado').length,
    descartados: r.filter((x) => x.resultado === 'descartado').length,
    sin_sustento: r.filter((x) => x.sustento !== null && x.sustento < 1).length,
    con_egreso: r.filter((x) => x.hubo_egreso).length,
    latencia_media_ms:
      latencias.length === 0 ? 0 : latencias.reduce((s, v) => s + v, 0) / latencias.length,
    latencia_p95_ms: percentil(latencias, 95),
    costo_total: costo,
    // La división vive en src/core/costeo/: es aritmética de precios, y la
    // calculadora de la fase 6B llamará a la misma función.
    costo_por_resuelto: costoPorCasoResuelto(costo, resueltos),
    costo_provisional: r.some((x) => x.costo_provisional),
    perimetro: ejecucion.perimetro,
  };
}

export type PorCategoria = {
  readonly categoria: string;
  readonly casos: number;
  readonly aciertos: number;
  readonly fallos: readonly { readonly caso_id: string; readonly por_que: string }[];
};

export function porCategoria(resultados: readonly ResultadoDeCaso[]): readonly PorCategoria[] {
  const mapa = new Map<string, ResultadoDeCaso[]>();
  for (const r of resultados) {
    const lista = mapa.get(r.categoria) ?? [];
    lista.push(r);
    mapa.set(r.categoria, lista);
  }

  return [...mapa.entries()]
    .map(([categoria, lista]) => ({
      categoria,
      casos: lista.length,
      aciertos: lista.filter((x) => x.acerto).length,
      fallos: lista
        .filter((x) => !x.acerto)
        .map((x) => ({ caso_id: x.caso_id, por_que: x.por_que_no ?? x.error ?? 'sin motivo' })),
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria));
}

/**
 * Los vigías que el ciclo de caso monta, y por tanto los que el lote puede
 * disparar.
 *
 * Los cuatro observadores de la fase 4B‑2 —proveedor, vigencia, cola y silencio—
 * no están montados en `atender()`: vigilan el sistema, no el caso. El lote no
 * puede dispararlos y este informe lo dice en vez de callarlo, porque un criterio
 * que pide «casos que disparen cada vigía» necesita saber cuáles quedan fuera del
 * alcance del lote y por qué.
 */
export const VIGIAS_DEL_CICLO = ['perimetro', 'presupuesto', 'bucle', 'sustento'] as const;

export type ActuacionesPorVigia = {
  readonly vigia: string;
  readonly casos: readonly string[];
};

export function porVigia(resultados: readonly ResultadoDeCaso[]): readonly ActuacionesPorVigia[] {
  return VIGIAS_DEL_CICLO.map((vigia) => ({
    vigia,
    casos: resultados.filter((r) => r.vigias_que_actuaron.includes(vigia)).map((r) => r.caso_id),
  }));
}

function pct(parte: number, total: number): string {
  return total === 0 ? '—' : `${((parte / total) * 100).toFixed(0)} %`;
}

/**
 * Una cifra de dinero, o por qué no hay cifra.
 *
 * `PROVISIONAL` en vez del número no es prudencia: `config/maquina-referencia.json`
 * dice «no se publica ninguna cifra de costo local hasta que este archivo diga
 * CONFIRMADA», y con la máquina sin caracterizar la tarifa horaria vale cero. La
 * primera corrida del lote imprimió `$0.0000` por caso resuelto — un número que se
 * lee como «gratis», que se puede citar, y que es falso. De las cifras que este
 * proyecto podría enseñar mal, esa es la peor.
 */
function dinero(n: number | null, provisional: boolean): string {
  if (provisional) return 'PROVISIONAL';
  return n === null ? '—' : `$${n.toFixed(4)}`;
}

/** El informe en texto. Lo que se pega en el PR y de donde salen las cifras. */
export function comoTexto(ejecuciones: readonly Ejecucion[]): string {
  const l: string[] = [];
  const resumenes = ejecuciones.map(resumir);

  l.push('');
  l.push('── Comparativa por modo ─────────────────────────────────────────────');
  l.push('');
  l.push('  modo      casos  acierto  resueltos  escalados  bloq.  egreso  lat.media  $/resuelto');

  for (const s of resumenes) {
    if (!s.corrido) {
      l.push(`  ${s.modo.padEnd(9)} NO CORRIDO — ${s.motivo ?? ''}`);
      continue;
    }
    l.push(
      `  ${s.modo.padEnd(9)} ${String(s.casos).padStart(5)}  ${pct(s.aciertos, s.casos).padStart(7)}  ` +
        `${String(s.resueltos).padStart(9)}  ${String(s.escalados).padStart(9)}  ` +
        `${String(s.bloqueados).padStart(5)}  ${String(s.con_egreso).padStart(6)}  ` +
        `${s.latencia_media_ms.toFixed(0).padStart(8)}ms  ${dinero(s.costo_por_resuelto, s.costo_provisional).padStart(11)}`,
    );
  }

  if (resumenes.some((s) => s.corrido && s.costo_provisional)) {
    l.push('');
    l.push(
      '  PROVISIONAL: la máquina de referencia no está caracterizada, así que su tarifa\n' +
        '  horaria vale cero y el costo por caso saldría $0.0000 — que se lee como «gratis»\n' +
        '  y no lo es. Rellena config/maquina-referencia.json y pon su estado en CONFIRMADA;\n' +
        '  el informe imprimirá la cifra sola, sin tocar código.',
    );
  }

  l.push('');
  l.push('── Vigía de perímetro ───────────────────────────────────────────────');
  for (const s of resumenes) {
    if (!s.corrido) continue;
    const p = s.perimetro;
    l.push(
      p.altos === 0
        ? `  ${s.modo.padEnd(9)} sin casos de sensibilidad alta: no hay nada que afirmar`
        : `  ${s.modo.padEnd(9)} ${p.retenidos} de ${p.altos} retenidos · ${p.escapados} escapados`,
    );
  }

  // «12 de 12 retenidos» en modo local es cierto y VACUO: en ese modo no había
  // ninguna llamada externa que retener. Es el mismo defecto que «0 de 0 retenidos
  // no prueba nada», un piso más arriba — y más peligroso, porque este sí trae un
  // número grande y se puede citar. La cifra solo pesa donde el reparto habría
  // mandado el caso fuera y algo lo detuvo.
  if (resumenes.some((s) => s.corrido && s.modo === 'local' && s.perimetro.altos > 0)) {
    l.push('');
    l.push(
      '  En modo LOCAL esta cifra no demuestra contención: nada iba a salir de todas\n' +
        '  formas, así que retener no costó nada. La afirmación —«ni forzando el\n' +
        '  despliegue más agresivo sale un dato sensible»— se prueba en los modos nube\n' +
        '  e híbrido, donde el reparto habría mandado esos casos fuera y la regla dura\n' +
        '  los retuvo. Hasta que corran, queda sin probar por el lote.',
    );
  }

  for (const ejecucion of ejecuciones) {
    if (!ejecucion.corrido) continue;
    const conIncidente = ejecucion.resultados.filter((r) => r.incidentes.length > 0);
    if (conIncidente.length === 0) continue;

    l.push('');
    l.push(`── Modo ${ejecucion.modo}: incidentes de seguridad ${'─'.repeat(Math.max(0, 30 - ejecucion.modo.length))}`);
    const porClase = new Map<string, string[]>();
    for (const r of conIncidente) {
      for (const clase of r.incidentes) porClase.set(clase, [...(porClase.get(clase) ?? []), r.caso_id]);
    }
    for (const [clase, casos] of [...porClase.entries()].sort()) {
      l.push(`  ${clase.padEnd(14)} ${String(casos.length).padStart(3)} · ${casos.slice(0, 5).join(', ')}${casos.length > 5 ? ', …' : ''}`);
    }
    l.push(
      '  Uno a uno, sin agrupar por huella. Un caso de inyección se juzga por esto y\n' +
        '  por que la respuesta no filtre nada, NO por si escaló: escalar una inyección a\n' +
        '  un humano es un desenlace correcto, y puntuarlo como fallo empujaría a quien\n' +
        '  quisiera subir la nota a afinar el sistema hacia responder inyecciones.',
    );
  }

  for (const ejecucion of ejecuciones) {
    if (!ejecucion.corrido) continue;
    l.push('');
    l.push(`── Modo ${ejecucion.modo}: qué vigía actuó ${'─'.repeat(Math.max(0, 37 - ejecucion.modo.length))}`);
    for (const v of porVigia(ejecucion.resultados)) {
      l.push(
        v.casos.length === 0
          ? `  ${v.vigia.padEnd(14)} NO SE DISPARÓ en ninguno de los ${ejecucion.resultados.length} casos`
          : `  ${v.vigia.padEnd(14)} ${String(v.casos.length).padStart(3)} casos · ${v.casos.slice(0, 4).join(', ')}${v.casos.length > 4 ? ', …' : ''}`,
      );
    }
    l.push(
      '  Los observadores de la 4B-2 —proveedor, vigencia, cola, silencio— no los monta\n' +
        '  el ciclo de caso: vigilan el sistema, no el caso. El lote no puede dispararlos.',
    );
  }

  for (const ejecucion of ejecuciones) {
    if (!ejecucion.corrido) continue;
    l.push('');
    l.push(`── Modo ${ejecucion.modo}: por categoría ${'─'.repeat(Math.max(0, 40 - ejecucion.modo.length))}`);
    for (const c of porCategoria(ejecucion.resultados)) {
      l.push(`  ${c.categoria.padEnd(22)} ${String(c.aciertos).padStart(3)}/${String(c.casos).padEnd(3)} ${pct(c.aciertos, c.casos)}`);
      for (const fallo of c.fallos.slice(0, 3)) {
        l.push(`      ✗ ${fallo.caso_id}: ${fallo.por_que.slice(0, 90)}`);
      }
      if (c.fallos.length > 3) l.push(`      … y ${c.fallos.length - 3} más`);
    }
  }

  l.push('');
  l.push(
    '  Toda cifra de esta tabla sale de una ejecución registrada. Un modo NO CORRIDO\n' +
      '  no tiene ceros: tiene un hueco declarado, porque un informe completo y falso\n' +
      '  es peor que uno incompleto y honesto.',
  );
  l.push('');

  return l.join('\n');
}
