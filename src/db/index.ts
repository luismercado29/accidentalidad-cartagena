/**
 * Conexion a la base de datos.
 *
 * - Con DATABASE_URL (produccion, Neon): Postgres real via postgres-js.
 * - Sin DATABASE_URL (desarrollo): PGlite, un Postgres completo en WebAssembly
 *   guardado en .pglite/. No hay que instalar nada para trabajar en local.
 *
 * Ambos hablan el mismo dialecto, asi que el esquema y las consultas son identicos.
 */
import 'server-only';

import * as esquema from './esquema';
import { crearConexion, type BaseDeDatos } from './conexion';

const global_ = globalThis as unknown as { __vialDb?: BaseDeDatos };

/**
 * La conexion se abre en el primer uso, no al importar el modulo: asi el build
 * (que importa las paginas en varios procesos) no abre la base sin necesitarla.
 * En desarrollo se reutiliza una sola por proceso entre recargas.
 */
function conexion(): BaseDeDatos {
  global_.__vialDb ??= crearConexion();
  return global_.__vialDb;
}

export const db = new Proxy({} as BaseDeDatos, {
  get(_, propiedad) {
    const real = conexion();
    const valor = Reflect.get(real, propiedad);
    return typeof valor === 'function' ? valor.bind(real) : valor;
  },
});

export { esquema };
