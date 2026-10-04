import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as esquema from './esquema';

export type BaseDeDatos = ReturnType<typeof drizzlePostgres<typeof esquema>>;

export const CARPETA_LOCAL = '.pglite';

/**
 * Cliente postgres-js. El nombre de la base se decodifica a mano: postgres-js
 * no convierte "%20" y una base con espacios en el nombre fallaria con "no existe".
 */
export function clientePostgres(url: string, extra: postgres.Options<Record<string, never>> = {}) {
  const base = decodeURIComponent(new URL(url).pathname.slice(1));
  // prepare: false es necesario con el pooler de Neon (modo transaccion).
  return postgres(url, { prepare: false, ...(base ? { database: base } : {}), ...extra });
}

export function crearConexion(url = process.env.DATABASE_URL): BaseDeDatos {
  if (url) {
    const cliente = clientePostgres(url, { max: 5, idle_timeout: 20 });
    return drizzlePostgres(cliente, { schema: esquema, casing: 'snake_case' });
  }
  const cliente = new PGlite(CARPETA_LOCAL);
  // Mismo API de consultas: se tipa como la conexion de produccion.
  return drizzlePglite(cliente, { schema: esquema, casing: 'snake_case' }) as unknown as BaseDeDatos;
}
