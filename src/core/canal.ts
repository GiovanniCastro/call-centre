// La interfaz `Canal`. Tres métodos: verificar, normalizar, responder.
//
// La verificación de la credencial **está aquí y no en el webhook**, y esa es la
// decisión de diseño de este archivo. Telegram usa un secreto compartido en una
// cabecera; WhatsApp usa una firma HMAC sobre el cuerpo crudo; el canal de lote no
// usa ninguna de las dos. Si el webhook conociera esos mecanismos, el núcleo
// conocería los canales, y añadir el tercero exigiría tocarlo.
//
// El criterio de aceptación no cambia con el mecanismo: **una petición sin
// credencial válida nunca llega a la cola.**

import { z } from 'zod';

import type { CANALES } from '../telemetry/evento.ts';
import { EsquemaMensajeCanonico, type MensajeCanonico } from './mensaje.ts';

export type NombreCanal = (typeof CANALES)[number];

/**
 * Lo que llega al borde, antes de interpretarse.
 *
 * El cuerpo viaja **crudo**, sin analizar. Las firmas HMAC se calculan sobre los
 * bytes exactos que envió el proveedor: analizar y volver a serializar cambia
 * espacios y orden de claves, y la firma deja de coincidir por un motivo que no
 * tiene nada que ver con la autenticidad.
 */
export type PeticionEntrante = {
  readonly cabeceras: Readonly<Record<string, string | undefined>>;
  readonly cuerpoCrudo: string;
};

export type ResultadoVerificacion =
  | { readonly valida: true }
  | { readonly valida: false; readonly motivo: string };

/** A dónde responder. Lo fija el sistema desde la conversación en curso. */
export type DestinoRespuesta = {
  readonly identificador_externo: string;
};

export interface Canal {
  readonly nombre: NombreCanal;

  /**
   * Comprueba que la petición viene de quien dice venir. Se llama **antes** de
   * analizar el cuerpo, de encolar y de tocar la base.
   *
   * No lanza: devuelve el resultado. Una credencial inválida es un caso esperado
   * —internet está lleno de peticiones a webhooks— y tratarla como excepción
   * llena los registros de ruido donde debería haber un contador.
   */
  verificarCredencial(peticion: PeticionEntrante): ResultadoVerificacion;

  /**
   * Traduce la carga del proveedor a mensajes canónicos.
   *
   * Devuelve una lista porque algunos proveedores agrupan varios mensajes en una
   * sola entrega. Devuelve **vacío**, no un error, cuando la carga es válida pero
   * no contiene nada que procesar —confirmaciones de entrega, cambios de estado—:
   * eso no es un fallo, es tráfico normal que no genera caso.
   */
  normalizar(cuerpo: unknown): readonly MensajeCanonico[];

  responder(destino: DestinoRespuesta, texto: string): Promise<void>;
}

/** Un dato que el conector necesita para poder activarse. */
export type Requisito = {
  /** Variable de entorno donde se espera. */
  readonly variable: string;
  readonly descripcion: string;
  /** Cómo se consigue. Es lo que se enseña a quien va a instalarlo. */
  readonly como_obtenerlo: string;
};

export const EsquemaRequisito = z.object({
  variable: z.string().min(1),
  descripcion: z.string().min(1),
  como_obtenerlo: z.string().min(1),
});

/**
 * Un canal es o bien utilizable, o bien una declaración de lo que le falta.
 *
 * No hay un tercer estado, y en particular no hay «configurado a medias». Un
 * conector con la mitad de sus credenciales falla en el primer mensaje real, que
 * es el peor momento posible para enterarse.
 */
export type EstadoCanal =
  | { readonly estado: 'configurado'; readonly nombre: NombreCanal; readonly canal: Canal }
  | {
      readonly estado: 'no_configurado';
      readonly nombre: NombreCanal;
      readonly requisitos: readonly Requisito[];
      /** Cuáles de esos requisitos faltan ahora mismo. */
      readonly faltan: readonly string[];
    };

export class ErrorDeCanal extends Error {
  override readonly name = 'ErrorDeCanal';
}

/** Valida un mensaje canónico y devuelve el objeto tipado, o lanza. */
export function exigirMensajeValido(mensaje: unknown, canal: NombreCanal): MensajeCanonico {
  const resultado = EsquemaMensajeCanonico.safeParse(mensaje);
  if (!resultado.success) {
    throw new ErrorDeCanal(
      `El canal «${canal}» produjo un mensaje canónico inválido: ` +
        resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') +
        '. Un mensaje malformado que entra aquí contamina la conversación entera.',
    );
  }
  return resultado.data;
}
