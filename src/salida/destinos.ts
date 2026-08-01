// Carga y validación de la lista blanca de salida. Único módulo que lee
// `config/destinos.json`.
//
// Como en `costeo/precios.ts`, valida al cargar y no al primer uso: una lista
// malformada tiene que reventar al arrancar. El modo de fallo que esto evita es
// el peor de los posibles — una lista que no valida y se trata como vacía
// bloquearía todo, o peor, una que se trata como permisiva dejaría pasar todo.

import { z } from 'zod';

import crudo from '../../config/destinos.json' with { type: 'json' };

const EsquemaDestino = z.object({
  clase: z.union([z.literal('externo'), z.literal('perimetro')]),
  para: z.string().min(1),
  esquemas: z.array(z.union([z.literal('http'), z.literal('https')])).min(1),
  egreso: z.boolean(),
});

const EsquemaDestinos = z.object({
  version: z.literal(1),
  destinos: z.record(z.string(), EsquemaDestino),
  permitir_por_entorno: z.object({ variable: z.string().min(1) }),
});

export type Destino = z.infer<typeof EsquemaDestino>;
export type ListaDeDestinos = {
  readonly porAnfitrion: ReadonlyMap<string, Destino>;
  /** Los añadidos por entorno, para poder avisar de ellos en el arranque. */
  readonly extra: readonly string[];
};

function validar(valor: unknown): z.infer<typeof EsquemaDestinos> {
  const resultado = EsquemaDestinos.safeParse(valor);
  if (!resultado.success) {
    throw new Error(`config/destinos.json no valida: ${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}

/**
 * Construye la lista efectiva.
 *
 * Los destinos de entorno entran como `externo` con egreso **verdadero**. Es
 * deliberadamente la clasificación más estricta: un destino que alguien añadió
 * por variable de entorno es justo el que menos sabemos, y tratarlo como
 * perímetro haría que su tráfico no contara en el numerador del vigía.
 */
export function listaDesde(
  valor: unknown,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): ListaDeDestinos {
  const config = validar(valor);
  const porAnfitrion = new Map<string, Destino>(Object.entries(config.destinos));

  const crudoExtra = entorno[config.permitir_por_entorno.variable] ?? '';
  const extra = crudoExtra
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a !== '');

  for (const anfitrion of extra) {
    porAnfitrion.set(anfitrion, {
      clase: 'externo',
      para: `Añadido por ${config.permitir_por_entorno.variable}. Sin diff que auditar.`,
      esquemas: ['http', 'https'],
      egreso: true,
    });
  }

  return { porAnfitrion, extra };
}

export const DESTINOS: ListaDeDestinos = listaDesde(crudo);

/** Lo que se imprime al arrancar si alguien añadió destinos por entorno. */
export function avisoDeExtras(lista: ListaDeDestinos = DESTINOS): string | null {
  if (lista.extra.length === 0) return null;
  return (
    `⚠  ${lista.extra.length} destino(s) de salida añadidos por entorno: ${lista.extra.join(', ')}.\n` +
    '   No están en config/destinos.json, así que no tienen diff, autor ni fecha.\n' +
    '   Es para desarrollo. En producción, la lista es el archivo.\n'
  );
}
