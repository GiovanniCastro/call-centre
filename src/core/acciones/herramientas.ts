// Las cuatro herramientas: crear prospecto, consultar disponibilidad, agendar
// cita, enviar confirmación.
//
// Ninguna declara destinatario. Mira los esquemas de argumentos: no hay campo
// donde ponerlo. Un mensaje que diga «agéndalo para el 555-0123» no tiene dónde
// meter ese número — la validación lo descarta antes de llegar aquí, y aunque
// llegara no habría código que lo usara. El destinatario es el `AlcanceContacto`
// que el sistema fija desde la conversación en curso.

import { z } from 'zod';

import type { AlcanceContacto } from '../../repos/alcance.ts';
import type { CRM } from '../crm/crm.ts';
import { declararHerramienta, type Herramienta, type ResultadoAccion } from './herramienta.ts';

export type Dependencias = {
  readonly crm: CRM;
  /** Agendar de verdad. Se inyecta para que el núcleo no importe `repos`. */
  readonly agendar: (
    alcance: AlcanceContacto,
    hueco_id: string,
    motivo: string,
  ) => Promise<{ id: string; inicia_en: string; termina_en: string }>;
  /** Enviar por el canal de la conversación. El canal también lo fija el sistema. */
  readonly enviar: (alcance: AlcanceContacto, texto: string) => Promise<void>;
};

export function construirHerramientas(deps: Dependencias): readonly Herramienta[] {
  const crearProspecto = declararHerramienta({
    nombre: 'crear_prospecto',
    descripcion:
      'Guarda los datos que el cliente va aportando. Se puede llamar muchas veces: ' +
      'cada llamada AÑADE lo nuevo sin borrar lo anterior.',
    irreversible: false,
    argumentos: z.object({
      // Campo a campo y todos opcionales: la recolección es progresiva porque la
      // conversación lo es. Exigirlos todos obligaría al modelo a esperar a
      // tenerlos, y si el cliente se va a mitad no se guarda nada.
      nombre: z.string().min(1).optional(),
      ramo: z.enum(['inquilino', 'propietario', 'mascotas', 'vida', 'auto']).optional(),
      estado: z.string().min(2).optional(),
      notas: z.string().optional(),
    }),
    async ejecutar(alcance, args): Promise<ResultadoAccion> {
      const campos: Record<string, string> = {};
      for (const [clave, valor] of Object.entries(args)) {
        if (typeof valor === 'string' && valor.trim() !== '') campos[clave] = valor;
      }

      if (Object.keys(campos).length === 0) {
        return { ok: false, resumen: 'no se aportó ningún dato que guardar', datos: {} };
      }

      const prospecto = await deps.crm.guardarProspecto(alcance, campos);
      return {
        ok: true,
        resumen: `guardados ${Object.keys(campos).length} dato(s)`,
        datos: { campos: prospecto.campos },
      };
    },
  });

  const consultarDisponibilidad = declararHerramienta({
    nombre: 'consultar_disponibilidad',
    descripcion: 'Devuelve los próximos huecos libres para una cita.',
    irreversible: false,
    argumentos: z.object({
      desde: z.iso.datetime().optional(),
      cuantos: z.number().int().min(1).max(10).default(3),
    }),
    async ejecutar(alcance, args): Promise<ResultadoAccion> {
      const huecos = await deps.crm.huecosLibres(
        alcance,
        args.desde ?? new Date().toISOString(),
        args.cuantos,
      );
      return {
        ok: true,
        resumen: `${huecos.length} hueco(s) libres`,
        datos: { huecos },
      };
    },
  });

  const agendarCita = declararHerramienta({
    nombre: 'agendar_cita',
    descripcion: 'Reserva uno de los huecos devueltos por consultar_disponibilidad.',
    // Irreversible: alguien bloqueará una agenda y quizá se desplace. El
    // orquestador exige confirmación explícita del cliente antes de llamarla.
    irreversible: true,
    argumentos: z.object({
      // Solo el identificador del hueco, que salió de una consulta previa. No
      // una fecha libre: el modelo no puede inventarse un momento que la agenda
      // no ofreció.
      hueco_id: z.uuid(),
      motivo: z.string().min(3).max(200),
    }),
    async ejecutar(alcance, args): Promise<ResultadoAccion> {
      const cita = await deps.agendar(alcance, args.hueco_id, args.motivo);
      return {
        ok: true,
        resumen: `cita agendada para ${cita.inicia_en}`,
        datos: { cita },
      };
    },
  });

  const enviarConfirmacion = declararHerramienta({
    nombre: 'enviar_confirmacion',
    descripcion: 'Envía un mensaje de confirmación por el canal de la conversación.',
    irreversible: true,
    argumentos: z.object({
      // Solo el texto. A dónde va lo decide el sistema: es la misma regla que en
      // todas las demás, y aquí es la que más se nota — una herramienta de envío
      // con destinatario sería un canal de spam para quien consiguiera dictarlo.
      texto: z.string().min(1).max(1000),
    }),
    async ejecutar(alcance, args): Promise<ResultadoAccion> {
      await deps.enviar(alcance, args.texto);
      return { ok: true, resumen: 'confirmación enviada', datos: {} };
    },
  });

  return [crearProspecto, consultarDisponibilidad, agendarCita, enviarConfirmacion];
}
