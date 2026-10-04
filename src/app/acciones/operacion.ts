'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db, esquema as e } from '@/db';
import { CLASES, ESTADOS_UNIDAD, GRAVEDADES, PRIORIDADES, TIPOS_UNIDAD, VEHICULOS, type EstadoIncidente } from '@/db/esquema';
import { ESTADO_INCIDENTE, PRIORIDAD } from '@/lib/etiquetas';
import { barrioMasCercano, dentroDeCartagena } from '@/lib/geo';
import { auditar, notificar, siguienteCodigo } from '@/lib/registro';
import { exigirRol, PERMISOS } from '@/lib/sesion';

export type EstadoAccion = { error?: string; ok?: string };

const id = z.coerce.number().int().positive();
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const texto = (max: number) => z.string().trim().max(max);

function primerError(err: z.ZodError) {
  return err.issues[0]?.message ?? 'Datos inválidos.';
}

async function operador() {
  try {
    return await exigirRol(PERMISOS.operar);
  } catch {
    return null;
  }
}

async function configurador() {
  try {
    return await exigirRol(PERMISOS.configurar);
  } catch {
    return null;
  }
}

const NO_AUTORIZADO: EstadoAccion = { error: 'No tienes permiso para esta acción.' };

function refrescarIncidente(incidenteId: number) {
  revalidatePath(`/consola/incidentes/${incidenteId}`);
  revalidatePath('/consola/incidentes');
  revalidatePath('/consola/turno');
  revalidatePath('/consola/unidades');
  revalidatePath('/consola');
}

async function evento(incidenteId: number, tipo: string, textoEvento: string, usuarioId: number) {
  await db.insert(e.incidenteEventos).values({ incidenteId, tipo, texto: textoEvento, usuarioId });
}

/** Libera todas las unidades aun asignadas al incidente. */
async function liberarTodas(incidenteId: number, ahora: Date) {
  const asignadas = await db.select({ unidadId: e.incidenteUnidades.unidadId }).from(e.incidenteUnidades)
    .where(and(eq(e.incidenteUnidades.incidenteId, incidenteId), isNull(e.incidenteUnidades.liberadoEn)));
  if (!asignadas.length) return 0;
  await db.update(e.incidenteUnidades).set({ liberadoEn: ahora })
    .where(and(eq(e.incidenteUnidades.incidenteId, incidenteId), isNull(e.incidenteUnidades.liberadoEn)));
  for (const a of asignadas) {
    // Solo vuelve a disponible si no quedo asignada a otro incidente.
    const otra = await db.select({ n: sql<number>`count(*)::int` }).from(e.incidenteUnidades)
      .where(and(eq(e.incidenteUnidades.unidadId, a.unidadId), isNull(e.incidenteUnidades.liberadoEn)));
    if (!otra[0].n) await db.update(e.unidades).set({ estado: 'disponible', actualizado: ahora }).where(and(eq(e.unidades.id, a.unidadId), eq(e.unidades.estado, 'asignada')));
  }
  return asignadas.length;
}

// ─── Incidentes ─────────────────────────────────────────────────────────────

const esquemaNuevo = z.object({
  titulo: texto(160).min(5, 'Describe el incidente en el título (mínimo 5 caracteres).'),
  direccion: texto(200).optional(),
  lat, lng,
  prioridad: z.enum(PRIORIDADES),
  slaMin: z.coerce.number().int().min(2, 'El tiempo máximo de llegada debe ser de al menos 2 minutos.').max(240).optional(),
  notas: texto(1000).optional(),
});

