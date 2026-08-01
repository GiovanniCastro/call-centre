// Lectura de la carpeta vigilada: qué archivos entran, en qué se convierten y
// con qué procedencia.
//
// Es el único módulo que toca el sistema de archivos del corpus y el único que
// importa un analizador de PDF. Lo que sale de aquí ya es `DocumentoFuente`: a
// partir de ese punto, al resto del sistema le da igual si el texto venía de un
// Markdown o de un PDF, que es lo que permite que la fase 7 meta un PDF con una
// inyección dentro sin tocar nada más.

import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import { userInfo } from 'node:os';

import { extractText, getDocumentProxy } from 'unpdf';

import {
  idDocumento,
  sumaDe,
  type DocumentoFuente,
  type Procedencia,
} from '../core/conocimiento/documento.ts';

export type OpcionesLectura = {
  readonly carpeta: string;
  readonly extensiones: readonly string[];
  /** Prefijos de nombre que no se indexan. Ver R-023. */
  readonly prefijos_excluidos: readonly string[];
  readonly subido_por?: string;
};

/** Archivos candidatos, en orden estable. */
async function rutasDe(
  carpeta: string,
  raiz: string,
  extensiones: readonly string[],
  prefijos: readonly string[],
): Promise<readonly string[]> {
  const entradas = await readdir(carpeta, { withFileTypes: true });
  const rutas: string[] = [];

  for (const entrada of entradas) {
    const completa = join(carpeta, entrada.name);

    if (entrada.isDirectory()) {
      rutas.push(...(await rutasDe(completa, raiz, extensiones, prefijos)));
      continue;
    }

    if (!extensiones.includes(extname(entrada.name).toLowerCase())) continue;
    if (prefijos.some((p) => entrada.name.startsWith(p))) continue;

    rutas.push(relative(raiz, completa).split(sep).join('/'));
  }

  // Orden alfabético y no el del sistema de archivos: el orden del sistema varía
  // entre máquinas, y con él variaría el orden de ingestión. Nada del resultado
  // depende de ese orden hoy, pero un proceso reproducible es más fácil de
  // comparar entre dos ejecuciones que uno que no lo es.
  return rutas.sort();
}

/** El título: el primer encabezado de nivel 1, o el nombre del archivo. */
function tituloDe(texto: string, ruta: string): string {
  const encabezado = /^#\s+(.+)$/m.exec(texto);
  const rotulo = encabezado?.[1]?.trim();
  return rotulo === undefined || rotulo === '' ? basename(ruta, extname(ruta)) : rotulo;
}

async function textoDe(ruta: string, bytes: Uint8Array): Promise<string> {
  if (extname(ruta).toLowerCase() !== '.pdf') {
    return new TextDecoder('utf-8').decode(bytes);
  }

  // pdf.js rechaza `Buffer` de forma explícita aunque sea una subclase de
  // `Uint8Array`: distingue las dos porque `Buffer` reutiliza un grupo de memoria
  // compartida, y una vista sobre memoria que otro puede reutilizar no es segura
  // de retener. Se copia a un `Uint8Array` propio.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  // `mergePages` promete una cadena, pero la firma admite las dos formas según
  // la opción. Se comprueba en tiempo de ejecución en lugar de afirmarlo con un
  // aserto de tipo: si una versión futura cambia el contrato, esto sigue leyendo
  // el PDF en vez de romperse con un error de propiedad inexistente.
  return Array.isArray(text) ? text.join('\n\n') : text;
}

export type Leido = {
  readonly documento: DocumentoFuente;
  readonly bytes: number;
};

/**
 * Lee la carpeta entera.
 *
 * La suma se calcula sobre los **bytes**, no sobre el texto ya extraído. Con un
 * PDF los dos difieren: extraer texto no es determinista entre versiones del
 * analizador, y una suma sobre el texto cambiaría al actualizar la dependencia
 * aunque el archivo no se hubiera tocado — disparando la alerta de modificación
 * externa sobre documentos que nadie modificó.
 */
export async function leerCarpeta(opciones: OpcionesLectura): Promise<readonly Leido[]> {
  const { carpeta } = opciones;

  const info = await stat(carpeta).catch(() => null);
  if (info === null || !info.isDirectory()) {
    throw new Error(
      `La carpeta de ingesta «${carpeta}» no existe. Es la que declara ` +
        'config/conocimiento.json → ingesta.carpeta.',
    );
  }

  const subidoPor = opciones.subido_por ?? userInfo().username;
  const ingeridoEn = new Date();
  const leidos: Leido[] = [];

  for (const ruta of await rutasDe(
    carpeta,
    carpeta,
    opciones.extensiones,
    opciones.prefijos_excluidos,
  )) {
    const bytes = await readFile(join(carpeta, ruta));
    const texto = await textoDe(ruta, bytes);

    const procedencia: Procedencia = {
      ruta,
      origen: 'carpeta',
      subido_por: subidoPor,
      ingerido_en: ingeridoEn,
    };

    leidos.push({
      documento: {
        documento_id: idDocumento(ruta),
        titulo: tituloDe(texto, ruta),
        texto,
        suma: sumaDe(bytes),
        procedencia,
      },
      bytes: bytes.byteLength,
    });
  }

  return leidos;
}

/** Solo las sumas, para la comprobación de modificación externa. */
export async function sumasEnDisco(
  opciones: OpcionesLectura,
): Promise<ReadonlyMap<string, string>> {
  const leidos = await leerCarpeta(opciones);
  return new Map(leidos.map((l) => [l.documento.documento_id, l.documento.suma]));
}
