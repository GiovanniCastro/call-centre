// La capa de saneo: enmascarar antes de que algo salga, restituir al volver.
//
// El invariante 3 dice «cero salida de datos sensibles sin enmascarar». Esto es
// la mitad que enmascara; la otra mitad —que no salga a un destino no
// declarado— es `src/salida/`.
//
// **El token es opaco y estable dentro del caso.** Opaco porque un token que
// conserva parte del dato («***-**-6789») sigue siendo el dato para quien tiene
// el resto. Estable porque el modelo tiene que poder razonar sobre él: si el
// mismo número aparece dos veces con dos tokens distintos, el modelo no puede
// saber que son el mismo, y si dos números distintos comparten token, la
// restitución los confunde.

import { detectar, type Hallazgo, type TipoIdentificador } from './patrones.ts';

/** Lo que se envía fuera, más lo que hace falta para deshacerlo. */
export type Saneado = {
  /** El texto con los identificadores sustituidos. Esto es lo único que sale. */
  readonly texto: string;
  /** Token → valor original. **Nunca sale del perímetro.** */
  readonly restitucion: ReadonlyMap<string, string>;
  /** Cuántos de cada tipo. Es lo que va a telemetría; los valores, no. */
  readonly recuento: Readonly<Partial<Record<TipoIdentificador, number>>>;
};

/**
 * Los delimitadores del token.
 *
 * Se eligen caracteres que no aparecen en los identificadores que sustituyen ni
 * en el Markdown del corpus, para que restituir sea una sustitución literal y no
 * un análisis. `«»` cumple las dos cosas y además se ve a simple vista en un
 * registro, que ayuda a auditar.
 */
const ABRE = '«';
const CIERRA = '»';

function token(tipo: TipoIdentificador, n: number): string {
  return `${ABRE}${tipo}_${n}${CIERRA}`;
}

/**
 * Enmascara todos los identificadores del texto.
 *
 * La sustitución va **de derecha a izquierda**: reemplazar de izquierda a
 * derecha desplaza las posiciones de todo lo que viene después, y los índices
 * que devolvió el detector dejarían de señalar lo que señalaban.
 */
export function sanear(texto: string): Saneado {
  const hallazgos = detectar(texto);
  if (hallazgos.length === 0) {
    return { texto, restitucion: new Map(), recuento: {} };
  }

  const restitucion = new Map<string, string>();
  const porValor = new Map<string, string>();
  const recuento: Partial<Record<TipoIdentificador, number>> = {};
  const contadores = new Map<TipoIdentificador, number>();

  // Se asignan tokens en orden de aparición para que el primero sea el _1 y el
  // texto se lea igual que el original. Pero se aplican al revés.
  for (const hallazgo of hallazgos) {
    recuento[hallazgo.tipo] = (recuento[hallazgo.tipo] ?? 0) + 1;
    if (porValor.has(hallazgo.valor)) continue;

    const n = (contadores.get(hallazgo.tipo) ?? 0) + 1;
    contadores.set(hallazgo.tipo, n);

    const marca = token(hallazgo.tipo, n);
    porValor.set(hallazgo.valor, marca);
    restitucion.set(marca, hallazgo.valor);
  }

  let salida = texto;
  for (let i = hallazgos.length - 1; i >= 0; i -= 1) {
    const hallazgo = hallazgos[i]!;
    const marca = porValor.get(hallazgo.valor)!;
    salida = salida.slice(0, hallazgo.inicio) + marca + salida.slice(hallazgo.fin);
  }

  return { texto: salida, restitucion, recuento };
}

/**
 * Devuelve los valores originales a un texto que vino de fuera.
 *
 * Solo restituye tokens que estén en el mapa de **este** caso. Un token
 * inventado por el modelo —o traído de otro caso— no resuelve a nada y se queda
 * como está, visible. La alternativa, restituir por patrón, permitiría que un
 * texto del modelo pidiera `«ssn_1»` y recibiera el dato de quien fuera.
 */
export function restituir(texto: string, restitucion: ReadonlyMap<string, string>): string {
  let salida = texto;
  for (const [marca, valor] of restitucion) {
    salida = salida.split(marca).join(valor);
  }
  return salida;
}

/** Los tokens que quedaron sin resolver. Vacío es lo normal; no vacío, un aviso. */
export function tokensHuerfanos(
  texto: string,
  restitucion: ReadonlyMap<string, string>,
): readonly string[] {
  const patron = new RegExp(`${ABRE}[a-z_]+_\\d+${CIERRA}`, 'g');
  return [...texto.matchAll(patron)]
    .map((m) => m[0])
    .filter((marca) => !restitucion.has(marca));
}

export type { Hallazgo, TipoIdentificador };
