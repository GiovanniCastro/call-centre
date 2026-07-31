// El cliente de PostgreSQL. **El único módulo del sistema que importa `pg`.**
//
// Lo sostiene el check `solo-repos-habla-con-sql`: si el cliente se pudiera
// importar desde cualquier sitio, el filtro de contacto sería una convención de
// esta carpeta en lugar de una propiedad del sistema, y bastaría con un `import`
// en el sitio equivocado para saltárselo entero.

import { Pool, type PoolClient, type QueryResultRow } from 'pg';

export type Consultador = {
  consultar<F extends QueryResultRow>(sql: string, valores?: readonly unknown[]): Promise<F[]>;
  /** Ejecuta dentro de una transacción; deshace todo si algo lanza. */
  enTransaccion<T>(trabajo: (dentro: Consultador) => Promise<T>): Promise<T>;
  cerrar(): Promise<void>;
};

function envolver(cliente: PoolClient): Consultador {
  return {
    async consultar<F extends QueryResultRow>(sql: string, valores: readonly unknown[] = []) {
      const { rows } = await cliente.query<F>(sql, [...valores]);
      return rows;
    },
    // Anidar transacciones haría que un `ROLLBACK` interior deshiciera trabajo
    // exterior sin avisar. Se reutiliza la que ya está abierta.
    async enTransaccion(trabajo) {
      return trabajo(envolver(cliente));
    },
    async cerrar() {
      // El cliente pertenece a la transacción que lo pidió; cerrarlo aquí lo
      // devolvería al grupo a mitad de trabajo.
    },
  };
}

export function crearConsultador(urlConexion: string): Consultador {
  const grupo = new Pool({ connectionString: urlConexion });

  return {
    async consultar<F extends QueryResultRow>(sql: string, valores: readonly unknown[] = []) {
      const { rows } = await grupo.query<F>(sql, [...valores]);
      return rows;
    },

    async enTransaccion(trabajo) {
      const cliente = await grupo.connect();
      try {
        await cliente.query('BEGIN');
        const resultado = await trabajo(envolver(cliente));
        await cliente.query('COMMIT');
        return resultado;
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      } finally {
        cliente.release();
      }
    },

    async cerrar() {
      await grupo.end();
    },
  };
}
