import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { db, esquema as e } from '@/db';
import { crearAleatorio, siniestroEn } from '@/db/demo';
import { PRIORIDAD } from '@/lib/etiquetas';
import { codigoSeguimiento, notificar, siguienteCodigo } from '@/lib/registro';
import { partesLocales } from '@/lib/tiempo';
import { distanciaM } from '@/lib/geo';

/**
 * Modo demostracion "en vivo": mientras alguien mira la consola, la ciudad
 * sigue generando reportes e incidentes con un ritmo realista y los incidentes
 * simulados avanzan solos (despacho, llegada, cierre). Nunca toca datos reales:
 * solo mueve incidentes marcados como simulados.
 *
 * Corre como mucho una vez por minuto en todo el sistema (bloqueo optimista en `ajustes`).
 */
export async function avanzarSimulacion() {
  const demo = await db.query.ajustes.findFirst({ where: eq(e.ajustes.clave, 'demo') });
  if (!(demo?.valor as { activo?: boolean } | undefined)?.activo) return;

  const ahora = new Date();
  await db.insert(e.ajustes).values({ clave: 'simulacion', valor: { t: new Date(ahora.getTime() - 120_000).toISOString() } }).onConflictDoNothing();
  // Solo un proceso gana el turno: actualiza si la ultima corrida fue hace mas de 60 s.
  const ganado = await db.update(e.ajustes)
    .set({ valor: { t: ahora.toISOString() }, actualizado: ahora })
    .where(and(eq(e.ajustes.clave, 'simulacion'), sql`(${e.ajustes.valor}->>'t')::timestamptz < ${new Date(ahora.getTime() - 60_000)}`))
    .returning({ antes: e.ajustes.actualizado });
  if (!ganado.length) return;

  const ultima = await db.query.ajustes.findFirst({ where: eq(e.ajustes.clave, 'simulacion_previa') });
  const desde = ultima ? new Date((ultima.valor as { t: string }).t) : new Date(ahora.getTime() - 5 * 60_000);
  await db.insert(e.ajustes).values({ clave: 'simulacion_previa', valor: { t: ahora.toISOString() } })
    .onConflictDoUpdate({ target: e.ajustes.clave, set: { valor: { t: ahora.toISOString() }, actualizado: ahora } });
  const minutos = Math.min(120, Math.max(1, (ahora.getTime() - desde.getTime()) / 60_000));

  const a = crearAleatorio(Math.floor(ahora.getTime() / 1000));
  await nuevosEventos(a, minutos, ahora);
  await avanzarIncidentes(a, ahora);
}

async function nuevosEventos(a: ReturnType<typeof crearAleatorio>, minutos: number, ahora: Date) {
  const { hora } = partesLocales(ahora);
  // Ritmo de reportes por minuto segun la hora (mas en horas pico, casi nada de madrugada).
  const ritmo = hora >= 6 && hora < 21 ? 1 / 9 : 1 / 30;
  let n = 0;
  for (let i = 0; i < minutos; i++) if (a.r() < ritmo) n++;
  n = Math.min(n, 4);
  for (let i = 0; i < n; i++) {
    const s = siniestroEn(a, new Date(ahora.getTime() - a.r() * 4 * 60_000));
    const canal = a.ponderado([['web', 4], ['qr', 2], ['whatsapp', 4]] as const);
    const [rep] = await db.insert(e.reportes).values({
      codigo: codigoSeguimiento(), lat: s.lat, lng: s.lng, direccion: s.direccion, barrio: s.barrio,
      descripcion: s.descripcion, gravedadEstimada: s.gravedad, hayHeridos: s.heridos > 0, vehiculos: s.vehiculos, canal,
      creado: s.ocurridoEn,
    }).returning({ id: e.reportes.id, codigo: e.reportes.codigo });
    await notificar({ tipo: 'reporte', titulo: `Nuevo reporte por ${canal === 'whatsapp' ? 'WhatsApp' : canal === 'qr' ? 'código QR' : 'la web'}`, mensaje: `${s.descripcion} (${s.barrio})`, enlace: `/consola/reportes?id=${rep.id}` });

    // Los graves y fatales abren incidente de inmediato (en la vida real llegan tambien por la linea de emergencias).
    if (s.gravedad === 'grave' || s.gravedad === 'fatal' || a.r() < 0.35) {
      const prioridad = s.gravedad === 'fatal' ? 'critica' : s.gravedad === 'grave' ? 'alta' : s.gravedad === 'leve' ? 'media' : 'baja';
      const [inc] = await db.insert(e.incidentes).values({
        codigo: await siguienteCodigo('IN', ahora), titulo: s.descripcion, lat: s.lat, lng: s.lng, direccion: s.direccion, barrio: s.barrio,
        prioridad, slaMin: PRIORIDAD[prioridad].sla, reporteId: rep.id, simulado: true, abiertoEn: ahora,
      }).returning({ id: e.incidentes.id, codigo: e.incidentes.codigo });
      await db.update(e.reportes).set({ estado: 'en_revision', incidenteId: inc.id }).where(eq(e.reportes.id, rep.id));
      await db.insert(e.incidenteEventos).values({ incidenteId: inc.id, tipo: 'creado', texto: `Incidente abierto a partir del reporte ${rep.codigo}.` });
      if (prioridad === 'critica' || prioridad === 'alta') {
        await notificar({ tipo: 'incidente', titulo: `Incidente ${PRIORIDAD[prioridad].texto.toLowerCase()} · ${inc.codigo}`, mensaje: `${s.descripcion}`, enlace: `/consola/incidentes/${inc.id}` });
      }
    }
  }
}

