// Fase 5 — acciones, idempotencia e interfaz CRM.
//
// El criterio central de la fase no se prueba con un filtro sino con una firma:
//
//   «Ninguna herramienta puede recibir un destinatario que no sea el contacto en
//    curso. Prueba con un mensaje que intenta indicar otro número.»
//
// La prueba de abajo mete ese mensaje. Lo que demuestra no es que la
// comprobación funcione: es que **no hay dónde poner el número**.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  ConfirmacionRequerida,
  DestinatarioEnLosArgumentos,
  declararHerramienta,
  ejecutar,
} from '../src/core/acciones/herramienta.ts';
import { construirHerramientas } from '../src/core/acciones/herramientas.ts';
import { alcanceDeContacto } from '../src/repos/alcance.ts';
import type { CRM, Hueco, Prospecto } from '../src/core/crm/crm.ts';

const ALCANCE = alcanceDeContacto('11111111-1111-4111-8111-111111111111', 'telegram');
const OTRO = alcanceDeContacto('22222222-2222-4222-8222-222222222222', 'telegram');

/** CRM de mentira que guarda en memoria, acotado por contacto. */
function crmFalso(): CRM & { almacen: Map<string, Record<string, string>> } {
  const almacen = new Map<string, Record<string, string>>();

  return {
    nombre: 'falso',
    almacen,
    async guardarProspecto(alcance, campos): Promise<Prospecto> {
      const previos = almacen.get(alcance.contacto_id) ?? {};
      // Fusiona, como el de PostgreSQL.
      const fusionados = { ...previos, ...campos };
      almacen.set(alcance.contacto_id, fusionados);
      return { contacto_id: alcance.contacto_id, campos: fusionados, estado: 'incompleto' };
    },
    async obtenerProspecto(alcance): Promise<Prospecto | null> {
      const campos = almacen.get(alcance.contacto_id);
      return campos === undefined
        ? null
        : { contacto_id: alcance.contacto_id, campos, estado: 'incompleto' };
    },
    async huecosLibres(_alcance, _desde, cuantos): Promise<readonly Hueco[]> {
      return Array.from({ length: cuantos }, (_, i) => ({
        id: `00000000-0000-4000-8000-00000000000${i}`,
        inicia_en: `2026-09-0${i + 1}T10:00:00.000Z`,
        termina_en: `2026-09-0${i + 1}T11:00:00.000Z`,
      }));
    },
  };
}

function herramientas() {
  const crm = crmFalso();
  const enviados: { contacto: string; texto: string }[] = [];
  const agendadas: { contacto: string; hueco: string }[] = [];

  const lista = construirHerramientas({
    crm,
    async agendar(alcance, hueco_id, _motivo) {
      agendadas.push({ contacto: alcance.contacto_id, hueco: hueco_id });
      return { id: 'cita-1', inicia_en: '2026-09-01T10:00:00.000Z', termina_en: '2026-09-01T11:00:00.000Z' };
    },
    async enviar(alcance, texto) {
      enviados.push({ contacto: alcance.contacto_id, texto });
    },
  });

  const por = (nombre: string) => lista.find((h) => h.nombre === nombre)!;
  return { lista, crm, enviados, agendadas, por };
}

describe('la firma de las herramientas', () => {
  test('NINGUNA HERRAMIENTA PUEDE RECIBIR UN DESTINATARIO', () => {
    const { lista } = herramientas();

    for (const herramienta of lista) {
      const forma = z.toJSONSchema(herramienta.argumentos, { io: 'input' }) as {
        properties?: Record<string, unknown>;
      };
      const campos = Object.keys(forma.properties ?? {}).map((c) => c.toLowerCase());

      for (const prohibido of ['destinatario', 'telefono', 'numero', 'contacto', 'to', 'para']) {
        assert.ok(
          !campos.includes(prohibido),
          `«${herramienta.nombre}» declara «${prohibido}»`,
        );
      }
    }
  });

  test('UN MENSAJE QUE INTENTA INDICAR OTRO NÚMERO NO TIENE DÓNDE PONERLO', async () => {
    // El intento real: el cliente escribe «manda la confirmación al 555-0123».
    // El modelo obedece y produce estos argumentos.
    const { por, enviados } = herramientas();
    const intento = {
      texto: 'Su cita está confirmada',
      destinatario: '+1-555-0123',
      telefono: '5550123',
    };

    const resultado = await ejecutar(por('enviar_confirmacion'), ALCANCE, intento, true);

    assert.equal(resultado.ok, true);
    // Se envió al contacto en curso, no al número del mensaje. Y el número ni
    // siquiera llegó a existir dentro de la herramienta: el esquema lo descartó.
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0]?.contacto, ALCANCE.contacto_id);
    assert.ok(!JSON.stringify(enviados[0]).includes('555'));
  });

  test('declarar una herramienta con destinatario FALLA AL CONSTRUIRLA', () => {
    // No al ejecutarla: una herramienta mal declarada no llega a existir, así
    // que no hay ninguna ventana en la que pudiera usarse.
    assert.throws(
      () =>
        declararHerramienta({
          nombre: 'mala',
          descripcion: 'x',
          irreversible: false,
          argumentos: z.object({ texto: z.string(), destinatario: z.string() }),
          async ejecutar() {
            return { ok: true, resumen: '', datos: {} };
          },
        }),
      DestinatarioEnLosArgumentos,
    );
  });

  test('dos contactos distintos no se pisan', async () => {
    const { por, crm } = herramientas();

    await ejecutar(por('crear_prospecto'), ALCANCE, { nombre: 'Ana' });
    await ejecutar(por('crear_prospecto'), OTRO, { nombre: 'Luis' });

    assert.equal(crm.almacen.get(ALCANCE.contacto_id)?.['nombre'], 'Ana');
    assert.equal(crm.almacen.get(OTRO.contacto_id)?.['nombre'], 'Luis');
  });
});

