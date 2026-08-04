// Carga y validación de `config/salud.json`. Único módulo que lo lee.

import { z } from 'zod';

import crudo from '../../../config/salud.json' with { type: 'json' };

const EsquemaSalud = z.object({
  version: z.literal(1),
  // Estrictamente menor que uno: un objetivo del 100 % deja el margen de error
  // en cero, y con margen cero el presupuesto no es una medida sino un
  // interruptor. Que el archivo no pueda declararlo es más barato que explicar
  // después por qué la cifra se comporta raro.
  objetivo_disponibilidad: z.number().gt(0).lt(1),
  minimo_observaciones: z.number().int().positive(),
  umbral_presupuesto_consumido: z.number().positive(),
  ventana_horas: z.number().positive(),
  grupos_en_el_informe: z.number().int().positive(),
});

export type ConfigSalud = z.infer<typeof EsquemaSalud>;

export function saludDesde(valor: unknown): ConfigSalud {
  const resultado = EsquemaSalud.safeParse(valor);
  if (!resultado.success) {
    throw new Error(`config/salud.json no valida: ${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}

export const SALUD: ConfigSalud = saludDesde(crudo);
