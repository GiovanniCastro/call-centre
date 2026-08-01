// Normalización del canal `lote`: de un caso escrito a mano a mensaje canónico.
//
// El formato es deliberadamente **el mensaje canónico menos lo que el canal
// aporta**. Un formato propio con nombres distintos obligaría a una traducción,
// y toda traducción acaba perdiendo un campo — que es justo lo que el mensaje
// canónico existe para evitar.
//
// Lo que el archivo NO trae y pone el adaptador: el canal (`lote`, siempre), la
// procedencia (`cliente`, porque un caso del lote representa a alguien
// escribiendo) y la marca de tiempo si se omite.

import { z } from 'zod';

import { exigirMensajeValido } from '../../core/canal.ts';
import type { MensajeCanonico } from '../../core/mensaje.ts';

/**
 * Un caso del lote.
 *
 * `id` y `contacto` son obligatorios y no se generan solos a propósito: el
 * corredor de la fase 7 tiene que poder correr el mismo lote dos veces y obtener
 * los mismos identificadores, o la comparación entre modos compararía ejecuciones
 * que no se pueden emparejar.
 */
export const EsquemaCasoDeLote = z.object({
  id: z.string().min(1),
  contacto: z.string().min(1),
  nombre: z.string().nullable().optional(),
  texto: z.string(),
  marca_tiempo: z.iso.datetime().optional(),
  /** Lo que el caso espera. No lo usa el canal; lo lee el corredor de la fase 7. */
  esperado: z
    .object({
      respuesta: z.string().optional(),
      fuentes: z.array(z.string()).optional(),
      debe_escalar: z.boolean().optional(),
      // Lo que el corredor de la fase 7 compara. El canal sigue ignorándolo
      // entero: una expectativa no puede influir en la ejecución que juzga.
      clase_tarea: z.string().optional(),
      clase_sensibilidad: z.string().optional(),
      vigia: z.string().optional(),
      categoria: z.string().optional(),
    })
    .optional(),
});

export const EsquemaArchivoDeLote = z.object({
  version: z.literal(1),
  lote: z.string().min(1),
  casos: z.array(EsquemaCasoDeLote).min(1),
});

export type CasoDeLote = z.infer<typeof EsquemaCasoDeLote>;
export type ArchivoDeLote = z.infer<typeof EsquemaArchivoDeLote>;

export class ErrorDeLote extends Error {
  override readonly name = 'ErrorDeLote';
}

/**
 * Traduce un caso a mensaje canónico.
 *
 * Devuelve una lista, como los demás canales, aunque el lote siempre traiga uno:
 * la interfaz es la misma para todos, y hacer una excepción aquí obligaría al
 * despachador a saber qué canal le habló.
 */
export function normalizarCaso(cuerpo: unknown): readonly MensajeCanonico[] {
  const caso = EsquemaCasoDeLote.safeParse(cuerpo);
  if (!caso.success) {
    // Se descarta y se registra, igual que una carga malformada de Telegram. Un
    // caso mal escrito en un lote de cien no puede tumbar los otros noventa y nueve.
    return [];
  }

  const mensaje = exigirMensajeValido(
    {
      id_externo: caso.data.id,
      canal: 'lote',
      contacto: {
        identificador_externo: caso.data.contacto,
        nombre_declarado: caso.data.nombre ?? null,
      },
      tipo: 'texto',
      contenido: caso.data.texto,
      adjuntos: [],
      marca_tiempo: caso.data.marca_tiempo ?? new Date().toISOString(),
      procedencia: 'cliente',
    },
    'lote',
  );

  return [mensaje];
}

/** Un archivo entero. Falla ruidosamente: un lote inválido no se corre a medias. */
export function leerArchivo(contenido: unknown): ArchivoDeLote {
  const resultado = EsquemaArchivoDeLote.safeParse(contenido);
  if (!resultado.success) {
    throw new ErrorDeLote(
      `El archivo de lote no valida: ${z.prettifyError(resultado.error)}. ` +
        'Un lote a medias produciría un informe comparativo sobre un subconjunto ' +
        'distinto en cada modo, y esa comparación no significaría nada.',
    );
  }
  return resultado.data;
}
