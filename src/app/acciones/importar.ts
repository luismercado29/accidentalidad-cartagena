'use server';

import { and, gte, lte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db, esquema as e } from '@/db';
import { CLASES, GRAVEDADES, VEHICULOS } from '@/db/esquema';
import { dentroDeCartagena, distanciaM } from '@/lib/geo';
import { auditar } from '@/lib/registro';
import { exigirRol, PERMISOS } from '@/lib/sesion';
import { partesLocales } from '@/lib/tiempo';

const fila = z.object({
  ocurridoEn: z.iso.datetime(),
  lat: z.number().finite(),
  lng: z.number().finite(),
  barrio: z.string().trim().min(1).max(120),
  direccion: z.string().trim().max(200).nullable(),
  gravedad: z.enum(GRAVEDADES),
  clase: z.enum(CLASES),
  vehiculos: z.array(z.enum(VEHICULOS)).max(8),
  heridos: z.number().int().min(0).max(99),
  fallecidos: z.number().int().min(0).max(99),
  clima: z.enum(['soleado', 'nublado', 'lluvia', 'lluvia_fuerte']).nullable(),
  descripcion: z.string().trim().max(2000).nullable(),
}).refine((f) => dentroDeCartagena(f.lat, f.lng), 'fuera de Cartagena')
  .refine((f) => new Date(f.ocurridoEn).getTime() <= Date.now() + 5 * 60_000, 'fecha futura');

export type ResultadoLote = { insertados: number; duplicados: number; invalidos: number; error?: string };

const VENTANA_MS = 10 * 60_000;
const DISTANCIA_M = 50;

/**
 * Guarda un lote de hasta 500 filas ya normalizadas en el navegador. Se vuelve a
 * validar todo aqui. Se omiten duplicados: misma hora (±10 min) a menos de 50 m,
 * ya sea contra la base o dentro del mismo lote.
 */
export async function importarLote(filas: unknown, archivo: string, numeroLote: number): Promise<ResultadoLote> {
  const u = await exigirRol(PERMISOS.registrar);
  if (!Array.isArray(filas)) return { insertados: 0, duplicados: 0, invalidos: 0, error: 'Formato inválido.' };

  const validas: z.infer<typeof fila>[] = [];
  let invalidos = 0;
  for (const f of filas.slice(0, 500)) {
    const r = fila.safeParse(f);
    if (r.success) validas.push(r.data); else invalidos++;
  }
  if (validas.length === 0) return { insertados: 0, duplicados: 0, invalidos };

  const tiempos = validas.map((f) => new Date(f.ocurridoEn).getTime());
  const desde = new Date(Math.min(...tiempos) - VENTANA_MS);
  const hasta = new Date(Math.max(...tiempos) + VENTANA_MS);
  const lats = validas.map((f) => f.lat), lngs = validas.map((f) => f.lng);
  const existentes = await db.select({ t: e.siniestros.ocurridoEn, lat: e.siniestros.lat, lng: e.siniestros.lng }).from(e.siniestros)
    .where(and(gte(e.siniestros.ocurridoEn, desde), lte(e.siniestros.ocurridoEn, hasta),
      gte(e.siniestros.lat, Math.min(...lats) - 0.001), lte(e.siniestros.lat, Math.max(...lats) + 0.001),
      gte(e.siniestros.lng, Math.min(...lngs) - 0.001), lte(e.siniestros.lng, Math.max(...lngs) + 0.001)));

  const vistos = existentes.map((x) => ({ t: x.t.getTime(), lat: x.lat, lng: x.lng }));
  const nuevas: (z.infer<typeof fila> & { t: number })[] = [];
  let duplicados = 0;
  for (const f of validas) {
    const t = new Date(f.ocurridoEn).getTime();
    const dup = vistos.some((x) => Math.abs(x.t - t) <= VENTANA_MS && distanciaM(x.lat, x.lng, f.lat, f.lng) < DISTANCIA_M);
    if (dup) { duplicados++; continue; }
    vistos.push({ t, lat: f.lat, lng: f.lng });
    nuevas.push({ ...f, t });
  }

  // Codigos consecutivos por año: se toma el maximo actual una vez por año del lote.
  const siguiente = new Map<number, number>();
  for (const anio of new Set(nuevas.map((f) => partesLocales(new Date(f.t)).anio))) {
    const base = `SV-${anio}-`;
    const [r] = await db.select({ max: sql<string | null>`max(${e.siniestros.codigo})` }).from(e.siniestros).where(sql`${e.siniestros.codigo} ~ ${`^${base}[0-9]+$`}`);
    siguiente.set(anio, r?.max ? Number(r.max.slice(base.length)) + 1 : 1);
  }
  const valores = nuevas.map((f) => {
    const anio = partesLocales(new Date(f.t)).anio;
    const n = siguiente.get(anio)!;
    siguiente.set(anio, n + 1);
    return {
      codigo: `SV-${anio}-${String(n).padStart(6, '0')}`, ocurridoEn: new Date(f.t), lat: f.lat, lng: f.lng, barrio: f.barrio, direccion: f.direccion,
      gravedad: f.gravedad, clase: f.clase, vehiculos: f.vehiculos, heridos: f.heridos, fallecidos: f.fallecidos, clima: f.clima,
      descripcion: f.descripcion, fuente: 'importado' as const, estado: 'verificado' as const, registradoPor: u.id,
    };
  });
  const insertados = valores.length
    ? (await db.insert(e.siniestros).values(valores).onConflictDoNothing().returning({ id: e.siniestros.id })).length
    : 0;
  duplicados += valores.length - insertados;

  await auditar(u.id, 'importar', 'siniestros', null, { archivo: archivo.slice(0, 200), lote: numeroLote, insertados, duplicados, invalidos });
  revalidatePath('/consola/siniestros');
  revalidatePath('/consola');
  return { insertados, duplicados, invalidos };
}
