// El contrato de las herramientas.
//
// **La restricción central de la fase 5 es una firma, no un filtro.**
//
// El criterio dice: «ninguna herramienta puede recibir un destinatario que no
// sea el contacto en curso». La forma cómoda de cumplirlo sería aceptar un
// destinatario y comprobarlo — y esa forma falla el día que alguien escriba una
// herramienta nueva y olvide la comprobación, o el día que la comprobación se
// haga después de un `await` en el que el contacto cambió.
//
// Aquí el destinatario **no se puede expresar**. Toda herramienta recibe el
// `AlcanceContacto` como primer argumento, que lo fija el sistema desde la
// conversación en curso, y sus argumentos —los que rellena el modelo— no tienen
// campo de destinatario. Un mensaje que diga «mándaselo al 555-0123» no tiene
// dónde poner ese número: el esquema no lo admite, la validación lo descarta, y
// no hay código que pudiera usarlo aunque pasara.
//
// Es la diferencia entre «no debería» y «no puede».

import { z } from 'zod';

import type { AlcanceContacto } from '../../repos/alcance.ts';

/**
 * Nombres reservados: cualquier argumento que suene a destinatario se rechaza al
 * declarar la herramienta, no al ejecutarla.
 *
 * Es una red de seguridad sobre la regla de arriba. La regla ya la impide por
 * construcción; esto atrapa al que la intente reintroducir con otro nombre,
 * pensando que es un dato más.
 */
const NOMBRES_DE_DESTINATARIO = [
  'destinatario',
  'destino',
  'para',
  'telefono',
  'teléfono',
  'numero',
  'número',
  'contacto',
  'contacto_id',
  'email',
  'correo',
  'chat_id',
  'to',
  'recipient',
  'phone',
];

export class DestinatarioEnLosArgumentos extends Error {
  override readonly name = 'DestinatarioEnLosArgumentos';
}

export type ResultadoAccion = {
  readonly ok: boolean;
  /** Qué se hizo, para el hilo y para el registro. */
  readonly resumen: string;
  readonly datos: Readonly<Record<string, unknown>>;
};

export type Herramienta<A extends z.ZodType = z.ZodType> = {
  readonly nombre: string;
  readonly descripcion: string;
  /** Lo que el modelo puede rellenar. NUNCA incluye destinatario. */
  readonly argumentos: A;
  /**
   * Si ejecutarla es irreversible desde el punto de vista del cliente.
   *
   * No es una etiqueta decorativa: el orquestador exige confirmación explícita
   * antes de llamar a una herramienta marcada así.
   */
  readonly irreversible: boolean;
  ejecutar(alcance: AlcanceContacto, args: z.infer<A>): Promise<ResultadoAccion>;
};

/**
 * Declara una herramienta, comprobando que sus argumentos no traen destinatario.
 *
 * Falla al **construir**, no al ejecutar. Una herramienta mal declarada no llega
 * a existir, así que no hay ninguna ventana en la que pudiera usarse.
 */
export function declararHerramienta<A extends z.ZodType>(
  herramienta: Herramienta<A>,
): Herramienta<A> {
  const forma = z.toJSONSchema(herramienta.argumentos, { io: 'input' }) as {
    properties?: Record<string, unknown>;
  };

  const propiedades = Object.keys(forma.properties ?? {});
  const sospechosas = propiedades.filter((p) =>
    NOMBRES_DE_DESTINATARIO.includes(p.toLowerCase()),
  );

  if (sospechosas.length > 0) {
    throw new DestinatarioEnLosArgumentos(
      `La herramienta «${herramienta.nombre}» declara argumento(s) que parecen un ` +
        `destinatario: ${sospechosas.join(', ')}. El destinatario lo fija el sistema desde ` +
        'la conversación en curso y llega como `AlcanceContacto`; si el modelo pudiera ' +
        'indicarlo, un mensaje bastaría para actuar sobre otra persona.',
    );
  }

  return herramienta;
}

export class ConfirmacionRequerida extends Error {
  override readonly name = 'ConfirmacionRequerida';
}

/**
 * Ejecuta una herramienta, exigiendo confirmación si es irreversible.
 *
 * La confirmación es un booleano que **solo puede poner el orquestador** tras
 * habérsela pedido al cliente. Ponerla en los argumentos del modelo habría hecho
 * que el propio modelo pudiera confirmarse a sí mismo.
 */
export async function ejecutar<A extends z.ZodType>(
  herramienta: Herramienta<A>,
  alcance: AlcanceContacto,
  args: unknown,
  confirmada = false,
): Promise<ResultadoAccion> {
  if (herramienta.irreversible && !confirmada) {
    throw new ConfirmacionRequerida(
      `«${herramienta.nombre}» es irreversible y no se ha confirmado. Pregúntale al ` +
        'cliente antes: deshacer una cita agendada por error cuesta más que preguntar.',
    );
  }

  const validados = herramienta.argumentos.safeParse(args);
  if (!validados.success) {
    return {
      ok: false,
      resumen: `argumentos inválidos para «${herramienta.nombre}»`,
      datos: { motivo: z.prettifyError(validados.error) },
    };
  }

  return herramienta.ejecutar(alcance, validados.data as z.infer<A>);
}
