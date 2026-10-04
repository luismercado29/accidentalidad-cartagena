import 'server-only';

import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';

import { db, esquema as e } from '@/db';
import type { Gravedad, Prioridad, Vehiculo } from '@/db/esquema';
import { PRIORIDAD } from '@/lib/etiquetas';
import { barrioMasCercano, distanciaM } from '@/lib/geo';
import { codigoSeguimiento, notificar, siguienteCodigo } from '@/lib/registro';

export type NuevoReporte = {
  lat: number; lng: number; direccion?: string | null; descripcion: string; gravedadEstimada: Gravedad; hayHeridos: boolean;
  vehiculos: Vehiculo[]; contactoNombre?: string | null; contactoTelefono?: string | null;
  canal: 'web' | 'qr' | 'whatsapp' | 'externo'; puntoQrId?: number | null; usuarioId?: number | null; barrio?: string | null;
};

export const prioridadDe = (g: Gravedad, heridos: boolean): Prioridad =>
  g === 'fatal' ? 'critica' : g === 'grave' ? 'alta' : g === 'leve' || heridos ? 'media' : 'baja';

const CANAL_TEXTO = { web: 'la web', qr: 'código QR', whatsapp: 'WhatsApp', externo: 'fuente externa' } as const;

/** Crea un reporte ciudadano; si hay heridos o es grave/fatal abre ademas un incidente. */
export async function crearReporteCiudadano(r: NuevoReporte) {
  const barrio = r.barrio ?? barrioMasCercano(r.lat, r.lng).nombre;
  let codigo = codigoSeguimiento();
  // Colision improbable (32^6), pero se reintenta por si acaso.
  for (let i = 0; i < 3; i++) {
    const existe = await db.query.reportes.findFirst({ where: eq(e.reportes.codigo, codigo), columns: { id: true } });
    if (!existe) break;
    codigo = codigoSeguimiento();
  }
  const [rep] = await db.insert(e.reportes).values({
    codigo, lat: r.lat, lng: r.lng, direccion: r.direccion || null, barrio, descripcion: r.descripcion,
    gravedadEstimada: r.gravedadEstimada, hayHeridos: r.hayHeridos, vehiculos: r.vehiculos,
    contactoNombre: r.contactoNombre || null, contactoTelefono: r.contactoTelefono || null,
    canal: r.canal, puntoQrId: r.puntoQrId ?? null, usuarioId: r.usuarioId ?? null,
  }).returning({ id: e.reportes.id, codigo: e.reportes.codigo });

  await notificar({
    tipo: 'reporte', titulo: `Nuevo reporte por ${CANAL_TEXTO[r.canal]}`,
    mensaje: `${r.descripcion.slice(0, 140)} (${barrio})`, enlace: `/consola/reportes?id=${rep.id}`,
  });

  let incidenteId: number | null = null;
  if (r.hayHeridos || r.gravedadEstimada === 'grave' || r.gravedadEstimada === 'fatal') {
    const prioridad = prioridadDe(r.gravedadEstimada, r.hayHeridos);
    const [inc] = await db.insert(e.incidentes).values({
      codigo: await siguienteCodigo('IN'), titulo: r.descripcion.slice(0, 160), lat: r.lat, lng: r.lng,
      direccion: r.direccion || null, barrio, prioridad, slaMin: PRIORIDAD[prioridad].sla, reporteId: rep.id,
    }).returning({ id: e.incidentes.id, codigo: e.incidentes.codigo });
    incidenteId = inc.id;
    await db.update(e.reportes).set({ estado: 'en_revision', incidenteId: inc.id }).where(eq(e.reportes.id, rep.id));
    await db.insert(e.incidenteEventos).values({ incidenteId: inc.id, tipo: 'creado', texto: `Incidente abierto automáticamente desde el reporte ${rep.codigo} (${CANAL_TEXTO[r.canal]}).` });
    await notificar({ tipo: 'incidente', titulo: `Incidente ${PRIORIDAD[prioridad].texto.toLowerCase()} · ${inc.codigo}`, mensaje: r.descripcion.slice(0, 140), enlace: `/consola/incidentes/${inc.id}` });
  }
  return { id: rep.id, codigo: rep.codigo, incidenteId };
}

/** Reportes e incidentes a menos de 200 m y 60 min del reporte dado (posibles duplicados). */
export async function posiblesDuplicados(rep: { id: number; lat: number; lng: number; creado: Date; incidenteId: number | null }) {
  const desde = new Date(rep.creado.getTime() - 60 * 60_000);
  const hasta = new Date(rep.creado.getTime() + 60 * 60_000);
  const caja = 0.0025;
  const enCaja = <T extends { lat: number; lng: number }>(x: T) => distanciaM(rep.lat, rep.lng, x.lat, x.lng) <= 200;
  const [reportes, incidentes] = await Promise.all([
    db.select({ id: e.reportes.id, codigo: e.reportes.codigo, lat: e.reportes.lat, lng: e.reportes.lng, creado: e.reportes.creado, estado: e.reportes.estado, descripcion: e.reportes.descripcion })
      .from(e.reportes)
      .where(and(ne(e.reportes.id, rep.id), gte(e.reportes.creado, desde), lte(e.reportes.creado, hasta),
        sql`abs(${e.reportes.lat} - ${rep.lat}) < ${caja} and abs(${e.reportes.lng} - ${rep.lng}) < ${caja}`)),
    db.select({ id: e.incidentes.id, codigo: e.incidentes.codigo, lat: e.incidentes.lat, lng: e.incidentes.lng, abiertoEn: e.incidentes.abiertoEn, estado: e.incidentes.estado, titulo: e.incidentes.titulo })
      .from(e.incidentes)
      .where(and(gte(e.incidentes.abiertoEn, desde), lte(e.incidentes.abiertoEn, hasta),
        sql`abs(${e.incidentes.lat} - ${rep.lat}) < ${caja} and abs(${e.incidentes.lng} - ${rep.lng}) < ${caja}`)),
  ]);
  return {
    reportes: reportes.filter(enCaja).map((x) => ({ ...x, distancia: Math.round(distanciaM(rep.lat, rep.lng, x.lat, x.lng)) })),
    incidentes: incidentes.filter(enCaja).filter((x) => x.id !== rep.incidenteId).map((x) => ({ ...x, distancia: Math.round(distanciaM(rep.lat, rep.lng, x.lat, x.lng)) })),
  };
}