export async function crearIncidente(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await operador();
  if (!u) return NO_AUTORIZADO;
  if (!fd.get('lat') || !fd.get('lng')) return { error: 'Marca la ubicación del incidente haciendo clic en el mapa.' };
  const r = esquemaNuevo.safeParse({
    titulo: fd.get('titulo'), direccion: fd.get('direccion') || undefined, lat: fd.get('lat'), lng: fd.get('lng'),
    prioridad: fd.get('prioridad'), slaMin: fd.get('slaMin') || undefined, notas: fd.get('notas') || undefined,
  });
  if (!r.success) return { error: primerError(r.error) };
  const d = r.data;
  if (!dentroDeCartagena(d.lat, d.lng)) return { error: 'La ubicación está fuera del área de Cartagena.' };
  const ahora = new Date();
  const [inc] = await db.insert(e.incidentes).values({
    codigo: await siguienteCodigo('IN', ahora), titulo: d.titulo, lat: d.lat, lng: d.lng, direccion: d.direccion,
    barrio: barrioMasCercano(d.lat, d.lng).nombre, prioridad: d.prioridad, slaMin: d.slaMin ?? PRIORIDAD[d.prioridad].sla,
    responsableId: u.id, abiertoEn: ahora,
  }).returning({ id: e.incidentes.id, codigo: e.incidentes.codigo });
  await evento(inc.id, 'creado', `Incidente abierto por ${u.nombre}.`, u.id);
  if (d.notas) await evento(inc.id, 'nota', d.notas, u.id);
  await auditar(u.id, 'crear', 'incidente', inc.id, { codigo: inc.codigo, prioridad: d.prioridad });
  if (d.prioridad === 'alta' || d.prioridad === 'critica') {
    await notificar({ tipo: 'incidente', titulo: `Incidente ${PRIORIDAD[d.prioridad].texto.toLowerCase()} · ${inc.codigo}`, mensaje: d.titulo, enlace: `/consola/incidentes/${inc.id}` });
  }
  refrescarIncidente(inc.id);
  redirect(`/consola/incidentes/${inc.id}`);
}

const SIGUIENTE: Partial<Record<EstadoIncidente, EstadoIncidente>> = { abierto: 'despachado', despachado: 'en_sitio', en_sitio: 'controlado' };

export async function avanzarEstado(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await operador();
  if (!u) return NO_AUTORIZADO;
  const r = z.object({ id, estado: z.enum(['despachado', 'en_sitio', 'controlado']) }).safeParse({ id: fd.get('id'), estado: fd.get('estado') });
  if (!r.success) return { error: 'Transición inválida.' };
  const inc = await db.query.incidentes.findFirst({ where: eq(e.incidentes.id, r.data.id) });
  if (!inc) return { error: 'El incidente no existe.' };
  if (SIGUIENTE[inc.estado] !== r.data.estado) return { error: `No se puede pasar de «${ESTADO_INCIDENTE[inc.estado].texto}» a «${ESTADO_INCIDENTE[r.data.estado].texto}».` };
  const ahora = new Date();
  const cambios: Partial<typeof e.incidentes.$inferInsert> = { estado: r.data.estado };
  if (r.data.estado === 'despachado') cambios.despachadoEn = ahora;
  if (r.data.estado === 'en_sitio') { cambios.enSitioEn = ahora; if (!inc.despachadoEn) cambios.despachadoEn = ahora; }
  await db.update(e.incidentes).set(cambios).where(eq(e.incidentes.id, inc.id));
  if (r.data.estado === 'en_sitio') {
    const asignadas = await db.select({ id: e.incidenteUnidades.unidadId }).from(e.incidenteUnidades)
      .where(and(eq(e.incidenteUnidades.incidenteId, inc.id), isNull(e.incidenteUnidades.liberadoEn)));
    for (const a of asignadas) await db.update(e.unidades).set({ lat: inc.lat, lng: inc.lng, actualizado: ahora }).where(eq(e.unidades.id, a.id));
  }
  await evento(inc.id, 'estado', `Estado: ${ESTADO_INCIDENTE[r.data.estado].texto}.`, u.id);
  await auditar(u.id, 'estado', 'incidente', inc.id, { de: inc.estado, a: r.data.estado });
  refrescarIncidente(inc.id);
  return { ok: `Estado actualizado: ${ESTADO_INCIDENTE[r.data.estado].texto}.` };
}

