// Comparación de credenciales en tiempo constante.
//
// Una comparación normal de cadenas se detiene en el primer byte que difiere. La
// diferencia de tiempo es de nanosegundos, pero es medible con suficientes
// intentos, y permite descubrir un secreto byte a byte en vez de tener que
// adivinarlo entero. Es el ataque que hace que «verificar la firma» y «verificar
// la firma **bien**» sean cosas distintas.
//
// `crypto.timingSafeEqual` lanza si los búferes miden distinto, y esa excepción
// filtra la longitud. Por eso se comparan los **resúmenes** SHA-256, que siempre
// miden 32 bytes: la longitud del secreto deja de ser observable.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * ¿Son iguales estas dos cadenas? Sin filtrar por dónde dejan de serlo, ni
 * cuánto miden.
 */
export function igualEnTiempoConstante(a: string, b: string): boolean {
  const resumenA = createHash('sha256').update(a, 'utf8').digest();
  const resumenB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(resumenA, resumenB);
}

/**
 * Firma HMAC-SHA256 del cuerpo crudo, en hexadecimal.
 *
 * Sobre el cuerpo **crudo**: analizar el JSON y volver a serializarlo cambia
 * espacios y orden de claves, y la firma deja de coincidir por un motivo que no
 * tiene nada que ver con la autenticidad del mensaje.
 */
export function firmarHmacSha256(secreto: string, cuerpoCrudo: string): string {
  return createHmac('sha256', secreto).update(cuerpoCrudo, 'utf8').digest('hex');
}

/** Verifica una firma HMAC-SHA256 en tiempo constante. */
export function verificarHmacSha256(
  secreto: string,
  cuerpoCrudo: string,
  firmaRecibida: string,
): boolean {
  return igualEnTiempoConstante(firmarHmacSha256(secreto, cuerpoCrudo), firmaRecibida);
}
