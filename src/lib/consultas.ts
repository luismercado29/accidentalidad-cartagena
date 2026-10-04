import 'server-only';

import { and, count, desc, eq, gte, lt, ne, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { cache } from 'react';

import { db, esquema as e } from '@/db';
import type { Gravedad } from '@/db/esquema';
import { partesLocales, type Periodo } from '@/lib/tiempo';

/** Condicion SQL: la columna cae dentro del periodo. */
export function enPeriodo(columna: PgColumn, p: Periodo | null): SQL | undefined {
  if (!p) return undefined;
  return p.desde ? and(gte(columna, p.desde), lt(columna, p.hasta)) : lt(columna, p.hasta);
}

/** Años con datos (para el filtro de tiempo). */
export const aniosDisponibles = cache(async () => {
  const [r] = await db.select({ min: sql<string | null>`min(${e.siniestros.ocurridoEn})` }).from(e.siniestros);
  const hasta = partesLocales(new Date()).anio;
  const desde = r?.min ? partesLocales(new Date(r.min)).anio : hasta;
  return Array.from({ length: hasta - desde + 1 }, (_, i) => hasta - i);
});

export type FiltrosSiniestros = {
  periodo: Periodo | null;
  gravedad?: Gravedad | null;
  barrio?: string | null;
  clase?: string | null;
  vehiculo?: string | null;
  fuente?: string | null;
  texto?: string | null;
  incluirPendientes?: boolean;
};

/** Condiciones para consultar siniestros (los descartados nunca cuentan). */
export function condicionesSiniestros(f: FiltrosSiniestros): SQL | undefined {
  const c: (SQL | undefined)[] = [
    enPeriodo(e.siniestros.ocurridoEn, f.periodo),
    f.incluirPendientes ? ne(e.siniestros.estado, 'descartado') : eq(e.siniestros.estado, 'verificado'),
  ];
  if (f.gravedad) c.push(eq(e.siniestros.gravedad, f.gravedad));
  if (f.barrio) c.push(eq(e.siniestros.barrio, f.barrio));
  if (f.clase) c.push(eq(e.siniestros.clase, f.clase as never));
  if (f.fuente) c.push(eq(e.siniestros.fuente, f.fuente as never));
  if (f.vehiculo) c.push(sql`${e.siniestros.vehiculos} @> ${JSON.stringify([f.vehiculo])}::jsonb`);
  if (f.texto) {
    const t = `%${f.texto.replace(/[%_]/g, '')}%`;
    c.push(sql`(${e.siniestros.codigo} ilike ${t} or ${e.siniestros.descripcion} ilike ${t} or ${e.siniestros.direccion} ilike ${t} or ${e.siniestros.barrio} ilike ${t})`);
  }
  return and(...c);
}

/** Totales por gravedad, heridos y fallecidos. */
export async function resumen(f: FiltrosSiniestros) {
  const filas = await db
    .select({ gravedad: e.siniestros.gravedad, n: count(), heridos: sql<number>`coalesce(sum(${e.siniestros.heridos}),0)::int`, fallecidos: sql<number>`coalesce(sum(${e.siniestros.fallecidos}),0)::int` })
    .from(e.siniestros).where(condicionesSiniestros(f)).groupBy(e.siniestros.gravedad);
  const por = { solo_danos: 0, leve: 0, grave: 0, fatal: 0 } as Record<Gravedad, number>;
  let heridos = 0, fallecidos = 0;
  for (const r of filas) { por[r.gravedad] = r.n; heridos += Number(r.heridos); fallecidos += Number(r.fallecidos); }
  const total = Object.values(por).reduce((a, b) => a + b, 0);
  return { total, porGravedad: por, heridos, fallecidos };
}

/** Puntos para mapas (ligeros: sin descripciones). */
export async function puntosMapa(f: FiltrosSiniestros, limite = 20_000) {
  return db.select({ id: e.siniestros.id, lat: e.siniestros.lat, lng: e.siniestros.lng, gravedad: e.siniestros.gravedad, ocurridoEn: e.siniestros.ocurridoEn, barrio: e.siniestros.barrio, clase: e.siniestros.clase })
    .from(e.siniestros).where(condicionesSiniestros(f)).orderBy(desc(e.siniestros.ocurridoEn)).limit(limite);
}

/** Serie temporal agrupada por dia, semana o mes (hora local). */
export async function serie(f: FiltrosSiniestros, unidad: 'day' | 'week' | 'month') {
  const balde = sql<string>`to_char(date_trunc('${sql.raw(unidad)}', ${e.siniestros.ocurridoEn} at time zone 'America/Bogota'), 'YYYY-MM-DD')`;
  return db.select({ balde, total: count(), graves: sql<number>`count(*) filter (where ${e.siniestros.gravedad} in ('grave','fatal'))::int` })
    .from(e.siniestros).where(condicionesSiniestros(f)).groupBy(balde).orderBy(balde);
}

/** Matriz hora x dia de la semana (hora local). */
export async function matrizHoraDia(f: FiltrosSiniestros) {
  const hora = sql<number>`extract(hour from ${e.siniestros.ocurridoEn} at time zone 'America/Bogota')::int`;
  const dia = sql<number>`extract(dow from ${e.siniestros.ocurridoEn} at time zone 'America/Bogota')::int`;
  const filas = await db.select({ hora, dia, n: count() }).from(e.siniestros).where(condicionesSiniestros(f)).groupBy(hora, dia);
  const m = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of filas) m[Number(r.dia)][Number(r.hora)] = r.n;
  return m;
}

/** Conteo agrupado por una columna de texto (barrio, clase, causa...). */
export async function ranking(f: FiltrosSiniestros, columna: 'barrio' | 'clase' | 'causaProbable' | 'clima' | 'direccion', limite = 10) {
  const col = e.siniestros[columna];
  return db.select({ clave: sql<string>`coalesce(${col}, 'Sin dato')`, n: count(), fatales: sql<number>`count(*) filter (where ${e.siniestros.gravedad} = 'fatal')::int` })
    .from(e.siniestros).where(condicionesSiniestros(f)).groupBy(col).orderBy(desc(count())).limit(limite);
}

/** Participacion de cada tipo de vehiculo (un siniestro puede tener varios). */
export async function porVehiculo(f: FiltrosSiniestros) {
  const v = sql<string>`jsonb_array_elements_text(${e.siniestros.vehiculos})`;
  const filas = await db.select({ vehiculo: v, n: count() }).from(e.siniestros).where(condicionesSiniestros(f)).groupBy(v).orderBy(desc(count()));
  return filas;
}

/** Lee filtros comunes de los searchParams de una pagina. */
export function leerFiltros(sp: Record<string, string | string[] | undefined>) {
  const uno = (k: string) => { const v = sp[k]; const s = Array.isArray(v) ? v[0] : v; return s && s.trim() ? s.trim().slice(0, 120) : null; };
  const g = uno('gravedad');
  return {
    gravedad: (['solo_danos', 'leve', 'grave', 'fatal'].includes(g ?? '') ? g : null) as Gravedad | null,
    barrio: uno('barrio'), clase: uno('clase'), vehiculo: uno('vehiculo'), fuente: uno('fuente'), texto: uno('q'),
    pagina: Math.max(1, Number(uno('pagina')) || 1),
  };
}

/** Barrios con al menos un siniestro (para selects). */
export const barriosConDatos = cache(async () => {
  const r = await db.selectDistinct({ barrio: e.siniestros.barrio }).from(e.siniestros).where(sql`${e.siniestros.barrio} is not null`).orderBy(e.siniestros.barrio);
  return r.map((x) => x.barrio!).filter(Boolean);
});
