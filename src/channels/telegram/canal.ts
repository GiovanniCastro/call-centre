// Adaptador de Telegram. Canal primario del sistema (R-020).
//
// Telegram no firma sus entregas: al registrar el webhook se fija un **secreto
// compartido** que viaja en la cabecera `X-Telegram-Bot-Api-Secret-Token` de cada
// actualización. Es más débil que un HMAC —no prueba integridad del cuerpo, solo
// que quien llama conoce el secreto— pero es lo que el proveedor ofrece, y por eso
// el webhook debe servirse solo por TLS: sin cifrado, el secreto viaja en claro en
// cada petición.
//
// Todo lo específico de Telegram vive en este archivo y en `normalizar.ts`. El
// núcleo no importa nada de aquí, y el check `nucleo-sin-canal-concreto` lo
// impide.

import { igualEnTiempoConstante } from '../../core/credencial.ts';
import { salir } from '../../salida/salir.ts';
import { normalizarActualizacion } from './normalizar.ts';
import type {
  Canal,
  DestinoRespuesta,
  PeticionEntrante,
  Requisito,
  ResultadoVerificacion,
} from '../../core/canal.ts';
import type { MensajeCanonico } from '../../core/mensaje.ts';

export const CABECERA_SECRETO = 'x-telegram-bot-api-secret-token';

export const REQUISITOS_TELEGRAM: readonly Requisito[] = [
  {
    variable: 'TELEGRAM_BOT_TOKEN',
    descripcion: 'Token del bot. Autoriza a enviar mensajes en su nombre.',
    como_obtenerlo:
      'Habla con @BotFather en Telegram, envía /newbot y sigue las indicaciones. ' +
      'Te devuelve un token con la forma 123456789:AA... Guárdalo: es una credencial.',
  },
  {
    variable: 'TELEGRAM_WEBHOOK_SECRET',
    descripcion:
      'Secreto compartido que Telegram enviará en cada actualización. Lo eliges tú.',
    como_obtenerlo:
      'Genera una cadena aleatoria larga (por ejemplo, `openssl rand -hex 32`) y ' +
      'regístrala con setWebhook, en el parámetro secret_token, junto a la URL del ' +
      'webhook. Telegram la devolverá en la cabecera X-Telegram-Bot-Api-Secret-Token.',
  },
] as const;

type Opciones = {
  readonly token: string;
  readonly secretoWebhook: string;
  /** Se inyecta para poder probar el envío sin salir a la red. */
  readonly enviar?: (url: string, cuerpo: unknown) => Promise<void>;
};

async function enviarPorHttps(url: string, cuerpo: unknown): Promise<void> {
  const respuesta = await salir(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.ok) {
    throw new Error(
      `Telegram respondió ${respuesta.status} al enviar el mensaje: ${await respuesta.text()}`,
    );
  }
}

export function crearCanalTelegram(opciones: Opciones): Canal {
  const enviar = opciones.enviar ?? enviarPorHttps;

  return {
    nombre: 'telegram',

    verificarCredencial(peticion: PeticionEntrante): ResultadoVerificacion {
      const recibido = peticion.cabeceras[CABECERA_SECRETO];

      if (recibido === undefined || recibido === '') {
        // Se compara igualmente contra el secreto para que una petición sin
        // cabecera tarde lo mismo que una con cabecera equivocada. Si no, el
        // tiempo de respuesta delata si el atacante va por buen camino.
        igualEnTiempoConstante('', opciones.secretoWebhook);
        return { valida: false, motivo: 'falta la cabecera del secreto' };
      }

      if (!igualEnTiempoConstante(recibido, opciones.secretoWebhook)) {
        return { valida: false, motivo: 'el secreto no coincide' };
      }

      return { valida: true };
    },

    normalizar(cuerpo: unknown): readonly MensajeCanonico[] {
      return normalizarActualizacion(cuerpo);
    },

    async responder(destino: DestinoRespuesta, texto: string): Promise<void> {
      await enviar(`https://api.telegram.org/bot${opciones.token}/sendMessage`, {
        chat_id: destino.identificador_externo,
        text: texto,
      });
    },
  };
}
