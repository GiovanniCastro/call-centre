// Almacén sobre Redis. El definitivo: sobrevive al reinicio del proceso.
//
// **Aviso de procedencia:** este archivo se escribió sin Redis en la máquina de
// desarrollo. Lo ejercita el CI, con un contenedor de Redis real y las mismas
// pruebas que el almacén en memoria. Hasta que esas pruebas hayan pasado, esto
// está escrito, no probado — la misma distinción que se hizo con el conector de
// WhatsApp, y por el mismo motivo.
//
// Cada operación es **atómica** donde tiene que serlo. `SET NX` para la
// repetición y una transacción para la ventana deslizante no son elegancia: entre
// un `GET` y un `SET` caben dos entregas del mismo mensaje, y las dos verían «no
// visto».

import { createClient, type RedisClientType } from 'redis';

import { type AlmacenDeBorde, type Grupo } from './almacen.ts';
import { EsquemaMensajeCanonico, type MensajeCanonico } from '../core/mensaje.ts';

const PREFIJO_POR_OMISION = 'perimetro:borde';

export class AlmacenRedis implements AlmacenDeBorde {
  readonly persistente = true;
  private readonly cliente: RedisClientType;
  private readonly prefijo: string;
  /** ZSET de grupos abiertos, puntuado por el instante en que vencen. */
  private readonly claveGrupos: string;

  private constructor(cliente: RedisClientType, prefijo: string) {
    this.cliente = cliente;
    this.prefijo = prefijo;
    this.claveGrupos = `${prefijo}:grupos`;
  }

  /**
   * @param prefijo Espacio de nombres de las claves. Se puede cambiar para que
   *   dos pruebas contra el mismo Redis no se pisen: `recogerGruposVencidos`
   *   recoge por tiempo, no por clave, así que sin espacios separados una prueba
   *   se llevaría los grupos de otra.
   */
  static async conectar(url: string, prefijo = PREFIJO_POR_OMISION): Promise<AlmacenRedis> {
    const cliente: RedisClientType = createClient({ url });
    await cliente.connect();
    return new AlmacenRedis(cliente, prefijo);
  }

  async marcarVistoSiNuevo(idExterno: string, ttlSegundos: number): Promise<boolean> {
    // `NX` hace la comprobación y la escritura en un solo paso. Sin él habría una
    // ventana entre las dos en la que dos entregas del mismo mensaje pasarían.
    const puesto = await this.cliente.set(`${this.prefijo}:visto:${idExterno}`, '1', {
      condition: 'NX',
      expiration: { type: 'EX', value: ttlSegundos },
    });
    return puesto !== null;
  }

  async registrarYContar(clave: string, ventanaMs: number, ahoraMs: number): Promise<number> {
    const k = `${this.prefijo}:tasa:${clave}`;
    const desde = ahoraMs - ventanaMs;

    // Ventana deslizante: se tira lo viejo, se añade lo nuevo y se cuenta, todo
    // en una transacción. Contar antes de limpiar daría de más; limpiar sin
    // transacción dejaría que dos peticiones simultáneas se pisaran.
    const resultados = await this.cliente
      .multi()
      .zRemRangeByScore(k, 0, desde)
      .zAdd(k, [{ score: ahoraMs, value: `${ahoraMs}:${Math.trunc(ahoraMs % 1e6)}` }])
      .zCard(k)
      .pExpire(k, ventanaMs)
      .exec();

    const cardinalidad = resultados[2];
    return typeof cardinalidad === 'number' ? cardinalidad : 0;
  }

  async anadirAlGrupo(
    clave: string,
    mensaje: MensajeCanonico,
    ventanaMs: number,
    ahoraMs: number,
  ): Promise<boolean> {
    const lista = `${this.prefijo}:grupo:${clave}`;

    // `NX` en el ZSET: solo el primero fija el vencimiento. Los siguientes no lo
    // mueven, así que la ventana no se reinicia con cada mensaje.
    const anadidos = await this.cliente.zAdd(
      this.claveGrupos,
      [{ score: ahoraMs + ventanaMs, value: clave }],
      { condition: 'NX' },
    );

    await this.cliente.rPush(lista, JSON.stringify(mensaje));

    return anadidos === 1;
  }

  async recogerGruposVencidos(ahoraMs: number): Promise<readonly Grupo[]> {
    const claves = await this.cliente.zRangeByScore(this.claveGrupos, 0, ahoraMs);
    const grupos: Grupo[] = [];

    for (const clave of claves) {
      const lista = `${this.prefijo}:grupo:${clave}`;

      // Se retira el grupo del ZSET **antes** de leer la lista: si dos procesos
      // recogen a la vez, solo uno consigue retirarlo y solo uno se lleva los
      // mensajes. Al revés, los dos los procesarían.
      const retirado = await this.cliente.zRem(this.claveGrupos, clave);
      if (retirado !== 1) continue;

      const crudos = await this.cliente.lRange(lista, 0, -1);
      await this.cliente.del(lista);

      const mensajes: MensajeCanonico[] = [];
      for (const crudo of crudos) {
        const analizado = EsquemaMensajeCanonico.safeParse(JSON.parse(crudo) as unknown);
        // Un mensaje que no valida al salir de Redis se descarta y no arrastra al
        // resto del grupo: puede venir de una versión anterior del esquema.
        if (analizado.success) mensajes.push(analizado.data);
      }

      grupos.push({ clave, mensajes });
    }

    return grupos;
  }

  async cerrar(): Promise<void> {
    await this.cliente.quit();
  }
}
