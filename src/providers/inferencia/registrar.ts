// El registro de proveedores: de `config/proveedores.json` al estado de cada uno.
//
// Es la lista que responde a «¿dónde pego la clave y qué se activa?». Cada
// proveedor sale en uno de tres estados y el arranque los imprime:
//
//   ✓ configurado      — tiene adaptador y tiene credencial
//   ✗ no_configurado   — tiene adaptador, le falta la credencial (pégala y va)
//   · sin_adaptador    — está declarado, pero no hay código que use la clave
//
// El tercero existe porque prometer que pegar una clave activa un proveedor que
// nadie ha escrito es exactamente la clase de cifra que este proyecto prohíbe:
// una que suena a capacidad y no lo es.

import { z } from 'zod';

import crudo from '../../../config/proveedores.json' with { type: 'json' };
import { EsquemaRequisito, type Requisito } from '../../core/canal.ts';
import type { EstadoProveedor } from '../../core/inferencia/puerto.ts';
import { InferenciaAnthropic } from './anthropic.ts';
import { InferenciaOllama } from './ollama.ts';

const EsquemaProveedor = z.object({
  adaptador: z.union([z.literal('escrito'), z.literal('sin_escribir')]),
  anfitrion: z.string().min(1),
  modelo_por_defecto: z.string().min(1),
  nota: z.string().optional(),
  requisitos: z.array(EsquemaRequisito).min(1),
});

const EsquemaRegistro = z.object({
  version: z.literal(1),
  proveedores: z.record(z.string(), EsquemaProveedor),
  local: z.object({ motor: z.literal('ollama'), url_por_defecto: z.string().url() }),
});

export type RegistroDeProveedores = z.infer<typeof EsquemaRegistro>;

export function registroDesde(valor: unknown): RegistroDeProveedores {
  const resultado = EsquemaRegistro.safeParse(valor);
  if (!resultado.success) {
    throw new Error(`config/proveedores.json no valida: ${z.prettifyError(resultado.error)}`);
  }
  return resultado.data;
}

export const REGISTRO: RegistroDeProveedores = registroDesde(crudo);

/**
 * Los adaptadores que existen de verdad, por nombre de proveedor.
 *
 * Que esta tabla y el campo `adaptador` del JSON puedan discrepar es el motivo
 * de la comprobación de abajo: si el archivo dice `escrito` y aquí no hay nada,
 * el registro mentiría sobre lo que pasa al pegar la clave.
 */
const CONSTRUCTORES: Readonly<
  Record<string, (valores: Readonly<Record<string, string>>, modelo: string) => InferenciaAnthropic>
> = {
  anthropic: (valores, modelo) =>
    new InferenciaAnthropic({ clave: valores['ANTHROPIC_API_KEY'] ?? '', modelo }),
};

export function estadoDeProveedor(
  nombre: string,
  registro: RegistroDeProveedores = REGISTRO,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): EstadoProveedor {
  const declarado = registro.proveedores[nombre];
  if (declarado === undefined) {
    throw new Error(
      `El proveedor «${nombre}» no está en config/proveedores.json. Añadirlo ahí es el ` +
        'primer paso; el segundo es su anfitrión en config/destinos.json.',
    );
  }

  const requisitos: readonly Requisito[] = declarado.requisitos;

  if (declarado.adaptador === 'sin_escribir') {
    return {
      estado: 'sin_adaptador',
      proveedor: nombre,
      requisitos,
      nota: declarado.nota ?? 'Falta implementar la interfaz `Inferencia` para este proveedor.',
    };
  }

  const construir = CONSTRUCTORES[nombre];
  if (construir === undefined) {
    // El archivo promete un adaptador que no existe. Se dice, en lugar de
    // reventar más tarde con un error de otra cosa.
    return {
      estado: 'sin_adaptador',
      proveedor: nombre,
      requisitos,
      nota:
        `config/proveedores.json declara el adaptador de «${nombre}» como escrito, pero no hay ` +
        'ninguno registrado en src/providers/inferencia/registrar.ts.',
    };
  }

  const valores: Record<string, string> = {};
  const faltan: string[] = [];

  for (const requisito of requisitos) {
    const valor = entorno[requisito.variable];
    if (valor === undefined || valor.trim() === '') faltan.push(requisito.variable);
    else valores[requisito.variable] = valor;
  }

  if (faltan.length > 0) return { estado: 'no_configurado', proveedor: nombre, requisitos, faltan };

  return {
    estado: 'configurado',
    proveedor: nombre,
    inferencia: construir(valores, declarado.modelo_por_defecto),
  };
}

/** Todos, en el orden del archivo. Es lo que imprime el arranque y lee el panel. */
export function estadoDeTodos(
  registro: RegistroDeProveedores = REGISTRO,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): readonly EstadoProveedor[] {
  return Object.keys(registro.proveedores).map((nombre) =>
    estadoDeProveedor(nombre, registro, entorno),
  );
}

/** El proveedor local. No lleva clave: lleva modelo descargado. */
export function inferenciaLocal(
  modelo: string,
  registro: RegistroDeProveedores = REGISTRO,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): InferenciaOllama {
  return new InferenciaOllama({
    url: entorno['OLLAMA_URL'] ?? registro.local.url_por_defecto,
    modelo,
  });
}
