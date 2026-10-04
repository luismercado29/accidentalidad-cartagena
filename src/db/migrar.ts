/**
 * Aplica las migraciones de ./drizzle.
 *
 *   npm run db:migrate              -> aplica lo pendiente
 *   npm run db:reset                -> borra la base LOCAL, migra y carga datos de ejemplo
 *
 * --reiniciar solo funciona con la base local (PGlite): nunca borra una base remota.
 */
import 'dotenv/config';
import { rmSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migrarPglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migrarPostgres } from 'drizzle-orm/postgres-js/migrator';

import { CARPETA_LOCAL, clientePostgres } from './conexion';

const url = process.env.DATABASE_URL;
const reiniciar = process.argv.includes('--reiniciar');

async function main() {
  if (url) {
    if (reiniciar) throw new Error('--reiniciar no se permite contra una base remota.');
    const cliente = clientePostgres(url, { max: 1 });
    await migrarPostgres(drizzlePostgres(cliente), { migrationsFolder: './drizzle' });
    await cliente.end();
    console.log('Migraciones aplicadas en la base remota.');
    return;
  }
  if (reiniciar) rmSync(CARPETA_LOCAL, { recursive: true, force: true });
  const cliente = new PGlite(CARPETA_LOCAL);
  await migrarPglite(drizzlePglite(cliente), { migrationsFolder: './drizzle' });
  await cliente.close();
  console.log(`Migraciones aplicadas en la base local (${CARPETA_LOCAL}/).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
