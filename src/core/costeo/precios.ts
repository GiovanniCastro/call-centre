// Carga y validación de la configuración de costo. Es el único módulo del
// sistema que lee `config/precios.json` y `config/maquina-referencia.json`; el
// check de arquitectura y el lint lo hacen cumplir.
//
// La validación ocurre al cargar el módulo, no al primer costeo. Una tabla de
// precios malformada tiene que reventar al arrancar, con un mensaje que diga qué
// campo está mal — no producir un `NaN` que viaje hasta el panel.

import { z } from 'zod';

import preciosCrudos from '../../../config/precios.json' with { type: 'json' };
import maquinaCruda from '../../../config/maquina-referencia.json' with { type: 'json' };

const positivo = z.number().nonnegative();

const EsquemaModeloNube = z.object({
  entrada_por_millon: positivo,
  salida_por_millon: positivo,
  contexto: z.number().int().positive(),
  salida_maxima: z.number().int().positive(),
  nota: z.string().optional(),
});

const EsquemaPrecios = z.object({
  version: z.literal(1),
  moneda: z.literal('USD'),
  actualizado: z.string(),
  nube: z.record(
    z.string(),
    z.object({
      fuente: z.string(),
      consultado: z.string(),
      modelos: z.record(z.string(), EsquemaModeloNube),
    }),
  ),
});

const EsquemaMaquina = z.object({
  version: z.literal(1),
  moneda: z.literal('USD'),
  estado: z.union([z.literal('PROVISIONAL'), z.literal('CONFIRMADA')]),
  equipo: z.string(),
  costo_equipo: positivo,
  vida_util_anios: z.number().positive(),
  utilizacion_asumida: z.number().positive().max(1),
  potencia_vatios: positivo,
  precio_kwh: positivo,
  mantenimiento_anual: positivo,
});

export type ModeloNube = z.infer<typeof EsquemaModeloNube>;
export type MaquinaDeReferencia = z.infer<typeof EsquemaMaquina>;

export type TablaDePrecios = {
  readonly actualizado: string;
  readonly nube: ReadonlyMap<string, { readonly proveedor: string; readonly modelo: ModeloNube }>;
  readonly maquina: MaquinaDeReferencia;
};

/** Aplana `proveedor → modelos` a un solo índice por identificador de modelo. */
function construirTabla(
  precios: z.infer<typeof EsquemaPrecios>,
  maquina: MaquinaDeReferencia,
): TablaDePrecios {
  const nube = new Map<string, { proveedor: string; modelo: ModeloNube }>();

  for (const [proveedor, bloque] of Object.entries(precios.nube)) {
    for (const [id, modelo] of Object.entries(bloque.modelos)) {
      if (nube.has(id)) {
        throw new Error(
          `config/precios.json: el modelo «${id}» está declarado por dos proveedores. ` +
            'Un identificador de modelo con dos precios hace que el costo dependa de ' +
            'en qué orden se leyó el archivo.',
        );
      }
      nube.set(id, { proveedor, modelo });
    }
  }

  return { actualizado: precios.actualizado, nube, maquina };
}

function validar(): TablaDePrecios {
  const precios = EsquemaPrecios.safeParse(preciosCrudos);
  if (!precios.success) {
    throw new Error(`config/precios.json no valida: ${z.prettifyError(precios.error)}`);
  }

  const maquina = EsquemaMaquina.safeParse(maquinaCruda);
  if (!maquina.success) {
    throw new Error(
      `config/maquina-referencia.json no valida: ${z.prettifyError(maquina.error)}`,
    );
  }

  return construirTabla(precios.data, maquina.data);
}

/** La tabla vigente, ya validada. */
export const TABLA: TablaDePrecios = validar();

/**
 * Construye una tabla a partir de objetos en memoria. Existe para que las
 * pruebas puedan demostrar el criterio de aceptación «cambiar un precio en
 * `config/` cambia los totales sin tocar código» sin escribir en disco.
 */
export function tablaDesde(precios: unknown, maquina: unknown): TablaDePrecios {
  return construirTabla(EsquemaPrecios.parse(precios), EsquemaMaquina.parse(maquina));
}
