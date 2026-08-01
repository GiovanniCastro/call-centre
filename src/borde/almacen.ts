// El estado del borde: repetición, caudal y agrupación.
//
// Los tres comparten interfaz porque los tres son lo mismo visto de tres formas
// —memoria de corto plazo sobre lo que acaba de pasar— y porque separarlos
// obligaría a abrir tres conexiones a Redis para responder a un mensaje.
//
// **El reloj se inyecta.** Ninguna de estas tres cosas se puede probar bien
// contra el reloj del sistema: «cinco mensajes en tres segundos» exige controlar
// el tiempo, y una prueba que llama a `setTimeout(3000)` es una prueba que tarda
// tres segundos y falla un día que la máquina vaya cargada.

import type { MensajeCanonico } from '../core/mensaje.ts';

export type Grupo = {
  readonly clave: string;
  readonly mensajes: readonly MensajeCanonico[];
};

export interface AlmacenDeBorde {
  /** ¿Sobrevive a un reinicio del proceso? */
  readonly persistente: boolean;

  // ── Rechazo de repetición ──────────────────────────────────────────────
  /**
   * Marca el identificador como visto y dice si **ya lo estaba**.
   *
   * Es una sola operación y no dos —consultar y luego marcar— a propósito: entre
   * la consulta y la marca caben dos entregas del mismo mensaje, y las dos verían
   * «no visto». Telegram y WhatsApp reintentan si el webhook tarda, así que esa
   * carrera no es hipotética.
   */
  marcarVistoSiNuevo(idExterno: string, ttlSegundos: number): Promise<boolean>;

  // ── Límite de tasa, ventana deslizante ─────────────────────────────────
  /** Registra un intento y devuelve cuántos hay en la ventana, incluido este. */
  registrarYContar(clave: string, ventanaMs: number, ahoraMs: number): Promise<number>;

  // ── Ventana de agrupación ──────────────────────────────────────────────
  /**
   * Añade el mensaje al grupo de su contacto.
   *
   * @returns `true` si este mensaje **abrió** el grupo. El que lo abre es el que
   *   fija cuándo vence: la ventana no se reinicia con cada mensaje. Si se
   *   reiniciara, alguien escribiendo sin parar nunca recibiría respuesta.
   */
  anadirAlGrupo(
    clave: string,
    mensaje: MensajeCanonico,
    ventanaMs: number,
    ahoraMs: number,
  ): Promise<boolean>;

  /** Los grupos cuya ventana ya venció. Los devuelve y los retira. */
  recogerGruposVencidos(ahoraMs: number): Promise<readonly Grupo[]>;

  cerrar(): Promise<void>;
}

/** Clave de agrupación: un grupo por contacto y canal, nunca entre contactos. */
export function claveDeGrupo(mensaje: MensajeCanonico): string {
  return `${mensaje.canal}:${mensaje.contacto.identificador_externo}`;
}
