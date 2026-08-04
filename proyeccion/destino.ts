// Qué destino usa el publicador, según lo que haya en el entorno.
//
// Con `FIREBASE_PROYECTO`, Firestore. Sin él, archivos — y eso no es un modo
// degradado: la proyección en archivos es la que sirve la demo pública estática
// y la que permite construir, probar y enseñar todo esto sin credenciales de
// nadie. Es el destino por omisión a propósito.
//
// La elección vive aquí y en un solo sitio porque es la única decisión del
// publicador que depende del entorno. Repartida entre las dos órdenes, acabaría
// divergiendo: la de agregados publicando en Firestore y la de la demo en
// archivos, sin que nadie lo hubiera decidido.

import { DestinoDeArchivos } from './destinos/archivos.ts';
import { DestinoDeFirestore } from './destinos/firestore.ts';
import type { DestinoDeProyeccion } from './puerto.ts';

export function elegirDestino(
  carpeta: string,
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): DestinoDeProyeccion {
  const proyecto = entorno['FIREBASE_PROYECTO'];
  if (proyecto === undefined || proyecto.trim() === '') return new DestinoDeArchivos(carpeta);

  return new DestinoDeFirestore({
    proyecto,
    // Sin ruta explícita, el SDK usa las credenciales por omisión del anfitrión.
    // La variable es la estándar de Google, y está declarada en la capa de
    // secretos con lo que se pierde si falta.
    credencial: entorno['GOOGLE_APPLICATION_CREDENTIALS'],
  });
}

/** Cómo se llama el destino elegido, para decirlo al publicar. */
export function nombreDelDestino(
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const proyecto = entorno['FIREBASE_PROYECTO'];
  return proyecto === undefined || proyecto.trim() === ''
    ? 'archivos (sin FIREBASE_PROYECTO)'
    : `Firestore, proyecto ${proyecto}`;
}
