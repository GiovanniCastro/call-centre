// Cuántas filas hay en cada tabla. Nada más.
//
// Existe para una sola cosa: comprobar que una restauración devolvió lo que el
// respaldo se llevó. Sin recuentos, «la restauración funcionó» solo significa
// que el proceso terminó con código cero, que es exactamente la clase de
// afirmación que este proyecto no acepta.
//
// **Por qué está exento del alcance de contacto.** Un recuento de filas no es un
// dato de nadie: es un hecho del esquema. Exigirle un `AlcanceContacto`
// obligaría a inventar uno, y el filtro afirmaría algo falso —que estas tablas
// pertenecen a un contacto—. La exención está escrita en `SIN_ALCANCE` de
// `tests/repos-alcance.test.ts`, con su motivo, y va acompañada de una regla
// propia **más estricta** que la exención (R-036):
//
//   > Ninguna consulta de este archivo puede nombrar una tabla del perímetro ni
//   > seleccionar una columna. Solo cuenta.
//
// Con esa regla, una consulta sin filtro no puede devolver datos de nadie: no
// hay por dónde salgan. Es el mismo razonamiento que sostiene `agregados.ts`.

import type { Consultador } from './cliente.ts';

export type RecuentoDeTabla = {
  readonly tabla: string;
  readonly filas: number;
};

/**
 * Cuenta las filas de todas las tablas del esquema, sin nombrar ninguna.
 *
 * La lista de tablas sale del catálogo de PostgreSQL, no de una constante en el
 * código. La diferencia importa: una constante habría que actualizarla con cada
 * migración, y el día que alguien olvidara hacerlo la verificación diría que
 * todo cuadra sin haber mirado la tabla nueva. Un respaldo que se declara
 * correcto sin haber comprobado la mitad de las tablas es peor que ninguno.
 *
 * El recuento es exacto —`count(*)`, no `reltuples`—: el estimador del
 * planificador puede ir desviado por miles de filas después de una carga, y una
 * comparación entre dos estimaciones no demuestra nada.
 */
export async function recuentoDeFilas(bd: Consultador): Promise<readonly RecuentoDeTabla[]> {
  // `query_to_xml` ejecuta el recuento tabla por tabla desde dentro del propio
  // servidor. Es el único modo de contar filas de un conjunto de tablas que no
  // se conoce al escribir la consulta sin construir SQL desde JavaScript — que
  // es justo lo que la prueba estructural de esta carpeta prohíbe, y con razón:
  // interpolar nombres desde fuera es cómo se cuela una inyección.
  const filas = await bd.consultar<{ tabla: string; filas: string }>(
    `SELECT c.relname::text AS tabla,
            (xpath(
               '/row/c/text()',
               query_to_xml(
                 format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname),
                 false, true, ''
               )
             ))[1]::text::bigint AS filas
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname = 'public'
      ORDER BY c.relname`,
  );

  // `count(*)` vuelve como `bigint`, y el cliente lo entrega como texto para no
  // perder precisión por encima de 2^53. Aquí las cifras son de tabla, no de
  // universo, así que el número cabe de sobra.
  return filas.map((f) => ({ tabla: f.tabla, filas: Number(f.filas) }));
}
