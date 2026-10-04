import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, esquema as e } from '@/db';
import { evaluarAlertas } from '@/lib/alertas';
import { esEquipo, usuarioActual } from '@/lib/sesion';
import { avanzarSimulacion } from '@/lib/simulacion';

export const dynamic = 'force-dynamic';

/** Avisos del equipo. La consola lo consulta cada 30 s; de paso avanza la simulacion y revisa umbrales. */
export async function GET() {
  const u = await usuarioActual();
  if (!esEquipo(u)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    await avanzarSimulacion();
    await evaluarAlertas();
  } catch (err) {
    console.error('[simulacion]', err);
  }
  const paraMi = or(isNull(e.notificaciones.usuarioId), eq(e.notificaciones.usuarioId, u!.id));
  const lista = await db.select().from(e.notificaciones).where(paraMi).orderBy(desc(e.notificaciones.creado)).limit(15);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(e.notificaciones)
    .where(and(paraMi, eq(e.notificaciones.leida, false), gt(e.notificaciones.creado, new Date(Date.now() - 7 * 86_400_000))));
  return NextResponse.json({ noLeidas: n, lista });
}

/** Marca todas como leidas. */
export async function POST() {
  const u = await usuarioActual();
  if (!esEquipo(u)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  await db.update(e.notificaciones).set({ leida: true })
    .where(and(eq(e.notificaciones.leida, false), or(isNull(e.notificaciones.usuarioId), eq(e.notificaciones.usuarioId, u!.id))));
  return NextResponse.json({ ok: true });
}
