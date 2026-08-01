// Cableado del conocimiento: de la configuración a los objetos concretos.
//
// Es el único sitio donde se decide qué implementación se usa. La recuperación no
// lo sabe y no puede saberlo: recibe `Embeddings` y `AlmacenVectorial`, que es lo
// que hace cierto el criterio «los embeddings se generan local o en nube según
// configuración, sin tocar el código de recuperación».

import type { ConfigConocimiento } from '../core/conocimiento/config.ts';
import { exigirConfigurado, type EstadoEmbeddings } from '../core/conocimiento/estado.ts';
import type { Embeddings } from '../core/conocimiento/puertos.ts';
import { EmbeddingsOllama } from '../providers/embeddings/ollama.ts';
import { estadoNube } from '../providers/embeddings/nube.ts';
import { AlmacenQdrant } from './qdrant.ts';

export function estadoDeEmbeddings(
  config: ConfigConocimiento,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): EstadoEmbeddings {
  if (config.embeddings.origen === 'nube') return estadoNube(entorno);

  const url = entorno['OLLAMA_URL'] ?? config.embeddings.local.url_por_defecto;

  return {
    estado: 'configurado',
    origen: 'local',
    embeddings: new EmbeddingsOllama({
      url,
      modelo: config.embeddings.local.modelo,
      dimensiones: config.embeddings.local.dimensiones,
    }),
  };
}

export function construirEmbeddings(
  config: ConfigConocimiento,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): Embeddings {
  return exigirConfigurado(estadoDeEmbeddings(config, entorno));
}

export class SinQdrant extends Error {
  override readonly name = 'SinQdrant';
}

export function construirAlmacen(
  config: ConfigConocimiento,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): AlmacenQdrant {
  const url = entorno['QDRANT_URL'];

  // No se cae a un almacén en memoria. Un índice que existe mientras dura el
  // proceso haría que la primera consulta tras un reinicio devolviera vacío, y el
  // vacío significa aquí «no está documentado»: el sistema mentiría con la forma
  // exacta de una respuesta correcta.
  if (url === undefined || url.trim() === '') {
    throw new SinQdrant(
      'Falta QDRANT_URL. La base de conocimiento no tiene modo degradado: sin índice, ' +
        'toda consulta devolvería vacío, y el vacío significa «no está documentado». ' +
        'Levanta los servicios con `npm run servicios` y descomenta QDRANT_URL en .env.',
    );
  }

  return new AlmacenQdrant({
    url,
    coleccion: config.almacen.coleccion,
    metrica: config.almacen.metrica,
  });
}