export async function asignarUnidad(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await operador();
  if (!u) return NO_AUTORIZADO;
  const r = z.object({ id, unidadId: id }).safeParse({ id: fd.get('id'), unidadId: fd.get('unidadId') });
  if (!r.success) return { error: 'Elige una unidad.' };
  const [inc, unidad] = await Promise.all([
    db.query.incidentes.findFirst({ where: eq(e.incidentes.id, r.data.id) }),
    db.query.unidades.findFirst({ where: eq(e.unidades.id, r.data.unidadId) }),
  ]);
  if (!inc || !unidad) return { error: 'El incidente o la unidad no existen.' };
  if (['cerrado', 'cancelado'].includes(inc.estado)) return { error: 'El incidente ya está cerrado.' };
  if (unidad.estado !== 'disponible') return { error: `${unidad.nombre} no está disponible.` };
  const ahora = new Date();
  await db.insert(e.incidenteUnidades).values({ incidenteId: inc.id, unidadId: unidad.id, asignadoEn: ahora });
  await db.update(e.unidades).set({ estado: 'asignada', actualizado: ahora }).where(eq(e.unidades.id, unidad.id));
  if (inc.estado === 'abierto') await db.update(e.incidentes).set({ estado: 'despachado', despachadoEn: ahora }).where(eq(e.incidentes.id, inc.id));
  await evento(inc.id, 'unidad', `${unidad.nombre} asignada${inc.estado === 'abierto' ? ' y despachada al sitio' : ''}.`, u.id);
  await auditar(u.id, 'asignar', 'incidente', inc.id, { unidad: unidad.nombre });
  refrescarIncidente(inc.id);
  return { ok: `${unidad.nombre} asignada.` };
}

export async function liberarUnidad(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await operador();
  if (!u) return NO_AUTORIZADO;
  const r = z.object({ id, unidadId: id }).safeParse({ id: fd.get('id'), unidadId: fd.get('unidadId') });
  if (!r.success) return { error: 'Datos inválidos.' };
  const unidad = await db.query.unidades.findFirst({ where: eq(e.unidades.id, r.data.unidadId) });
  if (!unidad) return { error: 'La unidad no existe.' };
  const ahora = new Date();
  const liberadas = await db.update(e.incidenteUnidades).set({ liberadoEn: ahora })
    .where(and(eq(e.incidenteUnidades.incidenteId, r.data.id), eq(e.incidenteUnidades.unidadId, unidad.id), isNull(e.incidenteUnidades.liberadoEn)))
    .returning({ unidadId: e.incidenteUnidades.unidadId });
  if (!liberadas.length) return { error: 'La unidad no estaba asignada a este incidente.' };
  await db.update(e.unidades).set({ estado: 'disponible', actualizado: ahora }).where(and(eq(e.unidades.id, unidad.id), eq(e.unidades.estado, 'asignada')));
  await evento(r.data.id, 'unidad', `${unidad.nombre} liberada.`, u.id);
  await auditar(u.id, 'liberar', 'incidente', r.data.id, { unidad: unidad.nombre });
  refrescarIncidente(r.data.id);
  return { ok: `${unidad.nombre} quedó disponible.` };
}

export async function cambiarPrioridad(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await operador();
  if (!u) return NO_AUTORIZADO;
  const r = z.object({ id, prioridad: z.enum(PRIORIDADES) }).safeParse({ id: fd.get('id'), prioridad: fd.get('prioridad') });
  if (!r.success) return { error: 'Prioridad inválida.' };
  const inc = await db.query.incidentes.findFirst({ where: eq(e.incidentes.id, r.data.id) });
  if (!inc) return { error: 'El incidente no existe.' };
  if (inc.prioridad === r.data.prioridad) return { ok: 'La prioridad no cambió.' };
  await db.update(e.incidentes).set({ prioridad: r.data.prioridad, slaMin: PRIORIDAD[r.data.prioridad].sla }).where(eq(e.incidentes.id, inc.id));
  await evento(inc.id, 'prioridad', `Prioridad: ${PRIORIDAD[inc.prioridad].texto} → ${PRIORIDAD[r.data.prioridad].texto} (llegada máxima ${PRIORIDAD[r.data.prioridad].sla} min).`, u.id);
  await auditar(u.id, 'prioridad', 'incidente', inc.id, { de: inc.prioridad, a: r.data.prioridad });
  refrescarIncidente(inc.id);
  return { ok: 'Prioridad actualizada.' };
}

export async function agregarNota(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await operador();
  if (!u) return NO_AUTORIZADO;
  const r = z.object({ id, texto: texto(1000).min(2, 'Escribe la nota.') }).safeParse({ id: fd.get('id'), texto: fd.get('texto') });
  if (!r.success) return { error: primerError(r.error) };
  await evento(r.data.id, 'nota', r.data.texto, u.id);
  refrescarIncidente(r.data.id);
  return { ok: 'Nota agregada.' };
}

