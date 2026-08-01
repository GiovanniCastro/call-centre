// Traducción de una carga de WhatsApp Cloud al mensaje canónico.
//
// Mismas dos reglas que en Telegram: lo que no valida se descarta en vez de
// adivinarse, y una carga válida sin mensajes devuelve vacío en lugar de error.
// Aquí la segunda pesa más: WhatsApp entrega **confirmaciones de estado**
// —enviado, recibido, leído— por el mismo webhook y con la misma forma general que
// los mensajes. Tratarlas como caso duplicaría la cuenta de conversaciones.

import { z } from 'zod';

import type { MensajeCanonico, TipoMensaje } from '../../core/mensaje.ts';

const Perfil = z.object({ name: z.string().optional() });

const Contacto = z.object({
  wa_id: z.string(),
  profile: Perfil.optional(),
});

const Medio = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
});

const Mensaje = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: Medio.optional(),
  audio: Medio.optional(),
  voice: Medio.optional(),
  document: Medio.optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
});

const Valor = z.object({
  messaging_product: z.literal('whatsapp').optional(),
  contacts: z.array(Contacto).optional(),
  messages: z.array(Mensaje).optional(),
  // Presente en las confirmaciones de estado. Se declara para reconocerlas.
  statuses: z.array(z.unknown()).optional(),
});

const Carga = z.object({
  object: z.string().optional(),
  entry: z.array(
    z.object({
      changes: z.array(z.object({ value: Valor })),
    }),
  ),
});

type MensajeWhatsApp = z.infer<typeof Mensaje>;

function clasificar(m: MensajeWhatsApp): TipoMensaje {
  switch (m.type) {
    case 'text':
      return 'texto';
    case 'image':
      return 'imagen';
    case 'audio':
    case 'voice':
      return 'audio';
    case 'document':
      return 'documento';
    case 'location':
      return 'ubicacion';
    default:
      return 'otro';
  }
}

function medioDe(m: MensajeWhatsApp): { medio: Medio_; tipo: TipoMensaje } | null {
  if (m.image !== undefined) return { medio: m.image, tipo: 'imagen' };
  if (m.voice !== undefined) return { medio: m.voice, tipo: 'audio' };
  if (m.audio !== undefined) return { medio: m.audio, tipo: 'audio' };
  if (m.document !== undefined) return { medio: m.document, tipo: 'documento' };
  return null;
}

type Medio_ = z.infer<typeof Medio>;

function contenidoDe(m: MensajeWhatsApp): string {
  if (m.text !== undefined) return m.text.body;
  const medio = medioDe(m);
  if (medio?.medio.caption !== undefined) return medio.medio.caption;
  if (m.location !== undefined) return `${m.location.latitude},${m.location.longitude}`;
  return '';
}

function adjuntosDe(m: MensajeWhatsApp): MensajeCanonico['adjuntos'] {
  const medio = medioDe(m);
  if (medio === null) return [];

  return [
    {
      tipo: medio.tipo,
      referencia_externa: medio.medio.id,
      nombre: medio.medio.filename ?? null,
      // WhatsApp no da el tamaño en la notificación; llega al descargar el medio.
      tamano_bytes: null,
      tipo_mime: medio.medio.mime_type ?? null,
    },
  ];
}

/**
 * @returns Los mensajes canónicos de esta carga. Vacío si no valida, o si es una
 *   confirmación de estado y no un mensaje.
 */
export function normalizarCarga(cuerpo: unknown): readonly MensajeCanonico[] {
  const resultado = Carga.safeParse(cuerpo);
  if (!resultado.success) return [];

  const canonicos: MensajeCanonico[] = [];

  for (const entrada of resultado.data.entry) {
    for (const cambio of entrada.changes) {
      const valor = cambio.value;
      if (valor.messages === undefined) continue; // confirmación de estado

      const nombrePorId = new Map<string, string | null>();
      for (const contacto of valor.contacts ?? []) {
        nombrePorId.set(contacto.wa_id, contacto.profile?.name ?? null);
      }

      for (const m of valor.messages) {
        canonicos.push({
          // El id de WhatsApp ya es único globalmente; se prefija de todos modos
          // para que dos canales no puedan colisionar en la tabla de mensajes.
          id_externo: `whatsapp:${m.id}`,
          canal: 'whatsapp',
          contacto: {
            identificador_externo: m.from,
            nombre_declarado: nombrePorId.get(m.from) ?? null,
          },
          tipo: clasificar(m),
          contenido: contenidoDe(m),
          adjuntos: adjuntosDe(m),
          marca_tiempo: new Date(Number(m.timestamp) * 1000).toISOString(),
          procedencia: 'cliente',
        });
      }
    }
  }

  return canonicos;
}
