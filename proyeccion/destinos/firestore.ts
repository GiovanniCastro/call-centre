// Destino de proyección sobre Firestore.
//
// **El único módulo del repositorio que importa el SDK de Firebase**, y lo
// sostiene el check `perimetro-sin-firebase` de dependency-cruiser: ningún
// módulo fuera de `proyeccion/` puede alcanzarlo. Invariante 8, escrito en el
// grafo de dependencias además de en el tipo.
//
// Lo que hace que este adaptador no rompa el invariante 8 no es que evite leer:
// es que **no puede**. Implementa `DestinoDeProyeccion`, un puerto que solo
// tiene `publicar`. No hay aquí una función que traiga nada de Firestore al
// perímetro, y para escribir una habría que cambiar el puerto — un cambio que se
// ve en el diff y que hay que justificar.
//
// El Admin SDK **no evalúa las reglas de seguridad**. Eso no es un descuido de
// Firebase ni un agujero: es la razón por la que el publicador puede escribir
// mientras `allow write: if false` cierra la puerta a todos los demás. Y es
// también por lo que su credencial vive dentro del perímetro y en ningún otro
// sitio.

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import type { DestinoDeProyeccion, DocumentoProyectado } from '../puerto.ts';

export class ErrorDeFirestore extends Error {
  override readonly name = 'ErrorDeFirestore';
}

/**
 * Límite de operaciones por lote de escritura de Firestore.
 *
 * No es un número elegido: es el máximo del servicio. Se trocea por él porque un
 * lote de 501 documentos se rechaza entero, y con las trazas de un lote de casos
 * ese número se pasa sin darse cuenta.
 */
const MAXIMO_POR_LOTE = 500;

/**
 * Arranca la aplicación de administración, una sola vez por proceso.
 *
 * Con `GOOGLE_APPLICATION_CREDENTIALS` apuntando al archivo de cuenta de
 * servicio, o con las credenciales por omisión del anfitrión. Con
 * `FIRESTORE_EMULATOR_HOST` puesto, el SDK habla con el emulador y las
 * credenciales dan igual — que es lo que permite probar todo esto sin una cuenta
 * de Firebase.
 */
function aplicacion(proyecto: string, rutaCredencial?: string): App {
  const existentes = getApps();
  const yaEsta = existentes[0];
  if (yaEsta !== undefined) return yaEsta;

  if (rutaCredencial !== undefined && rutaCredencial !== '') {
    return initializeApp({ credential: cert(rutaCredencial), projectId: proyecto });
  }

  return initializeApp({ projectId: proyecto });
}

export type OpcionesDeFirestore = {
  /** Identificador del proyecto de Firebase. */
  readonly proyecto: string;
  /** Ruta al archivo de cuenta de servicio. Sin ella, credenciales del anfitrión. */
  readonly credencial?: string | undefined;
};

export class DestinoDeFirestore implements DestinoDeProyeccion {
  readonly nombre = 'firestore';
  private readonly bd: Firestore;

  constructor(opciones: OpcionesDeFirestore) {
    if (opciones.proyecto.trim() === '') {
      throw new ErrorDeFirestore(
        'Falta el identificador del proyecto de Firebase. Sin él, el publicador no ' +
          'sabe a qué proyección escribe, y escribir en el proyecto equivocado es ' +
          'publicar datos donde nadie los está vigilando.',
      );
    }

    this.bd = getFirestore(aplicacion(opciones.proyecto, opciones.credencial));
  }

  /**
   * Escribe el lote entero. Todo o nada, dentro de lo que el servicio permite.
   *
   * La atomicidad importa porque el panel lee cifras que se refieren unas a
   * otras: publicar los agregados y no el estado de vigías dejaría una pantalla
   * donde el reparto dice una cosa y el vigía otra, y quien la mire no tiene
   * forma de saber que está viendo dos instantes distintos.
   *
   * Con más de 500 documentos la atomicidad es por tramo y no del conjunto: es
   * el límite del servicio, no una decisión nuestra. Se dice aquí en vez de
   * dejarlo implícito, porque una promesa de atomicidad que se rompe en silencio
   * al crecer el volumen es peor que no prometerla.
   */
  async publicar(documentos: readonly DocumentoProyectado[]): Promise<void> {
    for (let desde = 0; desde < documentos.length; desde += MAXIMO_POR_LOTE) {
      const tramo = documentos.slice(desde, desde + MAXIMO_POR_LOTE);
      const lote = this.bd.batch();

      for (const documento of tramo) {
        // `doc(ruta)` con `coleccion/documento`: las rutas de la proyección ya
        // vienen con esa forma desde `publicar.ts`, que es lo que hace que el
        // mismo publicador sirva para archivos y para Firestore sin saber cuál
        // tiene delante.
        lote.set(this.bd.doc(documento.ruta), documento.contenido);
      }

      await lote.commit();
    }
  }
}
