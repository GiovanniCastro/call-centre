// Cruce entre lo que la máquina tiene y lo que cada modelo pide.
//
// Tres veredictos, y la distinción entre el segundo y el tercero es el sentido
// de todo esto:
//
//   cabe_en_vram   — corre en la tarjeta, a la velocidad que se espera.
//   cabe_lento     — arranca, pero se reparte con la RAM del sistema. No falla;
//                    va de decenas de fichas por segundo a unidades.
//   no_cabe        — ni con la RAM del sistema.
//
// Un informe que solo dijera «sí / no» pondría `cabe_lento` en la columna del
// «sí», y entonces alguien mediría el costo local del proyecto contra un modelo
// derramado a RAM. Esa medición haría ganar a la nube por una razón que no tiene
// nada que ver con la nube.

import { z } from 'zod';

import catalogoCrudo from '../../config/modelos-locales.json' with { type: 'json' };
import type { Maquina } from './maquina.ts';

const EsquemaCandidato = z.object({
  modelo: z.string().min(1),
  tamano_gb: z.number().positive(),
  verificado: z.boolean(),
  proposito: z.string().min(1),
  nota: z.string().optional(),
});

const EsquemaCatalogo = z.object({
  version: z.literal(1),
  heuristica: z.object({ margen_vram_gb: z.number().nonnegative() }),
  candidatos: z.array(EsquemaCandidato).min(1),
});

export type Candidato = z.infer<typeof EsquemaCandidato>;

function validar(valor: unknown): z.infer<typeof EsquemaCatalogo> {
  const resultado = EsquemaCatalogo.safeParse(valor);
  if (!resultado.success) {
    throw new Error(`config/modelos-locales.json no valida: ${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}

export const CATALOGO = validar(catalogoCrudo);

export type Veredicto = 'cabe_en_vram' | 'cabe_lento' | 'no_cabe';

export type Evaluacion = {
  readonly modelo: string;
  readonly proposito: string;
  readonly tamano_gb: number;
  readonly verificado: boolean;
  readonly instalado: boolean;
  readonly veredicto: Veredicto;
  readonly necesita_gb: number;
  /** Qué haría falta para subir de veredicto. Vacío si ya está en el mejor. */
  readonly para_mejorar: string | null;
  readonly explicacion: string;
};

export type ModeloInstalado = { readonly nombre: string; readonly bytes: number };

/**
 * @param instalados Lo que Ollama reporta ahora mismo. Su tamaño es MEDIDO y
 *   pisa al declarado del catálogo: si el modelo está en disco, no hay por qué
 *   creerse una tabla.
 */
export function evaluar(
  maquina: Maquina,
  instalados: readonly ModeloInstalado[] = [],
  catalogo = CATALOGO,
): readonly Evaluacion[] {
  const margen = catalogo.heuristica.margen_vram_gb;
  const medidos = new Map(
    instalados.map((m) => [m.nombre, Math.round((m.bytes / 1024 ** 3) * 10) / 10]),
  );

  // Los instalados que nadie declaró entran igual: el informe tiene que hablar
  // de lo que hay, no solo de lo que estaba previsto.
  const declarados = new Set(catalogo.candidatos.map((c) => c.modelo));
  const extra: Candidato[] = [...medidos.keys()]
    .filter((nombre) => !declarados.has(nombre))
    .map((nombre) => ({
      modelo: nombre,
      tamano_gb: medidos.get(nombre) ?? 0,
      verificado: true,
      proposito: 'sin declarar',
      nota: 'Instalado en la máquina pero no declarado en config/modelos-locales.json.',
    }));

  return [...catalogo.candidatos, ...extra].map((candidato) => {
    const tamano = medidos.get(candidato.modelo) ?? candidato.tamano_gb;
    const necesita = Math.round((tamano + margen) * 10) / 10;
    const instalado = medidos.has(candidato.modelo);
    const vram = maquina.vram_util_gb;

    let veredicto: Veredicto;
    let explicacion: string;
    let para_mejorar: string | null = null;

    if (vram !== null && necesita <= vram) {
      veredicto = 'cabe_en_vram';
      explicacion = `necesita ~${necesita} GB y hay ${vram} GB de VRAM`;
    } else if (necesita <= maquina.ram_gb) {
      veredicto = 'cabe_lento';
      const falta = vram === null ? necesita : Math.round((necesita - vram) * 10) / 10;
      explicacion =
        vram === null
          ? `no hay cifra de VRAM fiable; con ${maquina.ram_gb} GB de RAM arrancaría, pero sobre CPU`
          : `necesita ~${necesita} GB y solo hay ${vram} GB de VRAM: se reparte con la RAM y va lento`;
      para_mejorar =
        vram === null
          ? 'una GPU NVIDIA con VRAM suficiente, o comprobar que `nvidia-smi` está en el PATH'
          : `una GPU con al menos ${necesita} GB de VRAM (faltan ${falta} GB), o un modelo más pequeño`;
    } else {
      veredicto = 'no_cabe';
      explicacion = `necesita ~${necesita} GB y la máquina tiene ${maquina.ram_gb} GB de RAM en total`;
      para_mejorar = `al menos ${necesita} GB de RAM para que arranque, y ${necesita} GB de VRAM para que además vaya rápido`;
    }

    return {
      modelo: candidato.modelo,
      proposito: candidato.proposito,
      tamano_gb: tamano,
      verificado: instalado ? true : candidato.verificado,
      instalado,
      veredicto,
      necesita_gb: necesita,
      para_mejorar,
      explicacion,
    };
  });
}

/**
 * El mejor candidato de redacción que corre a velocidad plena.
 *
 * **Un tamaño verificado gana a uno mayor sin verificar.** A igualdad de
 * veredicto el modelo más grande es el más capaz, pero recomendar el más grande
 * apoyándose en una cifra declarada sería fiar la decisión a un número que nadie
 * ha medido — que es justo lo que este proyecto no hace con las cifras. Si el
 * mayor sin verificar interesa, se instala y entonces se mide.
 */
export function mejorLocalParaRedactar(
  evaluaciones: readonly Evaluacion[],
): Evaluacion | null {
  const aptos = evaluaciones
    .filter((e) => e.veredicto === 'cabe_en_vram' && e.proposito === 'redaccion')
    .sort((a, b) => Number(b.verificado) - Number(a.verificado) || b.tamano_gb - a.tamano_gb);

  return aptos[0] ?? null;
}

/** Candidatos que caben y son mayores que el recomendado, pero sin medir. */
export function mayoresSinVerificar(
  evaluaciones: readonly Evaluacion[],
  recomendado: Evaluacion | null,
): readonly Evaluacion[] {
  if (recomendado === null) return [];
  return evaluaciones.filter(
    (e) =>
      e.veredicto === 'cabe_en_vram' &&
      e.proposito === 'redaccion' &&
      !e.verificado &&
      e.tamano_gb > recomendado.tamano_gb,
  );
}