const esquemaCierre = z.object({
  id,
  modo: z.enum(['nuevo', 'existente']),
  codigo: texto(40).optional(),
  gravedad: z.enum(GRAVEDADES).optional(),
  clase: z.enum(CLASES).optional(),
  heridos: z.coerce.number().int().min(0).max(99).default(0),
  fallecidos: z.coerce.number().int().min(0).max(99).default(0),
  causaProbable: texto(200).optional(),
  descripcion: texto(1000).optional(),
  resumen: texto(1000).min(5, 'Escribe un resumen del cierre (mínimo 5 caracteres).'),
});

export async function cerrarIncidente(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await operador();
  if (!u) return NO_AUTORIZADO;
  const r = esquemaCierre.safeParse({
    id: fd.get('id'), modo: fd.get('modo'), codigo: fd.get('codigo') || undefined, gravedad: fd.get('gravedad') || undefined,
    clase: fd.get('clase') || undefined, heridos: fd.get('heridos') || 0, fallecidos: fd.get('fallecidos') || 0,
    causaProbable: fd.get('causaProbable') || undefined, descripcion: fd.get('descripcion') || undefined, resumen: fd.get('resumen'),
  });
  if (!r.success) return { error: primerError(r.error) };
  const d = r.data;
  const inc = await db.query.incidentes.findFirst({ where: eq(e.incidentes.id, d.id) });
  if (!inc) return { error: 'El incidente no existe.' };
  if (['cerrado', 'cancelado'].includes(inc.estado)) return { error: 'El incidente ya estaba cerrado.' };
  const ahora = new Date();
  let siniestroId: number;
  let codigoSiniestro: string;

  if (d.modo === 'existente') {
    if (!d.codigo) return { error: 'Escribe el código del siniestro existente (por ejemplo SV-2026-000123).' };
    const s = await db.query.siniestros.findFirst({ where: sql`upper(${e.siniestros.codigo}) = ${d.codigo.toUpperCase()}` });
    if (!s) return { error: `No existe un siniestro con el código ${d.codigo}.` };
    siniestroId = s.id;
    codigoSiniestro = s.codigo;
  } else {
    if (!d.gravedad || !d.clase) return { error: 'Indica la gravedad y la clase del siniestro.' };
    if (d.gravedad === 'fatal' && d.fallecidos < 1) return { error: 'Un siniestro fatal debe tener al menos una víctima fatal.' };
    if ((d.gravedad === 'leve' || d.gravedad === 'grave') && d.heridos < 1) return { error: 'Un siniestro con heridos debe registrar al menos una persona herida.' };
    const vehiculos = fd.getAll('vehiculos').map(String).filter((v): v is (typeof VEHICULOS)[number] => (VEHICULOS as readonly string[]).includes(v));
    const rep = inc.reporteId ? await db.query.reportes.findFirst({ where: eq(e.reportes.id, inc.reporteId) }) : null;
    codigoSiniestro = await siguienteCodigo('SV', inc.abiertoEn);
    const [s] = await db.insert(e.siniestros).values({
      codigo: codigoSiniestro, ocurridoEn: rep?.creado ?? inc.abiertoEn, lat: inc.lat, lng: inc.lng, barrio: inc.barrio, direccion: inc.direccion,
      gravedad: d.gravedad, clase: d.clase, vehiculos, heridos: d.heridos, fallecidos: d.fallecidos, causaProbable: d.causaProbable,
      descripcion: d.descripcion || inc.titulo, fuente: 'manual', estado: 'verificado', registradoPor: u.id,
    }).returning({ id: e.siniestros.id });
    siniestroId = s.id;
  }

  await db.update(e.incidentes).set({ estado: 'cerrado', cerradoEn: ahora, siniestroId, cierre: d.resumen }).where(eq(e.incidentes.id, inc.id));
  if (inc.reporteId) await db.update(e.reportes).set({ estado: 'verificado', siniestroId, revisadoPor: u.id, revisadoEn: ahora }).where(eq(e.reportes.id, inc.reporteId));
  const n = await liberarTodas(inc.id, ahora);
  await evento(inc.id, 'estado', `Incidente cerrado. Siniestro ${codigoSiniestro}${n ? `; ${n} unidad(es) liberada(s)` : ''}. ${d.resumen}`, u.id);
  await auditar(u.id, 'cerrar', 'incidente', inc.id, { siniestro: codigoSiniestro, modo: d.modo });
  refrescarIncidente(inc.id);
  revalidatePath('/consola/siniestros');
  return { ok: `Incidente cerrado y registrado como ${codigoSiniestro}.` };
}

