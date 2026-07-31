// Criterio de aceptación de la fase 1:
//
//   «Reiniciar el proceso no pierde la conversación en curso.»
//
// Un doble de base de datos no puede probar esto: probaría que el doble recuerda
// lo que le dijimos. Hace falta PostgreSQL de verdad, y por eso estas pruebas
// corren solo cuando hay `DATABASE_URL` — en el CI, donde hay un contenedor.
//
// El «reinicio» se simula **cerrando el grupo de conexiones y abriendo otro**. No
// es una metáfora: es exactamente lo que sobrevive a un reinicio y lo que no. Si
// la conversación viviera en una variable del proceso, el segundo grupo no vería
// nada.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { crearConsultador, type Consultador } from '../src/repos/cliente.ts';
import { migrar } from '../src/repos/migrar.ts';
import { alcanceDeContacto } from '../src/repos/alcance.ts';
import {
  alcanceParaContacto,
  cerrarConversacion,
  conversacionAbierta,
  guardarMensajeEntrante,
  mensajesDe,
  obtenerConversacion,
} from '../src/repos/conversaciones.ts';
import { persistirGrupo } from '../src/borde/persistir.ts';
import type { MensajeCanonico } from '../src/core/mensaje.ts';

const URL_BD = process.env['DATABASE_URL'];

function mensaje(n: number, chat: string): MensajeCanonico {
  return {
    id_externo: `telegram:${chat}:${n}`,
    canal: 'telegram',
    contacto: { identificador_externo: chat, nombre_declarado: 'Ana' },
    tipo: 'texto',
    contenido: `parte ${n}`,
    adjuntos: [],
    marca_tiempo: new Date(1_785_000_000_000 + n * 1000).toISOString(),
    procedencia: 'cliente',
  };
}

