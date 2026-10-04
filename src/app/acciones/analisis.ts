'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db, esquema as e } from '@/db';
import { ESTADOS_INTERVENCION } from '@/db/esquema';
import { detectarPuntosNegros } from '@/lib/analitica/puntos-negros';
import { enPeriodo } from '@/lib/consultas';
import { distanciaM } from '@/lib/geo';
import { auditar } from '@/lib/registro';
import { exigirRol, PERMISOS } from '@/lib/sesion';
import { resolverPeriodo } from '@/lib/tiempo';

export type EstadoAnalisis = { ok?: string; error?: string };

const esquemaRecalculo = z.object({
  periodo: z.string().max(20).default('12m'),
  desde: z.string().max(10).optional(),
  hasta: z.string().max(10).optional(),
  radio: z.coerce.number().int().min(100).max(300),
  minimo: z.coerce.number().int().min(3).max(50),
});

/**
 * Recalcula los puntos negros con DBSCAN sobre el periodo elegido.
 * Los puntos nuevos que quedan a menos de 100 m de uno anterior heredan su
 * estado de intervencion y sus notas (el seguimiento no se pierde).
 */
export async function recalcularPuntosNegros(_: EstadoAnalisis, datos: FormData): Promise<EstadoAnalisis> {
  const u = await exigirRol(PERMISOS.analizar);
  const r = esquemaRecalculo.safeParse(Object.fromEntries(datos));
  if (!r.success) return { error: 'Revisa los parámetros: radio entre 100 y 300 m y mínimo entre 3 y 50 siniestros.' };
  const periodo = resolverPeriodo({ periodo: r.data.periodo, desde: r.data.desde, hasta: r.data.hasta }, '12m');

  const puntos = await db.select({ id: e.siniestros.id, lat: e.siniestros.lat, lng: e.siniestros.lng, gravedad: e.siniestros.gravedad })
    .from(e.siniestros)
    .where(and(enPeriodo(e.siniestros.ocurridoEn, periodo), ne(e.siniestros.estado, 'descartado')));
  const grupos = detectarPuntosNegros(puntos, r.data.radio, r.data.minimo).slice(0, 60);
  const anteriores = await db.select().from(e.puntosNegros);

  const nuevos = grupos.map((g, i) => {
    const previo = anteriores
      .map((a) => ({ a, d: distanciaM(a.lat, a.lng, g.lat, g.lng) }))
      .filter((x) => x.d < 100)
      .sort((x, y) => x.d - y.d)[0]?.a;
    return {
      nombre: previo?.nombre ?? `${g.barrio} · punto ${i + 1}`,
      lat: g.lat, lng: g.lng, barrio: g.barrio, radioM: g.radioM,
      total: g.total, fatales: g.fatales, graves: g.graves, indice: g.indice, ranking: i + 1,
      estadoIntervencion: previo?.estadoIntervencion ?? 'sin_intervenir',
      notas: previo?.notas ?? null,
    };
  });

  await db.transaction(async (tx) => {
    await tx.delete(e.puntosNegros);
    if (nuevos.length) await tx.insert(e.puntosNegros).values(nuevos);
  });
  await auditar(u.id, 'recalcular', 'puntos_negros', null, { periodo: periodo.etiqueta, radio: r.data.radio, minimo: r.data.minimo, puntos: nuevos.length, siniestros: puntos.length });
  revalidatePath('/consola/puntos-negros');
  return { ok: `Se identificaron ${nuevos.length} puntos negros a partir de ${puntos.length.toLocaleString('es-CO')} siniestros (${periodo.etiqueta.toLowerCase()}).` };
}

const esquemaPunto = z.object({
  id: z.coerce.number().int().positive(),
  nombre: z.string().trim().min(3, 'El nombre es muy corto.').max(120),
  estadoIntervencion: z.enum(ESTADOS_INTERVENCION),
  notas: z.string().trim().max(2000).optional(),
});

export async function actualizarPuntoNegro(_: EstadoAnalisis, datos: FormData): Promise<EstadoAnalisis> {
  const u = await exigirRol(PERMISOS.analizar);
  const r = esquemaPunto.safeParse(Object.fromEntries(datos));
  if (!r.success) return { error: r.error.issues[0]?.message ?? 'Datos inválidos.' };
  const { id, ...cambios } = r.data;
  const res = await db.update(e.puntosNegros).set({ ...cambios, notas: cambios.notas || null }).where(eq(e.puntosNegros.id, id)).returning({ id: e.puntosNegros.id });
  if (!res.length) return { error: 'El punto ya no existe (quizá se recalculó la tabla).' };
  await auditar(u.id, 'editar', 'puntos_negros', id, cambios);
  revalidatePath('/consola/puntos-negros');
  revalidatePath(`/consola/puntos-negros/${id}`);
  return { ok: 'Cambios guardados.' };
}
