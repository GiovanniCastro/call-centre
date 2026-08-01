// Detección de identificadores en texto libre. Determinista, sin modelo.
//
// **Este archivo es la fuente única de «qué es un dato sensible».** Lo usan dos
// consumidores que tienen que estar de acuerdo por construcción: el clasificador
// de sensibilidad, que decide si un caso puede salir del perímetro, y la capa de
// saneo, que enmascara antes de que salga. Si fueran dos listas distintas, un
// identificador reconocido por una y no por la otra produce el fallo exacto que
// este proyecto existe para no tener: un caso clasificado como no sensible cuyo
// texto lleva un número de seguro social sin enmascarar.
//
// Los patrones son deliberadamente **estrechos**. Un detector que marca de más
// convierte todo en sensible, todo se queda en local, y la comparación
// nube/local del panel deja de medir nada. Uno que marca de menos deja salir un
// dato. Entre los dos errores no hay simetría —el segundo es el que importa—,
// así que donde hay duda se exige contexto en lugar de ampliar el patrón: es lo
// que hace `cuenta` y `carne`, que sin una palabra cercana que los nombre no
// disparan.

/** Qué se encontró. El valor NO se guarda en telemetría; solo el tipo y cuántos. */
export type TipoIdentificador =
  | 'ssn'
  | 'tarjeta'
  | 'cuenta'
  | 'carne'
  | 'bastidor'
  | 'telefono'
  | 'correo'
  | 'fecha_nacimiento'
  | 'poliza';

export type Hallazgo = {
  readonly tipo: TipoIdentificador;
  readonly valor: string;
  readonly inicio: number;
  readonly fin: number;
};

/**
 * Cuánto sube la sensibilidad cada tipo.
 *
 * `alta` es el conjunto que la política nunca deja salir del perímetro: los que
 * identifican a la persona ante un tercero o abren una cuenta. Un correo o un
 * teléfono son datos personales —y se enmascaran igual— pero clasificarlos como
 * altos dejaría casi todo el tráfico en local por el mero hecho de que alguien
 * dio su email, y entonces el vigía de perímetro contaría 500 de 500 retenidos
 * sin que ese número dijera nada.
 */
export const SENSIBILIDAD_POR_TIPO: Readonly<Record<TipoIdentificador, 'alta' | 'media'>> = {
  ssn: 'alta',
  tarjeta: 'alta',
  cuenta: 'alta',
  carne: 'alta',
  fecha_nacimiento: 'alta',
  bastidor: 'media',
  telefono: 'media',
  correo: 'media',
  poliza: 'media',
};

/** Dígito de control de Luhn. Sin esto, cualquier ristra de 16 cifras es una tarjeta. */
function pasaLuhn(digitos: string): boolean {
  let suma = 0;
  let alterna = false;

  for (let i = digitos.length - 1; i >= 0; i -= 1) {
    let d = digitos.codePointAt(i)! - 48;
    if (alterna) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    alterna = !alterna;
  }

  return suma % 10 === 0;
}

type Detector = {
  readonly tipo: TipoIdentificador;
  readonly patron: RegExp;
  /** Segunda comprobación sobre lo que casó. Devuelve falso para descartarlo. */
  readonly confirma?: (valor: string, texto: string, inicio: number) => boolean;
};

/** ¿Hay alguna de estas palabras cerca? Es lo que da contexto a un número suelto. */
function cerca(texto: string, inicio: number, palabras: readonly string[]): boolean {
  const desde = Math.max(0, inicio - 60);
  const ventana = texto.slice(desde, inicio).toLowerCase();
  return palabras.some((p) => ventana.includes(p));
}

const DETECTORES: readonly Detector[] = [
  {
    // Número de seguro social: 123-45-6789. También sin guiones, pero solo si hay
    // contexto — nueve cifras seguidas son muchas cosas.
    tipo: 'ssn',
    patron: /\b(\d{3}-\d{2}-\d{4}|\d{9})\b/g,
    confirma: (valor, texto, inicio) =>
      valor.includes('-') || cerca(texto, inicio, ['seguro social', 'ssn', 'social security']),
  },
  {
    tipo: 'tarjeta',
    patron: /\b(?:\d[ -]?){12,18}\d\b/g,
    confirma: (valor) => {
      const digitos = valor.replace(/\D/g, '');
      return digitos.length >= 13 && digitos.length <= 19 && pasaLuhn(digitos);
    },
  },
  {
    // Cuenta bancaria: exige que alguien la haya nombrado. Un número de ocho a
    // diecisiete cifras sin contexto es un identificador de cualquier cosa.
    tipo: 'cuenta',
    patron: /\b\d{8,17}\b/g,
    confirma: (_valor, texto, inicio) =>
      cerca(texto, inicio, ['cuenta', 'account', 'routing', 'iban', 'banco', 'transferencia']),
  },
  {
    tipo: 'carne',
    patron: /\b[A-Z]{1,2}\d{5,12}\b/g,
    confirma: (_valor, texto, inicio) =>
      cerca(texto, inicio, ['carné', 'carnet', 'licencia', 'license', 'conducir', 'driver']),
  },
  {
    // Bastidor (VIN): 17 caracteres, sin I, O ni Q por norma del propio formato.
    tipo: 'bastidor',
    patron: /\b[A-HJ-NPR-Z0-9]{17}\b/g,
  },
  {
    tipo: 'telefono',
    patron: /(\+?1[ .-]?)?\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b/g,
  },
  {
    tipo: 'correo',
    patron: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g,
  },
  {
    // Fecha de nacimiento: la fecha sola no basta —una póliza está llena de
    // fechas—, hace falta que se presente como tal.
    tipo: 'fecha_nacimiento',
    patron: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    confirma: (_valor, texto, inicio) =>
      cerca(texto, inicio, ['nacimiento', 'nací', 'naci', 'birth', 'dob', 'cumpleaños']),
  },
  {
    tipo: 'poliza',
    patron: /\b(?:NIM|POL)-\d{6,10}\b/gi,
  },
];

/**
 * Todos los identificadores del texto, en orden de aparición y sin solaparse.
 *
 * Cuando dos detectores casan sobre el mismo tramo gana el que empieza antes, y
 * a igualdad, el más largo. El orden importa: un número de tarjeta también casa
 * como «cuenta» si alguien escribió «cuenta» cerca, y enmascararlo dos veces
 * dejaría un token dentro de otro.
 */
export function detectar(texto: string): readonly Hallazgo[] {
  const brutos: Hallazgo[] = [];

  for (const detector of DETECTORES) {
    // El patrón es global y `lastIndex` es estado mutable compartido: se copia
    // para que dos llamadas concurrentes no se pisen el índice.
    const patron = new RegExp(detector.patron.source, detector.patron.flags);
    let coincidencia: RegExpExecArray | null;

    while ((coincidencia = patron.exec(texto)) !== null) {
      const valor = coincidencia[0];
      const inicio = coincidencia.index;

      if (detector.confirma !== undefined && !detector.confirma(valor, texto, inicio)) continue;

      brutos.push({ tipo: detector.tipo, valor, inicio, fin: inicio + valor.length });
    }
  }

  brutos.sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);

  const limpios: Hallazgo[] = [];
  let finAnterior = -1;

  for (const hallazgo of brutos) {
    if (hallazgo.inicio < finAnterior) continue;
    limpios.push(hallazgo);
    finAnterior = hallazgo.fin;
  }

  return limpios;
}
