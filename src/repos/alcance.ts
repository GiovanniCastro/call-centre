// El alcance de contacto.
//
// Esta es la pieza que impide que una consulta devuelva datos de otro cliente, y
// está construida para que **no se pueda saltar por descuido**, no para que se
// recuerde no saltarla.
//
// Tres capas, y ninguna sobra:
//
//   1. El tipo lleva una **marca de símbolo**. Un objeto literal con la forma
//      correcta no es un `AlcanceContacto`: TypeScript lo rechaza. Para
//      falsificarlo hay que escribir un `as` explícito, que es visible en el diff.
//   2. Toda función exportada de `src/repos/` lo recibe como **primer
//      argumento**, y lo comprueba en tiempo de ejecución. La marca sobrevive al
//      borrado de tipos; el `as` no engaña a `exigirAlcance`.
//   3. Una prueba recorre el árbol sintáctico de `src/repos/` y **falla si
//      aparece una función exportada que no lo reciba**, o una consulta que no
//      filtre por contacto. Es la que impide que la regla se erosione con el
//      tiempo, cuando alguien añada un repositorio nuevo y se olvide.
//
// La tercera es la que pide el criterio de aceptación de la fase 1. Las otras dos
// existen porque una prueba que hay que recordar escribir no protege de nada.

import type { NombreCanal } from '../core/canal.ts';

/**
 * Marca inaccesible desde fuera de este módulo. Es lo que hace que
 * `{ contacto_id: 'x', canal: 'telegram' }` **no** sea un `AlcanceContacto`.
 */
const MARCA: unique symbol = Symbol('AlcanceContacto');

export type AlcanceContacto = {
  readonly [MARCA]: true;
  readonly contacto_id: string;
  readonly canal: NombreCanal;
};

export class ErrorDeAlcance extends Error {
  override readonly name = 'ErrorDeAlcance';
}

/**
 * La única forma legítima de obtener un alcance.
 *
 * @throws {ErrorDeAlcance} Si el identificador está vacío. Un alcance vacío
 *   produciría `WHERE contacto_id = ''`, que no devuelve nada — pero un alcance
 *   con un identificador inventado sí devolvería datos ajenos, y por eso el
 *   identificador tiene que venir de una fila real de `contactos`.
 */
export function alcanceDeContacto(contacto_id: string, canal: NombreCanal): AlcanceContacto {
  if (typeof contacto_id !== 'string' || contacto_id.trim() === '') {
    throw new ErrorDeAlcance(
      'Un alcance de contacto necesita el identificador de una fila real de ' +
        '`contactos`. Sin él, toda consulta de esta capa consultaría sin filtro.',
    );
  }

  return { [MARCA]: true, contacto_id, canal };
}

/** ¿Es esto un alcance de verdad, y no un objeto con la forma adecuada? */
export function esAlcance(valor: unknown): valor is AlcanceContacto {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    (valor as Record<symbol, unknown>)[MARCA] === true &&
    typeof (valor as { contacto_id?: unknown }).contacto_id === 'string' &&
    (valor as { contacto_id: string }).contacto_id.trim() !== ''
  );
}

/**
 * Puerta de entrada de toda función exportada de `src/repos/`.
 *
 * Se comprueba en tiempo de ejecución y no solo con tipos porque los tipos se
 * borran: una llamada desde JavaScript, o un `as AlcanceContacto` escrito con
 * prisa, pasarían el compilador y llegarían aquí.
 *
 * @throws {ErrorDeAlcance}
 */
export function exigirAlcance(valor: unknown): AlcanceContacto {
  if (!esAlcance(valor)) {
    throw new ErrorDeAlcance(
      'Falta el alcance de contacto, o no se construyó con `alcanceDeContacto`. ' +
        'Ninguna consulta de `src/repos/` puede ejecutarse sin él: sería una ' +
        'consulta capaz de devolver datos de otro cliente.',
    );
  }
  return valor;
}
