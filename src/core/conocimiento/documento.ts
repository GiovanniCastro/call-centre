// Los tipos canónicos del conocimiento: documento, fragmento y procedencia.
//
// La decisión de este archivo es **cómo se nombra un fragmento**. El
// `fragmento_id` no es un número de fila ni un UUID aleatorio: es una función
// determinista del documento, de su contenido y de la posición del trozo. De ahí
// salen tres propiedades que la fase 4 necesita y que un identificador aleatorio
// no daría:
//
//   1. Reingerir el mismo documento produce los mismos identificadores, así que
//      la reingestión sustituye en vez de duplicar (criterio de la fase 2).
//   2. Un documento modificado produce identificadores distintos, así que una
//      cita vieja se puede distinguir de una vigente en lugar de apuntar en
//      silencio a un texto que ya dice otra cosa.
//   3. El verificador de procedencia de la fase 4 puede comprobar que el
//      `fragmento_id` que citó el modelo existe **y** se recuperó en esta
//      ejecución, sin consultar nada.

import { createHash } from 'node:crypto';

/** De dónde salió un documento y quién lo puso ahí. */
export type Procedencia = {
  /** Ruta relativa a la carpeta de ingesta, o clave en Cloud Storage. */
  readonly ruta: string;
  /** `carpeta` en la fase 2; `cloud_storage` cuando llegue la subida del panel. */
  readonly origen: 'carpeta' | 'cloud_storage';
  /** Quién lo subió. En ingesta desde carpeta, el usuario del proceso. */
  readonly subido_por: string;
  readonly ingerido_en: Date;
};

export type DocumentoFuente = {
  readonly documento_id: string;
  readonly titulo: string;
  readonly texto: string;
  /** SHA-256 del contenido en bytes, en hexadecimal. */
  readonly suma: string;
  readonly procedencia: Procedencia;
};

export type Fragmento = {
  readonly fragmento_id: string;
  readonly documento_id: string;
  readonly titulo: string;
  /** El encabezado bajo el que cae el fragmento. Es lo que se cita. */
  readonly seccion: string;
  readonly texto: string;
  /** Posición dentro del documento, empezando en 0. */
  readonly orden: number;
  readonly suma_documento: string;
};

/** Un fragmento recuperado, con su puntuación de similitud. */
export type FragmentoRecuperado = Fragmento & {
  readonly puntuacion: number;
};

export function sumaDe(contenido: string | Uint8Array): string {
  return createHash('sha256').update(contenido).digest('hex');
}

/**
 * El identificador de un documento: su ruta, no su contenido.
 *
 * Tiene que ser estable cuando el documento cambia —si no, un documento editado
 * sería un documento nuevo y el viejo quedaría en el índice para siempre—. Lo que
 * cambia con el contenido es la suma, y con ella los identificadores de fragmento.
 */
export function idDocumento(ruta: string): string {
  return sumaDe(ruta).slice(0, 16);
}

/**
 * El identificador de un fragmento: documento, contenido del documento y
 * posición.
 *
 * Incluye la suma del documento a propósito. Sin ella, editar el párrafo tercero
 * dejaría intacto el identificador del cuarto, y una cita emitida antes del
 * cambio seguiría resolviendo —a un texto distinto del que se citó—. Con ella,
 * toda cita anterior a una edición deja de resolver, que es el comportamiento
 * honesto.
 */
export function idFragmento(documentoId: string, sumaDocumento: string, orden: number): string {
  return `${documentoId}:${sumaDocumento.slice(0, 8)}:${String(orden).padStart(4, '0')}`;
}

/**
 * Qdrant exige que el identificador de un punto sea un entero sin signo o un
 * UUID; no acepta cadenas arbitrarias. Se deriva un UUID determinista del
 * `fragmento_id` para no perder la propiedad de arriba: el mismo fragmento
 * produce siempre el mismo punto, y por eso reingerir sustituye en lugar de
 * acumular.
 *
 * El `fragmento_id` legible viaja igual en la carga útil del punto, que es lo que
 * se cita y lo que verifica la fase 4.
 */
export function puntoDe(fragmentoId: string): string {
  const h = sumaDe(fragmentoId);
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join(
    '-',
  );
}
