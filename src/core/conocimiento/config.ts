// Carga y validación de `config/conocimiento.json`. Único módulo que lo lee.
//
// Como en `costeo/precios.ts`, la validación ocurre al cargar el módulo y no al
// primer uso: un umbral malformado tiene que reventar al arrancar, con el campo
// que está mal, en lugar de convertirse en un `NaN` que compara siempre falso y
// deja la recuperación devolviendo vacío para todo sin que nadie sepa por qué.

import { z } from 'zod';

import crudo from '../../../config/conocimiento.json' with { type: 'json' };

const EsquemaIngesta = z.object({
  carpeta: z.string().min(1),
  extensiones: z.array(z.string().startsWith('.')).min(1),
  prefijos_excluidos: z.array(z.string().min(1)),
});

const EsquemaTroceado = z
  .object({
    objetivo_caracteres: z.number().int().positive(),
    solapamiento_caracteres: z.number().int().nonnegative(),
    minimo_caracteres: z.number().int().positive(),
  })
  .refine((t) => t.solapamiento_caracteres < t.objetivo_caracteres, {
    error:
      'El solapamiento tiene que ser menor que el objetivo. Si fuera igual o mayor, ' +
      'cada fragmento empezaría donde empezó el anterior y el troceado no avanzaría: ' +
      'un bucle infinito sobre el primer documento.',
  })
  .refine((t) => t.minimo_caracteres <= t.objetivo_caracteres, {
    error: 'El mínimo no puede superar al objetivo: descartaría todos los fragmentos.',
  });

const EsquemaRecuperacion = z.object({
  // Coseno sobre vectores normalizados: el rango útil es [0, 1].
  umbral: z.number().min(0).max(1),
  maximo_fragmentos: z.number().int().positive(),
  estado_umbral: z.union([z.literal('PROVISIONAL'), z.literal('CALIBRADO')]),
});

const EsquemaEmbeddings = z.object({
  origen: z.union([z.literal('local'), z.literal('nube')]),
  local: z.object({
    modelo: z.string().min(1),
    dimensiones: z.number().int().positive(),
    url_por_defecto: z.string().url(),
  }),
  nube: z.object({
    modelo: z.string().min(1),
    dimensiones: z.number().int().nonnegative(),
  }),
});

const EsquemaAlmacen = z.object({
  coleccion: z.string().min(1),
  metrica: z.union([z.literal('Cosine'), z.literal('Dot'), z.literal('Euclid')]),
});

const EsquemaConocimiento = z.object({
  version: z.literal(1),
  ingesta: EsquemaIngesta,
  troceado: EsquemaTroceado,
  recuperacion: EsquemaRecuperacion,
  embeddings: EsquemaEmbeddings,
  almacen: EsquemaAlmacen,
});

export type ConfigConocimiento = z.infer<typeof EsquemaConocimiento>;
export type ConfigTroceado = z.infer<typeof EsquemaTroceado>;

function validar(): ConfigConocimiento {
  const resultado = EsquemaConocimiento.safeParse(crudo);
  if (!resultado.success) {
    throw new Error(`config/conocimiento.json no valida: ${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}

export const CONOCIMIENTO: ConfigConocimiento = validar();

/**
 * Construye una configuración desde un objeto en memoria.
 *
 * Existe para que las pruebas demuestren «cambiar el umbral en `config/` cambia
 * qué se responde» sin escribir en disco, igual que `tablaDesde` en costeo.
 */
export function conocimientoDesde(valor: unknown): ConfigConocimiento {
  return EsquemaConocimiento.parse(valor);
}