export async function cancelarIncidente(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await operador();
  if (!u) return NO_AUTORIZADO;
  const r = z.object({ id, motivo: texto(500).min(5, 'Escribe el motivo de la cancelación (mínimo 5 caracteres).') }).safeParse({ id: fd.get('id'), motivo: fd.get('motivo') });
  if (!r.success) return { error: primerError(r.error) };
  const inc = await db.query.incidentes.findFirst({ where: eq(e.incidentes.id, r.data.id) });
  if (!inc) return { error: 'El incidente no existe.' };
  if (['cerrado', 'cancelado'].includes(inc.estado)) return { error: 'El incidente ya estaba cerrado.' };
  const ahora = new Date();
  await db.update(e.incidentes).set({ estado: 'cancelado', cerradoEn: ahora, cierre: `Cancelado: ${r.data.motivo}` }).where(eq(e.incidentes.id, inc.id));
  const n = await liberarTodas(inc.id, ahora);
  await evento(inc.id, 'estado', `Incidente cancelado${n ? ` (${n} unidad(es) liberada(s))` : ''}. Motivo: ${r.data.motivo}`, u.id);
  await auditar(u.id, 'cancelar', 'incidente', inc.id, { motivo: r.data.motivo });
  refrescarIncidente(inc.id);
  return { ok: 'Incidente cancelado.' };
}

// ─── Unidades ───────────────────────────────────────────────────────────────

const esquemaUnidad = z.object({
  id: id.optional(),
  nombre: texto(60).min(2, 'Escribe el nombre de la unidad.'),
  tipo: z.enum(TIPOS_UNIDAD),
  estado: z.enum(ESTADOS_UNIDAD),
  lat: lat.optional(),
  lng: lng.optional(),
});

export async function guardarUnidad(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await configurador();
  if (!u) return NO_AUTORIZADO;
  const r = esquemaUnidad.safeParse({
    id: fd.get('id') || undefined, nombre: fd.get('nombre'), tipo: fd.get('tipo'), estado: fd.get('estado'),
    lat: fd.get('lat') || undefined, lng: fd.get('lng') || undefined,
  });
  if (!r.success) return { error: primerError(r.error) };
  const d = r.data;
  if (d.lat != null && d.lng != null && !dentroDeCartagena(d.lat, d.lng)) return { error: 'La ubicación está fuera de Cartagena.' };
  const repetida = await db.query.unidades.findFirst({ where: sql`lower(${e.unidades.nombre}) = ${d.nombre.toLowerCase()}` });
  if (repetida && repetida.id !== d.id) return { error: `Ya existe una unidad llamada «${d.nombre}».` };
  const ahora = new Date();
  if (d.id) {
    const actual = await db.query.unidades.findFirst({ where: eq(e.unidades.id, d.id) });
    if (!actual) return { error: 'La unidad no existe.' };
    if (actual.estado === 'asignada' && d.estado !== 'asignada') return { error: 'La unidad está atendiendo un incidente: libérala desde la ficha del incidente.' };
    if (actual.estado !== 'asignada' && d.estado === 'asignada') return { error: 'Las unidades se asignan desde la ficha de un incidente.' };
    await db.update(e.unidades).set({ nombre: d.nombre, tipo: d.tipo, estado: d.estado, lat: d.lat ?? actual.lat, lng: d.lng ?? actual.lng, actualizado: ahora }).where(eq(e.unidades.id, d.id));
    await auditar(u.id, 'editar', 'unidad', d.id, { nombre: d.nombre, estado: d.estado });
  } else {
    if (d.estado === 'asignada') return { error: 'Una unidad nueva debe empezar disponible o fuera de servicio.' };
    const [n] = await db.insert(e.unidades).values({ nombre: d.nombre, tipo: d.tipo, estado: d.estado, lat: d.lat, lng: d.lng }).returning({ id: e.unidades.id });
    await auditar(u.id, 'crear', 'unidad', n.id, { nombre: d.nombre });
  }
  revalidatePath('/consola/unidades');
  revalidatePath('/consola/turno');
  return { ok: d.id ? 'Unidad actualizada.' : 'Unidad creada.' };
}

// ─── Alertas y zonas ────────────────────────────────────────────────────────

