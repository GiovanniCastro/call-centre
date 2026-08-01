// Carga y validación de los umbrales del borde.
//
// Los umbrales viven en `config/limites.json` y no en el código: un umbral que
// cambia sin dejar diff, autor y fecha no es auditable, y este proyecto se vende
// sobre que todo lo es. La validación ocurre al cargar el módulo, no al primer
// mensaje: un umbral mal escrito tiene que reventar al arrancar.

import { z } from 'zod';

import crudos from '../../config/limites.json' with { type: 'json' };

const Tasa = z.object({
  maximo: z.number().int().positive(),
  ventana_ms: z.number().int().positive(),
  por_que: z.string().optional(),
});

const Esquema = z.object({
  version: z.literal(1),
  agrupacion: z.object({
    ventana_ms: z.number().int().positive(),
    por_que: z.string().optional(),
  }),
  repeticion: z.object({
    ttl_segundos: z.number().int().positive(),
    por_que: z.string().optional(),
  }),
  tasa_por_contacto: Tasa,
  tasa_por_origen: Tasa,
  techo_cuerpo_bytes: z.number().int().positive(),
});

export type Limites = z.infer<typeof Esquema>;

function validar(): Limites {
  const resultado = Esquema.safeParse(crudos);
  if (!resultado.success) {
    throw new Error(`config/limites.json no valida: ${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}

export const LIMITES: Limites = validar();

/** Construye unos límites a medida, para pruebas. */
export function limitesDesde(parche: unknown): Limites {
  return Esquema.parse(parche);
}
