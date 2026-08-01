// Almacén en memoria. Es el que corre hoy, y **no es el definitivo**.
//
// Lo dice con `persistente: false`, y el arranque lo repite en voz alta. El
// criterio «reiniciar el proceso no pierde la conversación en curso» no se puede
// cumplir con esto, y ninguna superficie debe poder confundirlo con Redis.
//
// Existe por dos razones que no son pereza: permite arrancar y probar el borde
// sin infraestructura, y —más importante— es la referencia contra la que se
// comprueba que la versión de Redis se comporta igual. Las mismas pruebas corren
// contra las dos implementaciones.

import { type AlmacenDeBorde, type Grupo } from './almacen.ts';
import type { MensajeCanonico } from '../core/mensaje.ts';

type GrupoAbierto = {
  vence: number;
  mensajes: MensajeCanonico[];
};

export class AlmacenEnMemoria implements AlmacenDeBorde {
  readonly persistente = false;

  private readonly vistos = new Map<string, number>();
  private readonly intentos = new Map<string, number[]>();
  private readonly grupos = new Map<string, GrupoAbierto>();

  async marcarVistoSiNuevo(idExterno: string, ttlSegundos: number): Promise<boolean> {
    const caducidad = this.vistos.get(idExterno);
    const ahora = Date.now();

    if (caducidad !== undefined && caducidad > ahora) return false;

    this.vistos.set(idExterno, ahora + ttlSegundos * 1000);
    return true;
  }

  async registrarYContar(clave: string, ventanaMs: number, ahoraMs: number): Promise<number> {
    const desde = ahoraMs - ventanaMs;
    const previos = (this.intentos.get(clave) ?? []).filter((t) => t > desde);
    previos.push(ahoraMs);
    this.intentos.set(clave, previos);
    return previos.length;
  }

  async anadirAlGrupo(
    clave: string,
    mensaje: MensajeCanonico,
    ventanaMs: number,
    ahoraMs: number,
  ): Promise<boolean> {
    const abierto = this.grupos.get(clave);

    if (abierto === undefined) {
      this.grupos.set(clave, { vence: ahoraMs + ventanaMs, mensajes: [mensaje] });
      return true;
    }

    // La ventana NO se reinicia: la fija quien abrió el grupo. Si se reiniciara,
    // alguien escribiendo sin parar nunca recibiría respuesta.
    abierto.mensajes.push(mensaje);
    return false;
  }

  async recogerGruposVencidos(ahoraMs: number): Promise<readonly Grupo[]> {
    const vencidos: Grupo[] = [];

    for (const [clave, grupo] of this.grupos) {
      if (grupo.vence <= ahoraMs) {
        vencidos.push({ clave, mensajes: grupo.mensajes });
        this.grupos.delete(clave);
      }
    }

    return vencidos;
  }

  async cerrar(): Promise<void> {
    this.vistos.clear();
    this.intentos.clear();
    this.grupos.clear();
  }
}
