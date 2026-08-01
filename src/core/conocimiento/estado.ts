// «Declarado sin configurar», aplicado al proveedor de embeddings.
//
// Es el mismo patrón que sostiene el conector de WhatsApp desde la fase 1, y por
// la misma razón: un proveedor a medias falla en la primera consulta real, que es
// el peor momento para descubrir que faltaba una credencial. O está utilizable, o
// es una declaración de lo que le falta. No hay tercer estado.
//
// El tipo `Requisito` se reutiliza tal cual desde `core/canal.ts`; lo que no se
// reutiliza es `evaluarRequisitos`, porque devuelve un `EstadoCanal` con el campo
// llamado `canal`. Unificar los dos evaluadores en uno genérico es limpieza
// razonable, pero tocaría código de la fase 1 sin que ningún criterio de la 2 lo
// pida — queda anotado como pendiente, no hecho de paso.

import type { Requisito } from '../canal.ts';
import type { Embeddings } from './puertos.ts';

export type EstadoEmbeddings =
  | { readonly estado: 'configurado'; readonly origen: string; readonly embeddings: Embeddings }
  | {
      readonly estado: 'no_configurado';
      readonly origen: string;
      readonly requisitos: readonly Requisito[];
      readonly faltan: readonly string[];
    };

/**
 * Todo o nada, igual que en los canales: con un requisito ausente el proveedor
 * queda declarado y sin configurar.
 */
export function evaluarProveedor(
  origen: string,
  requisitos: readonly Requisito[],
  entorno: Readonly<Record<string, string | undefined>>,
  construir: (valores: Readonly<Record<string, string>>) => Embeddings,
): EstadoEmbeddings {
  const valores: Record<string, string> = {};
  const faltan: string[] = [];

  for (const requisito of requisitos) {
    const valor = entorno[requisito.variable];
    if (valor === undefined || valor.trim() === '') {
      faltan.push(requisito.variable);
    } else {
      valores[requisito.variable] = valor;
    }
  }

  if (faltan.length > 0) return { estado: 'no_configurado', origen, requisitos, faltan };
  return { estado: 'configurado', origen, embeddings: construir(valores) };
}

export class ErrorDeEmbeddings extends Error {
  override readonly name = 'ErrorDeEmbeddings';
}

/**
 * El proveedor, listo para usar.
 *
 * @throws {ErrorDeEmbeddings} Si está declarado pero sin configurar. El mensaje
 *   dice qué variable falta y cómo se consigue: es lo que va a leer quien
 *   intente ponerlo en marcha.
 */
export function exigirConfigurado(estado: EstadoEmbeddings): Embeddings {
  if (estado.estado === 'configurado') return estado.embeddings;

  const detalle = estado.requisitos
    .filter((r) => estado.faltan.includes(r.variable))
    .map((r) => `  ✗ ${r.variable}\n      ${r.descripcion}\n      ${r.como_obtenerlo}`)
    .join('\n');

  throw new ErrorDeEmbeddings(
    `El proveedor de embeddings «${estado.origen}» está declarado pero no configurado.\n` +
      `Faltan ${estado.faltan.length} de ${estado.requisitos.length} requisitos:\n${detalle}`,
  );
}
