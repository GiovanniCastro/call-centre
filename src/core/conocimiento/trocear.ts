// Troceado con solapamiento. Determinista y sin dependencias: mismo texto y
// misma configuración, mismos fragmentos, siempre.
//
// **Se corta por estructura antes que por tamaño.** Un troceado que parte cada
// 1200 caracteres separa una cláusula de su excepción con la misma facilidad con
// que separa dos frases sin relación, y en este corpus eso no es hipotético: la
// política de cancelación tiene una excepción que contradice la regla general
// dos secciones más abajo, y está puesta ahí a propósito (R-023). Cortar por
// encabezado y por párrafo mantiene juntas las cosas que se escribieron juntas.
//
// El tamaño solo manda cuando un bloque no cabe entero.

import type { ConfigTroceado } from './config.ts';
import { idFragmento, type DocumentoFuente, type Fragmento } from './documento.ts';

/** Un bloque de texto bajo un encabezado, tal como venía escrito. */
type Bloque = {
  readonly seccion: string;
  readonly texto: string;
};

const ENCABEZADO = /^(#{1,6})\s+(.*\S)\s*$/;

/**
 * Parte el documento en bloques, arrastrando el encabezado vigente.
 *
 * El encabezado de nivel 1 se toma como título del documento y no como sección:
 * en estos documentos es el nombre del archivo repetido, y usarlo como sección
 * haría que todo el primer tramo se citara como «Seguro de inquilino» sin decir
 * de qué parte.
 */
function enBloques(texto: string, tituloPorDefecto: string): readonly Bloque[] {
  const bloques: Bloque[] = [];
  let seccion = tituloPorDefecto;
  let acumulado: string[] = [];

  const cerrar = (): void => {
    const cuerpo = acumulado.join('\n').trim();
    acumulado = [];
    if (cuerpo === '') return;

    // Un bloque que es solo su encabezado no se indexa. Ocurre cuando un título
    // va seguido inmediatamente de otro —el de nivel 1 de estos documentos, sin
    // texto propio antes del primer apartado— y produciría un fragmento de tres
    // palabras que puntúa por casualidad y no sustenta ninguna cita. La fase 4
    // exige que el valor citado aparezca literalmente en el fragmento; un
    // fragmento sin cuerpo no puede contener ningún valor.
    const sinEncabezado = cuerpo
      .split('\n')
      .filter((l) => ENCABEZADO.exec(l) === null)
      .join('')
      .trim();
    if (sinEncabezado === '') return;

    bloques.push({ seccion, texto: cuerpo });
  };

  for (const linea of texto.split(/\r?\n/)) {
    const encabezado = ENCABEZADO.exec(linea);

    if (encabezado !== null) {
      cerrar();
      const nivel = encabezado[1]?.length ?? 1;
      const rotulo = encabezado[2] ?? '';
      if (nivel > 1) seccion = rotulo;
      // El encabezado viaja dentro del bloque: un fragmento que empieza por su
      // propio título recupera mejor y se lee solo.
      acumulado.push(linea.trim());
      continue;
    }

    // Línea en blanco: fin de párrafo. Se conserva como separador para que el
    // agrupador de abajo pueda decidir dónde cortar sin volver a analizar.
    if (linea.trim() === '') {
      acumulado.push('');
      continue;
    }

    acumulado.push(linea);
  }

  cerrar();
  return bloques;
}

/** Los párrafos de un bloque, sin líneas en blanco. */
function enParrafos(bloque: string): readonly string[] {
  return bloque
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

/**
 * Parte un párrafo que no cabe. Corta por frase si puede, y por carácter si el
 * párrafo no tiene ni un punto —una tabla larga, por ejemplo—.
 */
function partirLargo(parrafo: string, objetivo: number, solapamiento: number): readonly string[] {
  const piezas: string[] = [];
  let resto = parrafo;

  while (resto.length > objetivo) {
    const ventana = resto.slice(0, objetivo);
    // Se busca el último final de frase o de línea dentro de la ventana, y solo
    // se acepta si cae en la segunda mitad: cortar en el 5 % dejaría un fragmento
    // inútil y arrastraría el 95 % restante a la vuelta siguiente.
    const corte = Math.max(ventana.lastIndexOf('. '), ventana.lastIndexOf('\n'));
    const fin = corte > objetivo / 2 ? corte + 1 : objetivo;

    piezas.push(resto.slice(0, fin).trim());
    resto = resto.slice(Math.max(0, fin - solapamiento)).trim();
  }

  if (resto !== '') piezas.push(resto);
  return piezas;
}

/**
 * El solapamiento: la cola del fragmento anterior, cortada por frontera de
 * palabra para no empezar a media palabra.
 */
function colaDe(texto: string, solapamiento: number): string {
  if (solapamiento === 0 || texto.length <= solapamiento) return texto;
  const cola = texto.slice(-solapamiento);
  const espacio = cola.indexOf(' ');
  return espacio === -1 ? cola : cola.slice(espacio + 1);
}

/**
 * Trocea un documento.
 *
 * El solapamiento **no cruza secciones**: arrastrar la cola de «Cancelar» al
 * principio de «Excepción» produciría un fragmento que contiene la regla y la
 * excepción a medias, y una cita a ese fragmento no señalaría ninguna de las dos.
 * Dentro de una sección, en cambio, el solapamiento es justo lo que evita que una
 * frase partida por el corte desaparezca de los dos lados.
 */
export function trocear(documento: DocumentoFuente, config: ConfigTroceado): readonly Fragmento[] {
  const { objetivo_caracteres: objetivo, solapamiento_caracteres: solapamiento } = config;
  const textos: { seccion: string; texto: string }[] = [];

  for (const bloque of enBloques(documento.texto, documento.titulo)) {
    let actual = '';

    const cerrarActual = (): void => {
      if (actual.trim() !== '') textos.push({ seccion: bloque.seccion, texto: actual.trim() });
      actual = '';
    };

    for (const parrafo of enParrafos(bloque.texto)) {
      const piezas =
        parrafo.length > objetivo ? partirLargo(parrafo, objetivo, solapamiento) : [parrafo];

      for (const pieza of piezas) {
        if (actual === '') {
          actual = pieza;
          continue;
        }

        if (actual.length + pieza.length + 2 <= objetivo) {
          actual = `${actual}\n\n${pieza}`;
          continue;
        }

        const cola = colaDe(actual, solapamiento);
        cerrarActual();
        actual = cola === '' ? pieza : `${cola}\n\n${pieza}`;
      }
    }

    cerrarActual();
  }

  return unir(textos, config).map((t, orden) => ({
    fragmento_id: idFragmento(documento.documento_id, documento.suma, orden),
    documento_id: documento.documento_id,
    titulo: documento.titulo,
    seccion: t.seccion,
    texto: t.texto,
    orden,
    suma_documento: documento.suma,
  }));
}

/**
 * Absorbe los restos cortos en el fragmento anterior de la misma sección.
 *
 * La alternativa —descartarlos— pierde texto en silencio, y perder texto en
 * silencio es la peor cosa que puede hacer una ingestión: el agente respondería
 * «no está documentado» sobre algo que sí lo está, y el fallo sería invisible
 * porque nadie compara el índice con la carpeta. Un resto corto que abre sección
 * se conserva tal cual; no hay nada a lo que pegarlo, y perderlo sería peor que
 * indexar un fragmento pequeño.
 */
function unir(
  textos: readonly { seccion: string; texto: string }[],
  config: ConfigTroceado,
): readonly { seccion: string; texto: string }[] {
  const salida: { seccion: string; texto: string }[] = [];

  for (const t of textos) {
    const previo = salida.at(-1);

    if (
      t.texto.length < config.minimo_caracteres &&
      previo !== undefined &&
      previo.seccion === t.seccion
    ) {
      salida[salida.length - 1] = { seccion: previo.seccion, texto: `${previo.texto}\n\n${t.texto}` };
      continue;
    }

    salida.push({ seccion: t.seccion, texto: t.texto });
  }

  return salida;
}
