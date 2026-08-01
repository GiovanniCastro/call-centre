// Montaje del registro de canales a partir del entorno.
//
// Vive en `src/channels/` y no en `src/core/`: es el único sitio que conoce a la
// vez todos los canales concretos. El núcleo solo conoce la interfaz, y el check
// `nucleo-sin-canal-concreto` impide que eso cambie por descuido.

import {
  evaluarRequisitos,
  RegistroDeCanales,
  describirRequisitos,
} from '../core/registro-canales.ts';
import { crearCanalLote, REQUISITOS_LOTE } from './lote/canal.ts';
import { crearCanalTelegram, REQUISITOS_TELEGRAM } from './telegram/canal.ts';
import { crearCanalWhatsApp, REQUISITOS_WHATSAPP } from './whatsapp/canal.ts';

/**
 * Construye el registro con los canales que el entorno permita.
 *
 * Ningún canal ausente impide arrancar: queda declarado como `no_configurado` con
 * la lista de lo que le falta. Un sistema que se niega a arrancar porque WhatsApp
 * no está configurado sería un sistema rehén de un trámite de Meta, que es
 * exactamente lo que R-020 vino a evitar.
 */
export function construirRegistro(
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): RegistroDeCanales {
  const registro = new RegistroDeCanales();

  registro.registrar(
    evaluarRequisitos('telegram', REQUISITOS_TELEGRAM, entorno, (v) =>
      crearCanalTelegram({
        token: v['TELEGRAM_BOT_TOKEN'] ?? '',
        secretoWebhook: v['TELEGRAM_WEBHOOK_SECRET'] ?? '',
      }),
    ),
  );

  registro.registrar(
    evaluarRequisitos('whatsapp', REQUISITOS_WHATSAPP, entorno, (v) =>
      crearCanalWhatsApp({
        idNumero: v['WHATSAPP_ID_NUMERO'] ?? '',
        token: v['WHATSAPP_TOKEN'] ?? '',
        secretoApp: v['WHATSAPP_SECRETO_APP'] ?? '',
        tokenVerificacion: v['WHATSAPP_TOKEN_VERIFICACION'] ?? '',
      }),
    ),
  );

  // El lote no lleva credenciales, así que siempre queda configurado. Se registra
  // igual que los demás y por la misma puerta: si tuviera una vía propia, dejaría
  // de probar que la interfaz `Canal` sirve, que es para lo que existe.
  registro.registrar(evaluarRequisitos('lote', REQUISITOS_LOTE, entorno, () => crearCanalLote()));

  return registro;
}

/**
 * El parte de canales que se imprime al arrancar.
 *
 * Existe porque un conector que falla en silencio es peor que uno que no existe:
 * se descubre con el primer mensaje real de un cliente real.
 */
export function parteDeCanales(registro: RegistroDeCanales): string {
  const lineas: string[] = ['Canales:'];

  for (const estado of registro.listar()) {
    if (estado.estado === 'configurado') {
      lineas.push(`  ✓ ${estado.nombre} — activo`);
    } else {
      lineas.push(
        `  ✗ ${estado.nombre} — declarado, sin configurar (faltan: ${estado.faltan.join(', ')})`,
      );
    }
  }

  const sinConfigurar = registro.listar().filter((e) => e.estado === 'no_configurado');
  if (sinConfigurar.length > 0) {
    lineas.push('');
    for (const estado of sinConfigurar) {
      lineas.push(describirRequisitos(estado));
    }
  }

  return lineas.join('\n');
}
