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

const PUERTO = Number(process.env['PUERTO'] ?? 8787);

const registro = construirRegistro();
const cola = new ColaEnMemoria();

console.warn(parteDeCanales(registro));

if (registro.activos().length === 0) {
  console.warn(
    'Ningún canal configurado. El servidor arranca igual: /salud y /canales responden,\n' +
      'y los webhooks devuelven 503 diciendo qué falta. Copia .env.ejemplo a .env para\n' +
      'configurar Telegram.\n',
  );
}

if (!cola.persistente) {
  console.warn(
    '⚠  La cola es EN MEMORIA: se pierde al reiniciar. La de Redis llega con la\n' +
      '   segunda mitad de la fase 1. Hasta entonces, el criterio «reiniciar el proceso\n' +
      '   no pierde la conversación en curso» NO se cumple, y no debe darse por bueno.\n',
  );
}

const servidor = crearServidor({ registro, cola });

servidor.listen(PUERTO, () => {
  console.warn(`Perímetro escuchando en http://localhost:${PUERTO}`);
  console.warn('  GET  /salud');
  console.warn('  GET  /canales');
  console.warn('  POST /webhook/telegram');
  console.warn('  POST /webhook/whatsapp');
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    console.warn(`\n${senal} recibida, cerrando.`);
    servidor.close(() => process.exit(0));
  });
}
