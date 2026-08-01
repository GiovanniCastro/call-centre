// Carga y validación de `config/vigias.json`. Único módulo que lo lee.

import { z } from 'zod';

import crudo from '../../../config/vigias.json' with { type: 'json' };

const positivo = z.number().positive();

const EsquemaVigias = z.object({
  version: z.literal(1),
  presupuesto: z.object({
    techos_usd: z.object({
      conversacion: positivo,
      contacto: positivo,
      hora: positivo,
      dia: positivo,
    }),
    fraccion_suave: z.number().gt(0).lt(1),
    mensaje_de_contingencia: z.string().min(1),
  }),
  perimetro: z.object({
    // Literal cero, no número: que el archivo pueda declarar otro umbral sería
    // declarar cuántos datos sensibles se admite que salgan.
    umbral: z.literal(0),
  }),
  bucle: z.object({
    limites: z.object({
      pasos: z.number().int().positive(),
      herramientas: z.number().int().positive(),
      reintentos: z.number().int().nonnegative(),
      tiempo_ms: z.number().int().positive(),
    }),
  }),
});

export type ConfigVigias = z.infer<typeof EsquemaVigias>;

export function vigiasDesde(valor: unknown): ConfigVigias {
  const resultado = EsquemaVigias.safeParse(valor);
  if (!resultado.success) {
    throw new Error(`config/vigias.json no valida: ${z.prettifyError(resultado.error)}`);
  }

  const c = resultado.data;
  const t = c.presupuesto.techos_usd;

  // Las ventanas tienen que ir de menor a mayor. Un techo por contacto mayor que
  // el diario haría que el de contacto no se alcanzara nunca: el diario cortaría
  // antes, y el límite que existe para que un caso no se lleve el presupuesto de
  // todos sería decorativo.
  if (!(t.conversacion <= t.contacto && t.contacto <= t.hora && t.hora <= t.dia)) {
    throw new Error(
      'Los techos tienen que crecer de conversación a día. Con uno mayor que el ' +
        'siguiente, ese límite no se alcanza nunca y deja de proteger de lo que ' +
        'venía a proteger.',
    );
  }

  return c;
}

export const VIGIAS: ConfigVigias = vigiasDesde(crudo);