if (URL_BD === undefined || URL_BD === '') {
  test('persistencia — omitida: no hay DATABASE_URL en el entorno', { skip: true }, () => {
    // No es un aprobado: es un «no se ha comprobado». En el CI hay contenedor de
    // PostgreSQL y estas pruebas sí corren.
  });
} else {
  describe('persistencia contra PostgreSQL', () => {
    let bd: Consultador;
    let n = 0;
    const chat = () => `chat-${Date.now()}-${(n += 1)}`;

    before(async () => {
      bd = crearConsultador(URL_BD);
      await migrar(bd);
    });

    after(async () => {
      await bd.cerrar();
    });

    test('las migraciones son idempotentes: correrlas dos veces no rompe', async () => {
      // Un ejecutor que solo funciona sobre base vacía obliga a borrarla para
      // probar, y eso convierte «probar la migración» en algo que nadie hace.
      assert.deepEqual(await migrar(bd), []);
    });

    test('REINICIAR EL PROCESO no pierde la conversación en curso', async () => {
      const identificador = chat();

      // ── Antes del «reinicio» ────────────────────────────────────────────
      const grupo = {
        clave: `telegram:${identificador}`,
        mensajes: [mensaje(1, identificador), mensaje(2, identificador), mensaje(3, identificador)],
      };

      const guardado = await persistirGrupo(bd, grupo);
      assert.equal(guardado.guardados, 3);

      // ── El reinicio: se cierra el grupo de conexiones y se abre otro ─────
      const otroProceso = crearConsultador(URL_BD);
      try {
        const alcance = await alcanceParaContacto(otroProceso, 'telegram', identificador, null);
        const conversacion = await conversacionAbierta(alcance, otroProceso);

        assert.equal(
          conversacion.id,
          guardado.conversacion_id,
          'el proceso nuevo encuentra la MISMA conversación, no abre otra',
        );

        const hilo = await mensajesDe(alcance, otroProceso, conversacion.id);
        assert.equal(hilo.length, 3, 'los tres mensajes siguen ahí');
        assert.deepEqual(
          hilo.map((m) => m.contenido),
          ['parte 1', 'parte 2', 'parte 3'],
          'y en orden',
        );
      } finally {
        await otroProceso.cerrar();
      }
    });

    test('el índice único es la SEGUNDA línea del rechazo de repetición', async () => {
      // Si el filtro de Redis falla —se reinició, expiró la clave— la base sigue
      // impidiendo la segunda inserción.
      const identificador = chat();
      const grupo = { clave: `telegram:${identificador}`, mensajes: [mensaje(1, identificador)] };

      const primera = await persistirGrupo(bd, grupo);
      assert.equal(primera.guardados, 1);
      assert.equal(primera.repetidos, 0);

      const segunda = await persistirGrupo(bd, grupo);
      assert.equal(segunda.guardados, 0, 'no se guardó de nuevo');
      assert.equal(segunda.repetidos, 1);

      const alcance = await alcanceParaContacto(bd, 'telegram', identificador, null);
      const hilo = await mensajesDe(alcance, bd, primera.conversacion_id);
      assert.equal(hilo.length, 1, 'un mensaje en la base, no dos');
    });

    test('UN CONTACTO NO PUEDE LEER LA CONVERSACIÓN DE OTRO', async () => {
      // El motivo de que exista toda la capa de alcance. Se prueba contra la base
      // real porque es donde tendría efecto una consulta sin filtrar.
      const unoIdent = chat();
      const otroIdent = chat();

      const deUno = await persistirGrupo(bd, {
        clave: `telegram:${unoIdent}`,
        mensajes: [mensaje(1, unoIdent)],
      });

      const alcanceDeOtro = await alcanceParaContacto(bd, 'telegram', otroIdent, null);

      // Conoce el identificador de la conversación ajena y aun así no la ve.
      assert.equal(
        await obtenerConversacion(alcanceDeOtro, bd, deUno.conversacion_id),
        null,
        'la conversación ajena no existe para este alcance',
      );

      assert.deepEqual(
        await mensajesDe(alcanceDeOtro, bd, deUno.conversacion_id),
        [],
        'ni sus mensajes',
      );

      // Y no puede escribir en ella: la inserción exige que la conversación
      // pertenezca al contacto del alcance.
      const escrito = await guardarMensajeEntrante(
        alcanceDeOtro,
        bd,
        deUno.conversacion_id,
        mensaje(99, otroIdent),
      );
      assert.equal(escrito, false, 'tampoco puede inyectar mensajes en la conversación ajena');
    });

    test('un alcance fabricado a mano con un identificador ajeno tampoco sirve', async () => {
      // El alcance legítimo se construye con `alcanceDeContacto`, así que un
      // atacante con acceso al código podría fabricar uno. Lo que lo detiene no es
      // el tipo: es que el identificador tiene que corresponder a una fila real, y
      // adivinar un UUID v4 no es viable.
      const inventado = alcanceDeContacto('99999999-9999-4999-8999-999999999999', 'telegram');
      const conversacion = await obtenerConversacion(inventado, bd, '11111111-1111-4111-8111-111111111111');
      assert.equal(conversacion, null);
    });

    test('cerrar una conversación abre una nueva en el siguiente mensaje', async () => {
      const identificador = chat();
      const alcance = await alcanceParaContacto(bd, 'telegram', identificador, null);

      const primera = await conversacionAbierta(alcance, bd);
      await cerrarConversacion(alcance, bd, primera.id);

      const segunda = await conversacionAbierta(alcance, bd);
      assert.notEqual(segunda.id, primera.id);
      assert.equal(segunda.estado, 'abierta');
    });

    test('el mismo identificador en dos canales son dos contactos distintos', async () => {
      // No tenemos forma de probar que son la misma persona, y unificarlos por
      // suposición mezclaría las conversaciones de dos clientes.
      const identificador = chat();

      const porTelegram = await alcanceParaContacto(bd, 'telegram', identificador, null);
      const porWhatsApp = await alcanceParaContacto(bd, 'whatsapp', identificador, null);

      assert.notEqual(porTelegram.contacto_id, porWhatsApp.contacto_id);
    });
  });
}