export async function atenderAlerta(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await operador();
  if (!u) return NO_AUTORIZADO;
  const r = z.object({ id, nota: texto(500).optional() }).safeParse({ id: fd.get('id'), nota: fd.get('nota') || undefined });
  if (!r.success) return { error: 'Datos inválidos.' };
  await db.update(e.alertas).set({ atendida: true, atendidaPor: u.id, nota: r.data.nota }).where(eq(e.alertas.id, r.data.id));
  await auditar(u.id, 'atender', 'alerta', r.data.id, { nota: r.data.nota });
  revalidatePath('/consola/alertas');
  revalidatePath('/consola/turno');
  revalidatePath('/consola');
  return { ok: 'Alerta marcada como atendida.' };
}

const esquemaZona = z.object({
  id: id.optional(),
  nombre: texto(120).min(3, 'Escribe el nombre de la zona.'),
  lat, lng,
  radioM: z.coerce.number().int().min(50, 'El radio mínimo es 50 m.').max(5000, 'El radio máximo es 5 km.'),
  umbral: z.coerce.number().int().min(1, 'El umbral mínimo es 1 evento.').max(50),
  ventanaMin: z.coerce.number().int().min(5, 'La ventana mínima es 5 minutos.').max(1440, 'La ventana máxima es 24 horas.'),
  contacto: texto(200).optional(),
});

export async function guardarZona(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await configurador();
  if (!u) return NO_AUTORIZADO;
  if (!fd.get('lat') || !fd.get('lng')) return { error: 'Marca el centro de la zona haciendo clic en el mapa.' };
  const r = esquemaZona.safeParse({
    id: fd.get('id') || undefined, nombre: fd.get('nombre'), lat: fd.get('lat'), lng: fd.get('lng'), radioM: fd.get('radioM'),
    umbral: fd.get('umbral'), ventanaMin: fd.get('ventanaMin'), contacto: fd.get('contacto') || undefined,
  });
  if (!r.success) return { error: primerError(r.error) };
  const { id: zonaId, ...d } = r.data;
  if (!dentroDeCartagena(d.lat, d.lng)) return { error: 'El centro de la zona está fuera de Cartagena.' };
  if (zonaId) {
    await db.update(e.zonasAlerta).set(d).where(eq(e.zonasAlerta.id, zonaId));
    await auditar(u.id, 'editar', 'zona_alerta', zonaId, d);
  } else {
    const [z2] = await db.insert(e.zonasAlerta).values(d).returning({ id: e.zonasAlerta.id });
    await auditar(u.id, 'crear', 'zona_alerta', z2.id, d);
  }
  revalidatePath('/consola/alertas');
  return { ok: zonaId ? 'Zona actualizada.' : 'Zona creada.' };
}

export async function alternarZona(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await configurador();
  if (!u) return NO_AUTORIZADO;
  const r = id.safeParse(fd.get('id'));
  if (!r.success) return { error: 'Datos inválidos.' };
  const zona = await db.query.zonasAlerta.findFirst({ where: eq(e.zonasAlerta.id, r.data) });
  if (!zona) return { error: 'La zona no existe.' };
  await db.update(e.zonasAlerta).set({ activa: !zona.activa }).where(eq(e.zonasAlerta.id, zona.id));
  await auditar(u.id, zona.activa ? 'desactivar' : 'activar', 'zona_alerta', zona.id);
  revalidatePath('/consola/alertas');
  return { ok: zona.activa ? 'Zona pausada.' : 'Zona activada.' };
}

export async function eliminarZona(_: EstadoAccion, fd: FormData): Promise<EstadoAccion> {
  const u = await configurador();
  if (!u) return NO_AUTORIZADO;
  const r = id.safeParse(fd.get('id'));
  if (!r.success) return { error: 'Datos inválidos.' };
  const [z2] = await db.delete(e.zonasAlerta).where(eq(e.zonasAlerta.id, r.data)).returning({ nombre: e.zonasAlerta.nombre });
  if (!z2) return { error: 'La zona no existe.' };
  await auditar(u.id, 'eliminar', 'zona_alerta', r.data, { nombre: z2.nombre });
  revalidatePath('/consola/alertas');
  // La fila desaparece: el aviso se muestra arriba de la pagina.
  redirect(`/consola/alertas?eliminada=${encodeURIComponent(z2.nombre)}`);
}
