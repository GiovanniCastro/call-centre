// Traducción de una actualización de Telegram al mensaje canónico.
//
// Dos criterios que rigen todo el archivo:
//
// **Lo que no se entiende se descarta, no se adivina.** Una actualización que no
// valida devuelve lista vacía y queda registrada. Inventar un mensaje a partir de
// una carga desconocida mete basura en la conversación, y a partir de ahí todo lo
// que el agente diga se apoya en ella.
//
// **Vacío no es error.** Telegram entrega confirmaciones de lectura, cambios de
// estado del chat y ediciones. Son tráfico normal que no genera caso. Tratarlos
// como fallo llenaría el registro de errores donde no hay ninguno.

import { z } from 'zod';

import type { MensajeCanonico, TipoMensaje } from '../../core/mensaje.ts';

const Remitente = z.object({
  id: z.number().int(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

const Documento = z.object({
  file_id: z.string(),
  file_name: z.string().optional(),
  file_size: z.number().int().optional(),
  mime_type: z.string().optional(),
});

const Foto = z.object({
  file_id: z.string(),
  file_size: z.number().int().optional(),
  width: z.number().int(),
  height: z.number().int(),
});

const Audio = z.object({
  file_id: z.string(),
  file_size: z.number().int().optional(),
  mime_type: z.string().optional(),
  duration: z.number().int().optional(),
});

const Ubicacion = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

const Mensaje = z.object({
  message_id: z.number().int(),
  date: z.number().int(),
  chat: z.object({ id: z.number().int() }),
  from: Remitente.optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  document: Documento.optional(),
  photo: z.array(Foto).optional(),
  voice: Audio.optional(),
  audio: Audio.optional(),
  location: Ubicacion.optional(),
});

const Actualizacion = z.object({
  update_id: z.number().int(),
  message: Mensaje.optional(),
});

type MensajeTelegram = z.infer<typeof Mensaje>;

function nombreDeclarado(m: MensajeTelegram): string | null {
  if (m.from === undefined) return null;
  const partes = [m.from.first_name, m.from.last_name].filter(
    (p): p is string => p !== undefined && p !== '',
  );
  if (partes.length > 0) return partes.join(' ');
  return m.from.username ?? null;
}

/** El tipo se decide por el contenido, no por lo que diga la carga. */
function clasificar(m: MensajeTelegram): TipoMensaje {
  if (m.photo !== undefined && m.photo.length > 0) return 'imagen';
  if (m.voice !== undefined || m.audio !== undefined) return 'audio';
  if (m.document !== undefined) return 'documento';
  if (m.location !== undefined) return 'ubicacion';
  if (m.text !== undefined) return 'texto';
  return 'otro';
}

function extraerAdjuntos(m: MensajeTelegram): MensajeCanonico['adjuntos'] {
  if (m.document !== undefined) {
    return [
      {
        tipo: 'documento',
        referencia_externa: m.document.file_id,
        nombre: m.document.file_name ?? null,
        tamano_bytes: m.document.file_size ?? null,
        tipo_mime: m.document.mime_type ?? null,
      },
    ];
  }

  if (m.photo !== undefined && m.photo.length > 0) {
    // Telegram entrega la misma foto en varios tamaños. Se toma la mayor: es la
    // única con información suficiente para leer un documento fotografiado.
    const mayor = m.photo.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    return [
      {
        tipo: 'imagen',
        referencia_externa: mayor.file_id,
        nombre: null,
        tamano_bytes: mayor.file_size ?? null,
        tipo_mime: null,
      },
    ];
  }

  const sonido = m.voice ?? m.audio;
  if (sonido !== undefined) {
    return [
      {
        tipo: 'audio',
        referencia_externa: sonido.file_id,
        nombre: null,
        tamano_bytes: sonido.file_size ?? null,
        tipo_mime: sonido.mime_type ?? null,
      },
    ];
  }

  return [];
}

function contenidoDe(m: MensajeTelegram): string {
  if (m.text !== undefined) return m.text;
  if (m.caption !== undefined) return m.caption;
  if (m.location !== undefined) {
    return `${m.location.latitude},${m.location.longitude}`;
  }
  return '';
}

/**
 * @returns Los mensajes canónicos de esta actualización. Vacío si la carga no
 *   valida, o si es tráfico que no genera caso.
 */
export function normalizarActualizacion(cuerpo: unknown): readonly MensajeCanonico[] {
  const resultado = Actualizacion.safeParse(cuerpo);
  if (!resultado.success) return [];

  const m = resultado.data.message;
  if (m === undefined) return [];

  return [
    {
      // El identificador único de un mensaje de Telegram es el par
      // (chat, message_id): `message_id` solo es único dentro de su chat.
      // Usar `message_id` a secas haría que el rechazo de repetición descartara
      // el mensaje de un cliente porque otro, en otra conversación, tenía el
      // mismo número.
      id_externo: `telegram:${m.chat.id}:${m.message_id}`,
      canal: 'telegram',
      contacto: {
        identificador_externo: String(m.chat.id),
        nombre_declarado: nombreDeclarado(m),
      },
      tipo: clasificar(m),
      contenido: contenidoDe(m),
      adjuntos: extraerAdjuntos(m),
      marca_tiempo: new Date(m.date * 1000).toISOString(),
      procedencia: 'cliente',
    },
  ];
}
