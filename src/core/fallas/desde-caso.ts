// De un desenlace de caso a una observación del vigía de fallas.
//
// Este archivo es corto y es el más importante de la carpeta, porque es donde se
// decide **qué cuenta como falla**. Una disponibilidad del 62 % y una del 94 %
// sobre la misma corrida son la misma medición con dos definiciones distintas de
// fallo, y la definición no puede quedar repartida por los sitios que llaman al
// vigía: se escribe una vez, aquí, y se lee.
//
// La regla, en una frase: **falla es que el sistema no pudiera hacer su trabajo,
// no que decidiera correctamente no hacerlo.**
//
// De ahí salen las dos listas, y las dos importan:
//
// | Desenlace | ¿Falla? | Por qué |
// |---|---|---|
// | excepción | **sí** | el caso reventó |
// | `sin_sustento` | **sí** | el modelo respondió sin procedencia comprobable |
// | `esquema_invalido` | **sí** | el modelo no devolvió la forma pactada |
// | `fallo_de_ejecucion` | **sí** | un freno interno cortó el caso |
// | `sin_fuentes` | no | invariante 1 funcionando: sin fuente no hay respuesta |
// | `modelo_no_puede` | no | el modelo declinó, que es lo correcto cuando no sabe |
// | `bloqueado` | no | perímetro, fuga o aislamiento actuando |
// | `resuelto` | no | — |
//
// Las cuatro de abajo son las que tientan. Contar un `sin_fuentes` como falla
// haría que cumplir el invariante 1 bajara la disponibilidad, y con el tiempo
// alguien «mejoraría» la cifra aflojando el invariante — que es el modo de fallo
// que más caro sale en un sistema con métricas. Lo mismo con `bloqueado`: un
// vigía de perímetro que retiene un dato sensible estaría penalizando al sistema
// por protegerlo.
//
// `sin_sustento` sí es falla, y conviene decir por qué no es lo mismo que
// `sin_fuentes`. En `sin_fuentes` no había nada que citar y el agente escaló: no
// se le puede pedir más. En `sin_sustento` **se le dieron fragmentos y no los
// citó**: el verificador bloqueó bien, pero el trabajo no se hizo. La falla es
// del modelo, no del verificador, y por eso no se arregla aflojando el umbral.

import type { ClaseDeEscalado } from '../respuesta/responder.ts';
import type { Observacion } from './vigia.ts';

/** Lo mínimo del desenlace de un caso para saber si fue falla. */
export type DesenlaceDeCaso = {
  readonly caso_id: string;
  readonly canal: string;
  readonly clase_tarea: string;
  readonly resultado: string;
  readonly clase_escalado: ClaseDeEscalado | 'peticion_bloqueada' | null;
  readonly motivo_escalado: string | null;
  /** El texto que entró. Se sanea dentro del vigía; aquí viaja crudo y no sale. */
  readonly mensaje: string;
  readonly momento: string;
  /** Si el caso reventó, el texto de la excepción. */
  readonly error?: string | null;
};

/** Las clases de escalado que SÍ son una falla del sistema. */
const ESCALADOS_QUE_SON_FALLA: ReadonlySet<string> = new Set<ClaseDeEscalado>([
  'sin_sustento',
  'esquema_invalido',
  'fallo_de_ejecucion',
]);

export function observacionDe(desenlace: DesenlaceDeCaso): Observacion {
  const base = {
    operacion: 'caso',
    momento: desenlace.momento,
    caso_id: desenlace.caso_id,
    canal: desenlace.canal,
    clase_tarea: desenlace.clase_tarea,
    mensaje: desenlace.mensaje,
  } as const;

  if (desenlace.error !== undefined && desenlace.error !== null && desenlace.error !== '') {
    return { ...base, falla: { mensaje: desenlace.error, destino: null } };
  }

  if (desenlace.clase_escalado !== null && ESCALADOS_QUE_SON_FALLA.has(desenlace.clase_escalado)) {
    return {
      ...base,
      falla: {
        // El motivo del propio sistema, no una frase escrita aquí: es lo que el
        // clasificador lee y lo que acabará en la plantilla del informe. Una
        // descripción inventada en este archivo agruparía por lo que dijimos
        // nosotros en vez de por lo que pasó.
        mensaje:
          desenlace.motivo_escalado ?? `escalado por ${String(desenlace.clase_escalado)} sin motivo registrado`,
        destino: null,
      },
    };
  }

  return base;
}
