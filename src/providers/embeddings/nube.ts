// El proveedor de embeddings en nube: declarado, no construido.
//
// El proveedor concreto sigue siendo un bloqueante abierto del canon, y hay una
// razón por la que no se elige de paso: Anthropic —que es de quien hay tarifas en
// `config/precios.json`— no tiene API de embeddings. Elegir aquí significaría
// meter un proveedor distinto al de la inferencia, con su cuenta, su tarifa y su
// clase de sensibilidad, y eso es una decisión de la fase 3 traída a la 2 sin que
// ningún criterio lo pida.
//
// Lo que sí exige el criterio de aceptación es que el origen sea configurable sin
// tocar el código de recuperación. Eso se cumple con la interfaz, y se prueba con
// un adaptador falso: la prueba sustituye el proveedor y la recuperación no se
// entera. Escribir un adaptador contra un proveedor que nadie ha elegido no
// probaría más y envejecería peor.

import type { Requisito } from '../../core/canal.ts';
import type { Embeddings } from '../../core/conocimiento/puertos.ts';
import { evaluarProveedor, type EstadoEmbeddings } from '../../core/conocimiento/estado.ts';

export const REQUISITOS_NUBE: readonly Requisito[] = [
  {
    variable: 'EMBEDDINGS_NUBE_PROVEEDOR',
    descripcion:
      'Qué proveedor de embeddings se usa. Sin decidir: es un bloqueante abierto del canon.',
    como_obtenerlo:
      'Decisión pendiente. Anthropic no ofrece embeddings, así que sería un proveedor ' +
      'distinto al de la inferencia. Al elegirlo hay que añadir su bloque a ' +
      'config/precios.json con fuente y fecha de consulta, y su clase de sensibilidad ' +
      'a la política de enrutamiento de la fase 3.',
  },
  {
    variable: 'EMBEDDINGS_NUBE_CLAVE',
    descripcion: 'Credencial del proveedor elegido.',
    como_obtenerlo:
      'Del panel del proveedor. Nunca se versiona: va en .env, que está en .gitignore ' +
      'y vigilado por gitleaks en CI.',
  },
  {
    variable: 'EMBEDDINGS_NUBE_MODELO',
    descripcion: 'Identificador del modelo de embeddings.',
    como_obtenerlo:
      'De la documentación del proveedor. Sus dimensiones tienen que coincidir con ' +
      '`embeddings.nube.dimensiones` de config/conocimiento.json, o el índice generado ' +
      'no será comparable con el existente.',
  },
];

/**
 * El estado del proveedor de nube según el entorno.
 *
 * Con las tres variables presentes lanza al construir, y lo hace a propósito: no
 * hay adaptador que construir todavía, y devolver algo que finja estar listo
 * sería peor que decirlo. El día que se elija el proveedor, lo único que cambia
 * es el cuerpo de `construir`.
 */
export function estadoNube(
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): EstadoEmbeddings {
  return evaluarProveedor('nube', REQUISITOS_NUBE, entorno, (valores): Embeddings => {
    throw new Error(
      `Hay credenciales de nube en el entorno (proveedor «${valores['EMBEDDINGS_NUBE_PROVEEDOR'] ?? '?'}») ` +
        'pero el adaptador no está escrito: el proveedor de embeddings en nube sigue ' +
        'sin decidirse. Ver config/conocimiento.json → embeddings.por_que_nube_sin_decidir. ' +
        'Usa `origen: "local"` hasta entonces.',
    );
  });
}
