// Punto de arranque del perímetro.
//
// Arranca aunque no haya ningún canal configurado, y **lo dice**. Un sistema que
// se niega a arrancar porque falta una credencial de WhatsApp sería un sistema
// rehén de un trámite de Meta, que es exactamente lo que R-020 vino a evitar. Un
// sistema que arranca fingiendo que todo está bien es peor: el fallo se descubre
// con el primer mensaje de un cliente real.

import { construirRegistro, parteDeCanales } from './channels/registrar.ts';
import { crearServidor } from './borde/servidor.ts';
import { ColaEnMemoria } from './borde/cola.ts';
import { AlmacenEnMemoria } from './borde/almacen-memoria.ts';
import { AlmacenRedis } from './borde/almacen-redis.ts';
import { arrancarDespachador, crearDespachador } from './borde/despachador.ts';
import { LIMITES } from './borde/limites.ts';
import type { AlmacenDeBorde } from './borde/almacen.ts';

const PUERTO = Number(process.env['PUERTO'] ?? 8787);
const URL_REDIS = process.env['REDIS_URL'];

async function elegirAlmacen(): Promise<AlmacenDeBorde> {
  if (URL_REDIS === undefined || URL_REDIS === '') return new AlmacenEnMemoria();

  try {
    const almacen = await AlmacenRedis.conectar(URL_REDIS);
    console.warn(`Redis conectado en ${URL_REDIS}`);
    return almacen;
  } catch (error) {
    // No se cae a memoria en silencio. Degradar sin avisar significaría que el
    // sistema pierde la persistencia justo cuando alguien creía tenerla, y nadie
    // se enteraría hasta el primer reinicio con conversaciones abiertas.
    console.warn(`No se pudo conectar a Redis (${URL_REDIS}): ${String(error)}`);
    console.warn('Se usa el almacén EN MEMORIA. Corrige REDIS_URL o quítalo del entorno.');
    return new AlmacenEnMemoria();
  }
}

const registro = construirRegistro();
const almacen = await elegirAlmacen();
const cola = new ColaEnMemoria();
const despachador = crearDespachador(almacen, cola);

console.warn(parteDeCanales(registro));

if (registro.activos().length === 0) {
  console.warn(
    'Ningún canal configurado. El servidor arranca igual: / , /salud y /canales\n' +
      'responden, y los webhooks devuelven 503 diciendo qué falta. Copia .env.ejemplo\n' +
      'a .env para configurar Telegram.\n',
  );
}

if (!almacen.persistente) {
  console.warn(
    '⚠  El almacén del borde es EN MEMORIA: se pierde al reiniciar. Define REDIS_URL\n' +
      '   para usar Redis. Mientras tanto el criterio «reiniciar el proceso no pierde\n' +
      '   la conversación en curso» NO se cumple, y no debe darse por bueno.\n',
  );
}

const servidor = crearServidor({ registro, almacen });

// El despachador se pasa por la ventana de agrupación: cada medio ciclo, para que
// ningún grupo espere mucho más de su ventana antes de convertirse en trabajo.
const detenerDespachador = arrancarDespachador(
  despachador,
  Math.max(250, Math.floor(LIMITES.agrupacion.ventana_ms / 2)),
  (error) => console.error('[despachador] fallo:', error),
);

servidor.listen(PUERTO, () => {
  console.warn(`Perímetro escuchando en http://localhost:${PUERTO}`);
  console.warn('  GET  /            índice de rutas');
  console.warn('  GET  /salud');
  console.warn('  GET  /canales');
  console.warn('  POST /webhook/telegram');
  console.warn('  POST /webhook/whatsapp');
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    console.warn(`\n${senal} recibida, cerrando.`);
    detenerDespachador();
    servidor.close(() => {
      void almacen.cerrar().then(() => process.exit(0));
    });
  });
}
