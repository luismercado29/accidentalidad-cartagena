'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db, esquema as e } from '@/db';
import { CLASES, GRAVEDADES, VEHICULOS } from '@/db/esquema';
import { PRIORIDAD } from '@/lib/etiquetas';
import { dentroDeCartagena } from '@/lib/geo';
import { bloqueado, sumarIntento } from '@/lib/limites';
import { auditar, notificar, siguienteCodigo } from '@/lib/registro';
import { crearReporteCiudadano, prioridadDe } from '@/lib/reportes';
import { exigirRol, PERMISOS, usuarioActual } from '@/lib/sesion';

export type EstadoReporte = { error?: string; errores?: Record<string, string>; valores?: Record<string, string | string[]> };

const textoOpcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres.`).optional().transform((v) => v || null);

const coordenada = z.string().trim().min(1, 'Marca el lugar en el mapa.').transform(Number).refine((v) => Number.isFinite(v), 'Marca el lugar en el mapa.');

const esquemaReporte = z.object({
  lat: coordenada,
  lng: coordenada,
  direccion: textoOpcional(200),
  descripcion: z.string().trim().min(10, 'Cuéntanos un poco más (mínimo 10 caracteres).').max(1000, 'Máximo 1000 caracteres.'),
  gravedad: z.enum(GRAVEDADES, { message: 'Elige qué tan grave parece.' }),
  heridos: z.enum(['si', 'no', 'no_se'], { message: 'Indica si hay personas heridas.' }),
  vehiculos: z.array(z.enum(VEHICULOS)).max(8).default([]),
  contactoNombre: textoOpcional(80),
  contactoTelefono: z.string().trim().max(20).optional()
    .refine((v) => !v || /^[+\d][\d\s-]{6,18}$/.test(v), 'Escribe un teléfono válido, por ejemplo 300 123 4567.')
    .transform((v) => v || null),
  autoriza: z.string().optional(),
  punto: z.string().trim().max(20).optional(),
});

async function ipCliente() {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
}

/** Reporte ciudadano publico (sin cuenta). */
export async function enviarReporte(_: EstadoReporte, datos: FormData): Promise<EstadoReporte> {
  const crudo = {
    lat: String(datos.get('lat') ?? ''), lng: String(datos.get('lng') ?? ''), direccion: String(datos.get('direccion') ?? ''),
    descripcion: String(datos.get('descripcion') ?? ''), gravedad: String(datos.get('gravedad') ?? ''), heridos: String(datos.get('heridos') ?? ''),
    vehiculos: datos.getAll('vehiculos').map(String), contactoNombre: String(datos.get('contactoNombre') ?? ''),
    contactoTelefono: String(datos.get('contactoTelefono') ?? ''), autoriza: datos.get('autoriza') ? 'si' : undefined,
    punto: String(datos.get('punto') ?? '') || undefined,
  };
  const valores = { ...crudo, autoriza: crudo.autoriza ?? '' } as Record<string, string | string[]>;

  // Campo trampa: las personas no lo ven; los robots lo llenan. Se responde como si todo saliera bien.
  if (String(datos.get('sitio_web') ?? '').trim()) redirect('/seguimiento?nuevo=1');

  const ip = `reporte:${await ipCliente()}`;
  if (bloqueado(ip, 6)) return { error: 'Recibimos varios reportes desde tu conexión en poco tiempo. Espera unos minutos o llama al 123 si es una emergencia.', valores };

  const r = esquemaReporte.safeParse(crudo);
  const errores: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) errores[String(i.path[0])] ??= i.message;
  if (r.success && !dentroDeCartagena(r.data.lat, r.data.lng)) errores.lat = 'El lugar marcado está fuera de Cartagena. Revisa el punto en el mapa.';
  if (r.success && (r.data.contactoNombre || r.data.contactoTelefono) && !r.data.autoriza) errores.autoriza = 'Para guardar tus datos de contacto necesitamos tu autorización.';
  if (!r.success || Object.keys(errores).length) {
    if (errores.lng && !errores.lat) errores.lat = errores.lng;
    return { errores, valores };
  }
  const d = r.data;

  let puntoQrId: number | null = null;
  if (d.punto) {
    const p = await db.query.puntosQr.findFirst({ where: eq(e.puntosQr.codigo, d.punto.toUpperCase()), columns: { id: true, activo: true } });
    if (p?.activo) puntoQrId = p.id;
  }
  sumarIntento(ip, 30 * 60_000);
  const usuario = await usuarioActual();
  const rep = await crearReporteCiudadano({
    lat: d.lat, lng: d.lng, direccion: d.direccion, descripcion: d.descripcion, gravedadEstimada: d.gravedad,
    hayHeridos: d.heridos === 'si', vehiculos: d.vehiculos, contactoNombre: d.contactoNombre, contactoTelefono: d.contactoTelefono,
    canal: puntoQrId ? 'qr' : 'web', puntoQrId, usuarioId: usuario?.id ?? null,
  });
  revalidatePath('/consola/reportes');
  redirect(`/seguimiento?codigo=${encodeURIComponent(rep.codigo)}&nuevo=1`);
}

// ─── Consola: revision de reportes ───────────────────────────────────────────

export type EstadoAccion = { error?: string; ok?: string };

async function reporteOError(datos: FormData) {
  const id = Number(datos.get('id'));
  if (!Number.isInteger(id)) return null;
  return db.query.reportes.findFirst({ where: eq(e.reportes.id, id) }) ?? null;
}

/** Verifica el reporte y lo registra como siniestro (o lo vincula si ya hay uno). */
export async function verificarComoSiniestro(_: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const u = await exigirRol(PERMISOS.operar);
  const rep = await reporteOError(datos);
  if (!rep) return { error: 'No encontramos el reporte.' };
  if (rep.siniestroId) return { error: 'Este reporte ya tiene un siniestro registrado.' };
  const clase = z.enum(CLASES).catch('choque').parse(datos.get('clase'));
  const gravedad = z.enum(GRAVEDADES).catch(rep.gravedadEstimada).parse(datos.get('gravedad'));
  const [s] = await db.insert(e.siniestros).values({
    codigo: await siguienteCodigo('SV', rep.creado), ocurridoEn: rep.creado, lat: rep.lat, lng: rep.lng, barrio: rep.barrio,
    direccion: rep.direccion, gravedad, clase, vehiculos: rep.vehiculos, heridos: rep.hayHeridos || gravedad === 'leve' || gravedad === 'grave' ? 1 : 0,
    fallecidos: gravedad === 'fatal' ? 1 : 0, descripcion: rep.descripcion, fuente: 'ciudadano', estado: 'verificado', registradoPor: u.id,
  }).returning({ id: e.siniestros.id, codigo: e.siniestros.codigo });
  await db.update(e.reportes).set({ estado: 'verificado', siniestroId: s.id, revisadoPor: u.id, revisadoEn: new Date() }).where(eq(e.reportes.id, rep.id));
  if (rep.incidenteId) await db.update(e.incidentes).set({ siniestroId: s.id }).where(eq(e.incidentes.id, rep.incidenteId));
  await auditar(u.id, 'verificar', 'reporte', rep.id, { siniestro: s.codigo });
  revalidatePath('/consola/reportes');
  return { ok: `Reporte verificado y registrado como siniestro ${s.codigo}.` };
}

/** Abre un incidente para atender el reporte. */
export async function abrirIncidenteDesdeReporte(_: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const u = await exigirRol(PERMISOS.operar);
  const rep = await reporteOError(datos);
  if (!rep) return { error: 'No encontramos el reporte.' };
  if (rep.incidenteId) return { error: 'Este reporte ya tiene un incidente abierto.' };
  const prioridad = prioridadDe(rep.gravedadEstimada, rep.hayHeridos);
  const [inc] = await db.insert(e.incidentes).values({
    codigo: await siguienteCodigo('IN'), titulo: rep.descripcion.slice(0, 160), lat: rep.lat, lng: rep.lng, direccion: rep.direccion,
    barrio: rep.barrio, prioridad, slaMin: PRIORIDAD[prioridad].sla, reporteId: rep.id, responsableId: u.id,
  }).returning({ id: e.incidentes.id, codigo: e.incidentes.codigo });
  await db.insert(e.incidenteEventos).values({ incidenteId: inc.id, tipo: 'creado', texto: `Incidente abierto desde el reporte ${rep.codigo}.`, usuarioId: u.id });
  await db.update(e.reportes).set({ estado: 'en_revision', incidenteId: inc.id, revisadoPor: u.id, revisadoEn: new Date() }).where(eq(e.reportes.id, rep.id));
  await auditar(u.id, 'abrir_incidente', 'reporte', rep.id, { incidente: inc.codigo });
  if (prioridad === 'alta' || prioridad === 'critica') {
    await notificar({ tipo: 'incidente', titulo: `Incidente ${PRIORIDAD[prioridad].texto.toLowerCase()} · ${inc.codigo}`, mensaje: rep.descripcion.slice(0, 140), enlace: `/consola/incidentes/${inc.id}` });
  }
  revalidatePath('/consola/reportes');
  revalidatePath('/consola/incidentes');
  return { ok: `Incidente ${inc.codigo} abierto.` };
}

/** Marca el reporte como duplicado de otro reporte o de un incidente. */
export async function marcarDuplicado(_: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const u = await exigirRol(PERMISOS.operar);
  const rep = await reporteOError(datos);
  if (!rep) return { error: 'No encontramos el reporte.' };
  const [tipo, idTexto] = String(datos.get('destino') ?? '').split(':');
  const destinoId = Number(idTexto);
  if (!Number.isInteger(destinoId)) return { error: 'Elige con qué reporte o incidente coincide.' };
  if (tipo === 'incidente') {
    const inc = await db.query.incidentes.findFirst({ where: eq(e.incidentes.id, destinoId), columns: { id: true, codigo: true, siniestroId: true } });
    if (!inc) return { error: 'El incidente ya no existe.' };
    await db.update(e.reportes).set({ estado: 'duplicado', incidenteId: inc.id, siniestroId: inc.siniestroId, motivo: `Duplicado del incidente ${inc.codigo}`, revisadoPor: u.id, revisadoEn: new Date() }).where(eq(e.reportes.id, rep.id));
    await db.insert(e.incidenteEventos).values({ incidenteId: inc.id, tipo: 'nota', texto: `Se vinculó el reporte ${rep.codigo} como duplicado.`, usuarioId: u.id });
  } else if (tipo === 'reporte') {
    const otro = await db.query.reportes.findFirst({ where: eq(e.reportes.id, destinoId), columns: { id: true, codigo: true, incidenteId: true, siniestroId: true } });
    if (!otro || otro.id === rep.id) return { error: 'El reporte elegido no es válido.' };
    await db.update(e.reportes).set({ estado: 'duplicado', incidenteId: otro.incidenteId, siniestroId: otro.siniestroId, motivo: `Duplicado del reporte ${otro.codigo}`, revisadoPor: u.id, revisadoEn: new Date() }).where(eq(e.reportes.id, rep.id));
  } else return { error: 'Elige con qué reporte o incidente coincide.' };
  await auditar(u.id, 'duplicado', 'reporte', rep.id, { destino: `${tipo}:${destinoId}` });
  revalidatePath('/consola/reportes');
  return { ok: 'Reporte marcado como duplicado.' };
}

export async function descartarReporte(_: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  const u = await exigirRol(PERMISOS.operar);
  const rep = await reporteOError(datos);
  if (!rep) return { error: 'No encontramos el reporte.' };
  const motivo = String(datos.get('motivo') ?? '').trim().slice(0, 300);
  if (motivo.length < 5) return { error: 'Escribe el motivo del descarte (mínimo 5 caracteres).' };
  await db.update(e.reportes).set({ estado: 'descartado', motivo, revisadoPor: u.id, revisadoEn: new Date() }).where(eq(e.reportes.id, rep.id));
  await auditar(u.id, 'descartar', 'reporte', rep.id, { motivo });
  revalidatePath('/consola/reportes');
  return { ok: 'Reporte descartado.' };
}

/** Pasa a "en revision" al abrirlo, para que otro operador no lo tome a la vez. */
export async function tomarReporte(id: number) {
  const u = await exigirRol(PERMISOS.operar);
  await db.update(e.reportes).set({ estado: 'en_revision', revisadoPor: u.id })
    .where(sql`${e.reportes.id} = ${id} and ${e.reportes.estado} = 'recibido'`);
  revalidatePath('/consola/reportes');
}