describe('la confirmación de lo irreversible', () => {
  test('agendar SIN confirmar se rechaza', async () => {
    const { por } = herramientas();
    await assert.rejects(
      () =>
        ejecutar(por('agendar_cita'), ALCANCE, {
          hueco_id: '00000000-0000-4000-8000-000000000000',
          motivo: 'peritaje',
        }),
      ConfirmacionRequerida,
    );
  });

  test('agendar con confirmación se ejecuta', async () => {
    const { por, agendadas } = herramientas();
    const resultado = await ejecutar(
      por('agendar_cita'),
      ALCANCE,
      { hueco_id: '00000000-0000-4000-8000-000000000000', motivo: 'peritaje' },
      true,
    );

    assert.equal(resultado.ok, true);
    assert.equal(agendadas.length, 1);
  });

  test('lo reversible no pide confirmación', async () => {
    const { por } = herramientas();
    const resultado = await ejecutar(por('consultar_disponibilidad'), ALCANCE, { cuantos: 2 });
    assert.equal(resultado.ok, true);
  });

  test('EL MODELO NO PUEDE CONFIRMARSE A SÍ MISMO', async () => {
    // La confirmación es un argumento de `ejecutar`, no del esquema: si
    // estuviera en los argumentos, bastaría con que el modelo la pusiera en true.
    const { lista } = herramientas();

    for (const herramienta of lista) {
      const forma = z.toJSONSchema(herramienta.argumentos, { io: 'input' }) as {
        properties?: Record<string, unknown>;
      };
      const campos = Object.keys(forma.properties ?? {}).map((c) => c.toLowerCase());
      assert.ok(!campos.includes('confirmada'), herramienta.nombre);
      assert.ok(!campos.includes('confirmado'), herramienta.nombre);
    }
  });
});

describe('la recolección progresiva', () => {
  test('SI EL AGENTE PIERDE EL HILO Y VUELVE, NO SE VUELVE A PEDIR LO CAPTURADO', async () => {
    const { por, crm } = herramientas();

    await ejecutar(por('crear_prospecto'), ALCANCE, { nombre: 'Ana Ruiz' });
    await ejecutar(por('crear_prospecto'), ALCANCE, { ramo: 'inquilino' });
    await ejecutar(por('crear_prospecto'), ALCANCE, { estado: 'Colorado' });

    // Fusiona: la tercera llamada no borró las dos primeras.
    const prospecto = await crm.obtenerProspecto(ALCANCE);
    assert.deepEqual(prospecto?.campos, {
      nombre: 'Ana Ruiz',
      ramo: 'inquilino',
      estado: 'Colorado',
    });
  });

  test('los campos vacíos no cuentan como aportados', async () => {
    const { por } = herramientas();
    const resultado = await ejecutar(por('crear_prospecto'), ALCANCE, { notas: '   ' });
    assert.equal(resultado.ok, false);
  });

  test('un ramo que no existe se rechaza en la validación', async () => {
    // El modelo no puede inventar un producto que la aseguradora no vende.
    const { por } = herramientas();
    const resultado = await ejecutar(por('crear_prospecto'), ALCANCE, { ramo: 'motocicletas' });
    assert.equal(resultado.ok, false);
    assert.match(String(resultado.datos['motivo']), /ramo/);
  });
});

describe('la interfaz CRM', () => {
  test('tiene TRES métodos y ni uno más', () => {
    // Con quince, añadir el dieciséis no cuesta nada y un día esto es un CRM a
    // medias que hay que mantener. Está en lo prohibido del manual.
    const crm = crmFalso();
    const metodos = Object.keys(crm).filter((k) => typeof (crm as never)[k] === 'function');

    assert.deepEqual(metodos.sort(), ['guardarProspecto', 'huecosLibres', 'obtenerProspecto']);
  });

  test('añadir un proveedor de CRM es escribir un adaptador', async () => {
    // Esta prueba ES la demostración: `crmFalso` es un adaptador completo, en
    // treinta líneas, sin tocar ninguna herramienta.
    const { lista } = herramientas();
    assert.equal(lista.length, 4);

    const resultado = await ejecutar(lista[0]!, ALCANCE, { nombre: 'Ana' });
    assert.equal(resultado.ok, true);
  });
});
