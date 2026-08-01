// La política de enrutamiento: de una clasificación a un destino, con motivo.
//
// Toda la decisión vive en `config/politica.json`. Este archivo la valida y la
// aplica; no contiene ninguna preferencia propia. Es lo que hace cierto el
// criterio «cambiar la política en configuración cambia el destino sin
// recompilar» — y se prueba cambiándola en memoria, no leyendo el código.
//
// La regla dura se evalúa **antes** que las reglas y no está entre ellas. Si
// fuera una regla más, reordenar el archivo la desactivaría.

import { z } from 'zod';

import crudo from '../../../config/politica.json' with { type: 'json' };
import type {
  ClaseSensibilidad,
  ClaseTarea,
  DestinoEjecucion,
} from '../../telemetry/evento.ts';
import { CLASES_SENSIBILIDAD, CLASES_TAREA, DESTINOS_EJECUCION } from '../../telemetry/evento.ts';

const EsquemaRegla = z.object({
  nombre: z.string().min(1),
  si: z.object({
    clase_tarea: z.array(z.enum(CLASES_TAREA)).optional(),
    clase_sensibilidad: z.array(z.enum(CLASES_SENSIBILIDAD)).optional(),
  }),
  destino: z.enum(DESTINOS_EJECUCION),
  por_que: z.string().min(1),
});

const EsquemaPolitica = z.object({
  version: z.literal(1),
  regla_dura: z.object({
    nombre: z.string().min(1),
    clase_sensibilidad: z.enum(CLASES_SENSIBILIDAD),
    destino: z.enum(DESTINOS_EJECUCION),
    por_que: z.string().min(1),
    // `false` literal, no booleano: que el archivo pueda decir «sí se puede»
    // sería exactamente el agujero que la regla dura viene a tapar.
    se_puede_desactivar: z.literal(false),
  }),
  reglas: z.array(EsquemaRegla).min(1),
  respaldo: z.object({
    activo: z.boolean(),
    tiempo_maximo_ms: z.number().int().positive(),
    de: z.enum(DESTINOS_EJECUCION),
    a: z.enum(DESTINOS_EJECUCION),
    por_que: z.string().min(1),
  }),
  modelos: z.object({
    local: z.string().min(1),
    nube: z.string().min(1),
  }),
  /**
   * Cómo se muestrea. Vive en configuración porque es una decisión del proyecto,
   * no un detalle de un adaptador, y porque cambiarla tiene que dejar diff, autor
   * y fecha: una temperatura que se puede mover sin rastro invalida en silencio
   * toda cifra medida antes del cambio.
   */
  muestreo: z.object({
    temperatura: z.number().min(0).max(2),
    semilla: z.number().int().optional(),
    por_que: z.string().min(1),
  }),
});

export type Politica = z.infer<typeof EsquemaPolitica>;

export function politicaDesde(valor: unknown): Politica {
  const resultado = EsquemaPolitica.safeParse(valor);
  if (!resultado.success) {
    throw new Error(`config/politica.json no valida: ${z.prettifyError(resultado.error)}`);
  }

  const politica = resultado.data;

  if (politica.regla_dura.destino !== 'local') {
    throw new Error(
      'La regla dura tiene que enrutar a «local». Una regla dura que manda a la nube ' +
        'los casos de sensibilidad alta no es una regla dura, es lo contrario.',
    );
  }

  return politica;
}

export const POLITICA: Politica = politicaDesde(crudo);

export type Decision = {
  readonly destino: DestinoEjecucion;
  readonly modelo: string;
  readonly motivo: string;
  /** Si la decisión la tomó la regla dura. El respaldo no puede saltársela. */
  readonly por_regla_dura: boolean;
  /** Si se puede desviar a otro plano cuando este no alcance. */
  readonly admite_respaldo: boolean;
};

export type EntradaDeDecision = {
  readonly clase_tarea: ClaseTarea;
  readonly clase_sensibilidad: ClaseSensibilidad;
};

/**
 * A dónde va este caso, y por qué.
 *
 * @param politica Se pasa en lugar de leerse del módulo para que las pruebas
 *   puedan demostrar el criterio de aceptación —cambiar la política cambia el
 *   destino— sin escribir en disco.
 */
export function decidir(
  entrada: EntradaDeDecision,
  politica: Politica = POLITICA,
): Decision {
  if (entrada.clase_sensibilidad === politica.regla_dura.clase_sensibilidad) {
    return {
      destino: politica.regla_dura.destino,
      modelo: politica.modelos[politica.regla_dura.destino],
      motivo: `REGLA DURA · ${politica.regla_dura.nombre}`,
      por_regla_dura: true,
      // Un respaldo que pudiera desviar a la nube un caso retenido por la regla
      // dura convertiría el freno en una sugerencia.
      admite_respaldo: false,
    };
  }

  for (const regla of politica.reglas) {
    const porTarea = regla.si.clase_tarea;
    const porSensibilidad = regla.si.clase_sensibilidad;

    if (porTarea !== undefined && !porTarea.includes(entrada.clase_tarea)) continue;
    if (porSensibilidad !== undefined && !porSensibilidad.includes(entrada.clase_sensibilidad)) {
      continue;
    }

    return {
      destino: regla.destino,
      modelo: politica.modelos[regla.destino],
      motivo: `regla «${regla.nombre}»`,
      por_regla_dura: false,
      admite_respaldo: politica.respaldo.activo && regla.destino === politica.respaldo.de,
    };
  }

  // Sin regla que case, el destino es el que menos compromete: local. Devolver
  // un error dejaría el caso sin atender por un hueco en la configuración, y
  // mandarlo a la nube sacaría datos por omisión — que es la peor forma de
  // sacarlos.
  return {
    destino: 'local',
    modelo: politica.modelos.local,
    motivo:
      'ninguna regla casó con la clasificación; se aplica el destino por omisión, que es local ' +
      'porque un hueco en la política no puede convertirse en una salida de datos',
    por_regla_dura: false,
    admite_respaldo: false,
  };
}
