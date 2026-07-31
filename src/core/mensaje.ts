// El mensaje canónico: lo único que el núcleo conoce de una conversación.
//
// A partir de aquí, nada sabe si el mensaje vino de Telegram, de WhatsApp o de un
// archivo del lote. Esa es toda la razón de que exista este tipo — y el check de
// arquitectura la sostiene: `src/core/` no puede importar `src/channels/`.
//
// La forma sigue a `migrations/001_inicial.sql` a propósito. Un mensaje canónico
// que no se pueda escribir tal cual en la tabla `mensajes` obligaría a una
// traducción intermedia, y toda traducción intermedia acaba perdiendo un campo.

import { z } from 'zod';

import { CANALES } from '../telemetry/evento.ts';

export const TIPOS_MENSAJE = [
  'texto',
  'imagen',
  'audio',
  'documento',
  'ubicacion',
  'otro',
] as const;

/**
 * De dónde viene el contenido. La fase 3 entrega al modelo todo lo que no sea
 * `sistema` como **dato delimitado con su procedencia**, nunca concatenado en la
 * zona de instrucciones. Sin este campo, esa distinción no se puede hacer.
 */
export const PROCEDENCIAS = ['cliente', 'agente', 'operador', 'sistema'] as const;

export type TipoMensaje = (typeof TIPOS_MENSAJE)[number];
export type Procedencia = (typeof PROCEDENCIAS)[number];

export const EsquemaAdjunto = z.object({
  tipo: z.enum(TIPOS_MENSAJE),
  /** Identificador del adjunto en el proveedor. La descarga llega en la fase 2. */
  referencia_externa: z.string().min(1),
  nombre: z.string().nullable(),
  tamano_bytes: z.number().int().nonnegative().nullable(),
  tipo_mime: z.string().nullable(),
});

export const EsquemaMensajeCanonico = z.object({
  /**
   * El identificador que asigna el proveedor del canal. Es la clave del rechazo
   * de repetición, y tiene índice único en la base: si el filtro de Redis falla,
   * la base sigue impidiendo la segunda inserción.
   */
  id_externo: z.string().min(1),
  canal: z.enum(CANALES),
  contacto: z.object({
    identificador_externo: z.string().min(1),
    nombre_declarado: z.string().nullable(),
  }),
  tipo: z.enum(TIPOS_MENSAJE),
  contenido: z.string(),
  adjuntos: z.array(EsquemaAdjunto),
  marca_tiempo: z.iso.datetime(),
  procedencia: z.enum(PROCEDENCIAS),
});

export type Adjunto = z.infer<typeof EsquemaAdjunto>;
export type MensajeCanonico = z.infer<typeof EsquemaMensajeCanonico>;
