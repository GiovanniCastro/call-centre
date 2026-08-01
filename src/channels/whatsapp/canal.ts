// Conector de WhatsApp — escrito entero, sin cuenta (R-020).
//
// WhatsApp Business exige un número corporativo y una revisión de Meta que puede
// tardar semanas. El proyecto no espera: el canal primario es Telegram y esto se
// activa el día que existan las credenciales.
//
// **Qué está probado y qué no.** La verificación de firma y la normalización se
// ejercitan contra cargas de ejemplo con firmas calculadas. Eso demuestra que el
// mecanismo es correcto. Lo que no demuestra es que la carga real de Meta tenga la
// forma que dice su documentación. Hasta que pase un mensaje de verdad, este
// conector **no está probado**; está escrito. La diferencia importa y por eso
// queda dicha aquí y en R-020.

import { verificarHmacSha256 } from '../../core/credencial.ts';
import { salir } from '../../salida/salir.ts';
import { normalizarCarga } from './normalizar.ts';
import type {
  Canal,
  DestinoRespuesta,
  PeticionEntrante,
  Requisito,
  ResultadoVerificacion,
} from '../../core/canal.ts';
import type { MensajeCanonico } from '../../core/mensaje.ts';

export const CABECERA_FIRMA = 'x-hub-signature-256';
const PREFIJO_FIRMA = 'sha256=';

/**
 * Lo que hace falta para instalarlo. Lo lee el arranque y lo leerá el panel de la
 * fase 6: es la respuesta a «¿qué necesito para conectar WhatsApp?», en un sitio
 * donde el programa puede consultarla, no en un párrafo de un README.
 */
export const REQUISITOS_WHATSAPP: readonly Requisito[] = [
  {
    variable: 'WHATSAPP_ID_NUMERO',
    descripcion:
      'Identificador del número de teléfono emisor. No es el número: es el id que ' +
      'le asigna Meta.',
    como_obtenerlo:
      'Necesitas una cuenta de WhatsApp Business con un número verificado, que no ' +
      'puede estar en uso en la aplicación normal de WhatsApp. En developers.facebook.com, ' +
      'apartado WhatsApp → Configuración de la API, aparece como «Identificador del ' +
      'número de teléfono».',
  },
  {
    variable: 'WHATSAPP_TOKEN',
    descripcion: 'Token de acceso permanente para enviar mensajes.',
    como_obtenerlo:
      'En developers.facebook.com, crea una aplicación de tipo Empresa, añade el ' +
      'producto WhatsApp y genera un token de usuario del sistema con los permisos ' +
      'whatsapp_business_messaging y whatsapp_business_management. El token temporal ' +
      'de 24 horas sirve para probar, no para producción.',
  },
  {
    variable: 'WHATSAPP_SECRETO_APP',
    descripcion:
      'Clave secreta de la aplicación. Con ella se verifica la firma HMAC de cada ' +
      'entrega; sin ella, cualquiera podría enviar mensajes falsos al webhook.',
    como_obtenerlo:
      'developers.facebook.com → tu aplicación → Configuración → Básica → «Clave ' +
      'secreta de la aplicación».',
  },
  {
    variable: 'WHATSAPP_TOKEN_VERIFICACION',
    descripcion:
      'Cadena que eliges tú y que Meta te devolverá una sola vez, al dar de alta el ' +
      'webhook, para comprobar que la URL es tuya.',
    como_obtenerlo:
      'Invéntala (por ejemplo, `openssl rand -hex 16`) y escribe la misma cadena en ' +
      'esta variable y en el formulario de Meta al configurar el webhook.',
  },
] as const;

type Opciones = {
  readonly idNumero: string;
  readonly token: string;
  readonly secretoApp: string;
  readonly tokenVerificacion: string;
  readonly enviar?: (url: string, token: string, cuerpo: unknown) => Promise<void>;
};

async function enviarPorHttps(url: string, token: string, cuerpo: unknown): Promise<void> {
  const respuesta = await salir(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.ok) {
    throw new Error(
      `WhatsApp respondió ${respuesta.status} al enviar el mensaje: ${await respuesta.text()}`,
    );
  }
}

export function crearCanalWhatsApp(opciones: Opciones): Canal {
  const enviar = opciones.enviar ?? enviarPorHttps;

  return {
    nombre: 'whatsapp',

    verificarCredencial(peticion: PeticionEntrante): ResultadoVerificacion {
      const cabecera = peticion.cabeceras[CABECERA_FIRMA];

      if (cabecera === undefined || cabecera === '') {
        return { valida: false, motivo: 'falta la cabecera de firma' };
      }

      if (!cabecera.startsWith(PREFIJO_FIRMA)) {
        return { valida: false, motivo: 'la firma no lleva el prefijo sha256=' };
      }

      const firma = cabecera.slice(PREFIJO_FIRMA.length);

      // Sobre el cuerpo **crudo**: analizar y volver a serializar cambiaría
      // espacios y orden de claves, y la firma dejaría de coincidir por un motivo
      // que no tiene nada que ver con la autenticidad.
      if (!verificarHmacSha256(opciones.secretoApp, peticion.cuerpoCrudo, firma)) {
        return { valida: false, motivo: 'la firma no coincide con el cuerpo' };
      }

      return { valida: true };
    },

    normalizar(cuerpo: unknown): readonly MensajeCanonico[] {
      return normalizarCarga(cuerpo);
    },

    async responder(destino: DestinoRespuesta, texto: string): Promise<void> {
      await enviar(
        `https://graph.facebook.com/v21.0/${opciones.idNumero}/messages`,
        opciones.token,
        {
          messaging_product: 'whatsapp',
          to: destino.identificador_externo,
          type: 'text',
          text: { body: texto },
        },
      );
    },
  };
}

/**
 * Responde al desafío que Meta envía una sola vez al dar de alta el webhook.
 *
 * @returns El texto a devolver, o `null` si el desafío no es legítimo — en cuyo
 *   caso el borde responde 403 y no se da de alta nada.
 */
export function responderDesafioDeAlta(
  tokenVerificacion: string,
  parametros: Readonly<Record<string, string | undefined>>,
): string | null {
  const modo = parametros['hub.mode'];
  const token = parametros['hub.verify_token'];
  const desafio = parametros['hub.challenge'];

  if (modo !== 'subscribe' || token !== tokenVerificacion || desafio === undefined) {
    return null;
  }

  return desafio;
}