async function avanzarIncidentes(a: ReturnType<typeof crearAleatorio>, ahora: Date) {
  const activos = await db.select().from(e.incidentes)
    .where(and(eq(e.incidentes.simulado, true), inArray(e.incidentes.estado, ['abierto', 'despachado', 'en_sitio', 'controlado'])));
  for (const inc of activos) {
    const min = (d: Date | null) => (d ? (ahora.getTime() - d.getTime()) / 60_000 : 0);
    if (inc.estado === 'abierto' && min(inc.abiertoEn) > 1.5 + a.r() * 3) {
      // Unidad disponible mas cercana.
      const libres = await db.select().from(e.unidades).where(eq(e.unidades.estado, 'disponible'));
      const tipoPreferido = inc.prioridad === 'critica' ? 'ambulancia' : 'motorizado';
      const candidata = libres
        .filter((u) => u.lat != null)
        .sort((x, y) => (x.tipo === tipoPreferido ? -1 : 0) - (y.tipo === tipoPreferido ? -1 : 0) || distanciaM(inc.lat, inc.lng, x.lat!, x.lng!) - distanciaM(inc.lat, inc.lng, y.lat!, y.lng!))[0];
      if (!candidata) continue;
      await db.update(e.unidades).set({ estado: 'asignada', actualizado: ahora }).where(eq(e.unidades.id, candidata.id));
      await db.insert(e.incidenteUnidades).values({ incidenteId: inc.id, unidadId: candidata.id, asignadoEn: ahora });
      await db.update(e.incidentes).set({ estado: 'despachado', despachadoEn: ahora }).where(eq(e.incidentes.id, inc.id));
      await db.insert(e.incidenteEventos).values({ incidenteId: inc.id, tipo: 'unidad', texto: `${candidata.nombre} despachada al sitio.` });
    } else if (inc.estado === 'despachado' && min(inc.despachadoEn) > 4 + a.r() * (inc.prioridad === 'critica' ? 4 : 14)) {
      await db.update(e.incidentes).set({ estado: 'en_sitio', enSitioEn: ahora }).where(eq(e.incidentes.id, inc.id));
      await db.insert(e.incidenteEventos).values({ incidenteId: inc.id, tipo: 'estado', texto: 'La unidad llegó al sitio y aseguró la zona.' });
      // La unidad queda en el lugar del incidente.
      const asignadas = await db.select({ id: e.incidenteUnidades.unidadId }).from(e.incidenteUnidades).where(and(eq(e.incidenteUnidades.incidenteId, inc.id), sql`${e.incidenteUnidades.liberadoEn} is null`));
      if (asignadas.length) await db.update(e.unidades).set({ lat: inc.lat, lng: inc.lng, actualizado: ahora }).where(inArray(e.unidades.id, asignadas.map((x) => x.id)));
    } else if (inc.estado === 'en_sitio' && min(inc.enSitioEn) > 12 + a.r() * 25) {
      await db.update(e.incidentes).set({ estado: 'controlado' }).where(eq(e.incidentes.id, inc.id));
      await db.insert(e.incidenteEventos).values({ incidenteId: inc.id, tipo: 'estado', texto: 'Situación controlada; se restablece el flujo vehicular.' });
    } else if (inc.estado === 'controlado' && min(inc.enSitioEn) > 30 + a.r() * 30) {
      await cerrarSimulado(inc, ahora);
    }
  }
}

async function cerrarSimulado(inc: typeof e.incidentes.$inferSelect, ahora: Date) {
  const rep = inc.reporteId ? await db.query.reportes.findFirst({ where: eq(e.reportes.id, inc.reporteId) }) : null;
  const gravedad = rep?.gravedadEstimada ?? (inc.prioridad === 'critica' ? 'fatal' : inc.prioridad === 'alta' ? 'grave' : 'leve');
  const [sin] = await db.insert(e.siniestros).values({
    codigo: await siguienteCodigo('SV', inc.abiertoEn), ocurridoEn: rep?.creado ?? inc.abiertoEn, lat: inc.lat, lng: inc.lng, barrio: inc.barrio, direccion: inc.direccion,
    gravedad, vehiculos: rep?.vehiculos ?? [], heridos: gravedad === 'leve' || gravedad === 'grave' ? 1 : 0, fallecidos: gravedad === 'fatal' ? 1 : 0,
    descripcion: inc.titulo, fuente: 'simulado', estado: 'verificado', clase: inc.titulo.startsWith('Atropello') ? 'atropello' : 'choque',
  }).returning({ id: e.siniestros.id });
  await db.update(e.incidentes).set({ estado: 'cerrado', cerradoEn: ahora, siniestroId: sin.id, cierre: 'Vía despejada. Se levantó el informe del siniestro.' }).where(eq(e.incidentes.id, inc.id));
  if (rep) await db.update(e.reportes).set({ estado: 'verificado', siniestroId: sin.id, revisadoEn: ahora }).where(eq(e.reportes.id, rep.id));
  await db.update(e.incidenteUnidades).set({ liberadoEn: ahora }).where(and(eq(e.incidenteUnidades.incidenteId, inc.id), sql`${e.incidenteUnidades.liberadoEn} is null`));
  await db.update(e.unidades).set({ estado: 'disponible', actualizado: ahora })
    .where(sql`${e.unidades.id} in (select unidad_id from vial.incidente_unidades where incidente_id = ${inc.id}) and ${e.unidades.estado} = 'asignada'`);
  await db.insert(e.incidenteEventos).values({ incidenteId: inc.id, tipo: 'estado', texto: 'Incidente cerrado y registrado como siniestro.' });
}
