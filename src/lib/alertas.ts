import 'server-only';

import { and, desc, eq, gte, sql } from 'drizzle-orm';

import { db, esquema as e } from '@/db';
import { distanciaM, puntoEnPoligono } from '@/lib/geo';
import { notificar } from '@/lib/registro';

/**
 * Revisa los umbrales de cada zona: si en la ventana de tiempo hay al menos
 * `umbral` reportes o incidentes dentro del radio, dispara una alerta (una por
 * zona y ventana). Tambien alerta cuando un incidente grave cae en una geocerca critica.
 */
export async function evaluarAlertas(ahora = new Date()) {
  const zonas = await db.select().from(e.zonasAlerta).where(eq(e.zonasAlerta.activa, true));
  if (!zonas.length) return;
  const ventanaMax = Math.max(...zonas.map((z) => z.ventanaMin));
  const desde = new Date(ahora.getTime() - ventanaMax * 60_000);
  const eventos = [
    ...(await db.select({ lat: e.reportes.lat, lng: e.reportes.lng, t: e.reportes.creado }).from(e.reportes).where(gte(e.reportes.creado, desde))),
    ...(await db.select({ lat: e.incidentes.lat, lng: e.incidentes.lng, t: e.incidentes.abiertoEn }).from(e.incidentes).where(and(gte(e.incidentes.abiertoEn, desde), sql`${e.incidentes.reporteId} is null`))),
  ];

  for (const z of zonas) {
    const inicio = new Date(ahora.getTime() - z.ventanaMin * 60_000);
    const dentro = eventos.filter((x) => x.t >= inicio && distanciaM(z.lat, z.lng, x.lat, x.lng) <= z.radioM).length;
    if (dentro < z.umbral) continue;
    const reciente = await db.query.alertas.findFirst({
      where: and(eq(e.alertas.zonaId, z.id), gte(e.alertas.creado, inicio)),
      orderBy: desc(e.alertas.creado),
    });
    if (reciente) continue;
    const nivel = dentro >= z.umbral * 2 ? 'critico' : 'alto';
    await db.insert(e.alertas).values({
      zonaId: z.id, titulo: `Umbral superado en ${z.nombre}`, nivel, conteo: dentro,
      detalle: `${dentro} eventos en los últimos ${z.ventanaMin} minutos (umbral: ${z.umbral}, radio ${z.radioM} m).`,
    });
    await notificar({ tipo: 'alerta', titulo: `Alerta ${nivel === 'critico' ? 'crítica' : 'alta'}: ${z.nombre}`, mensaje: `${dentro} eventos en ${z.ventanaMin} min.`, enlace: '/consola/alertas' });
  }

  // Geocercas criticas: incidentes graves recientes dentro del poligono.
  const cercas = await db.select().from(e.geocercas).where(and(eq(e.geocercas.activa, true), sql`${e.geocercas.nivel} in ('alto','critico')`));
  if (!cercas.length) return;
  const graves = await db.select().from(e.incidentes)
    .where(and(gte(e.incidentes.abiertoEn, new Date(ahora.getTime() - 15 * 60_000)), sql`${e.incidentes.prioridad} in ('alta','critica')`));
  for (const inc of graves) {
    for (const g of cercas) {
      if (!puntoEnPoligono(inc.lat, inc.lng, g.poligono)) continue;
      const ya = await db.query.alertas.findFirst({ where: and(eq(e.alertas.geocercaId, g.id), sql`${e.alertas.detalle} like ${`%${inc.codigo}%`}`) });
      if (ya) continue;
      await db.insert(e.alertas).values({ geocercaId: g.id, titulo: `Incidente en la geocerca «${g.nombre}»`, nivel: g.nivel, conteo: 1, detalle: `${inc.codigo}: ${inc.titulo}` });
      await notificar({ tipo: 'alerta', titulo: `Geocerca ${g.nombre}`, mensaje: `${inc.codigo}: ${inc.titulo}`, enlace: `/consola/incidentes/${inc.id}` });
    }
  }
}
