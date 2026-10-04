'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db, esquema as e } from '@/db';
import { NIVELES_ALERTA, TIPOS_CAMARA, TIPOS_NOVEDAD } from '@/db/esquema';
import { dentroDeCartagena } from '@/lib/geo';
import { interpretarPoligono } from '@/lib/territorio';
import { auditar } from '@/lib/registro';
import { exigirRol, PERMISOS } from '@/lib/sesion';
import { parsearDia } from '@/lib/tiempo';

/** Redirige con un mensaje en la URL (?ok= o ?error=). */
function volver(ruta: string, tipo: 'ok' | 'error', mensaje: string): never {
  const sep = ruta.includes('?') ? '&' : '?';
  redirect(`${ruta}${sep}${tipo}=${encodeURIComponent(mensaje)}`);
}

const texto = (max: number) => z.string().trim().max(max);
const coord = z.coerce.number().finite();

// ─── Geocercas ──────────────────────────────────────────────────────────────

const esquemaGeocerca = z.object({
  nombre: texto(120).min(3, 'Escribe un nombre (mínimo 3 letras).'),
  descripcion: texto(500).optional(),
  nivel: z.enum(NIVELES_ALERTA),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido.'),
  activa: z.boolean(),
});

export async function guardarGeocerca(datos: FormData) {
  const u = await exigirRol(PERMISOS.configurar);
  const id = Number(datos.get('id')) || null;
  const ruta = id ? `/consola/geocercas/${id}` : '/consola/geocercas';
  const r = esquemaGeocerca.safeParse({
    nombre: datos.get('nombre'), descripcion: datos.get('descripcion') ?? undefined, nivel: datos.get('nivel'),
    color: datos.get('color'), activa: datos.get('activa') === 'on',
  });
  if (!r.success) volver(ruta, 'error', r.error.issues[0].message);
  const poligono = interpretarPoligono(String(datos.get('poligono') ?? ''));
  if (typeof poligono === 'string') volver(ruta, 'error', poligono);
  const valores = { ...r.data, descripcion: r.data.descripcion || null, poligono };
  let nuevoId = id;
  if (id) await db.update(e.geocercas).set(valores).where(eq(e.geocercas.id, id));
  else nuevoId = (await db.insert(e.geocercas).values(valores).returning({ id: e.geocercas.id }))[0].id;
  await auditar(u.id, id ? 'editar' : 'crear', 'geocerca', nuevoId, { nombre: valores.nombre, vertices: poligono.length - 1 });
  revalidatePath('/consola/geocercas');
  volver(`/consola/geocercas/${nuevoId}`, 'ok', id ? 'Geocerca actualizada.' : 'Geocerca creada.');
}

export async function eliminarGeocerca(datos: FormData) {
  const u = await exigirRol(PERMISOS.configurar);
  const id = Number(datos.get('id'));
  if (!id) return;
  await db.delete(e.geocercas).where(eq(e.geocercas.id, id));
  await auditar(u.id, 'eliminar', 'geocerca', id);
  revalidatePath('/consola/geocercas');
  volver('/consola/geocercas', 'ok', 'Geocerca eliminada.');
}

// ─── Camaras ────────────────────────────────────────────────────────────────

const urlSegura = z.string().trim().max(500).refine((v) => {
  if (!v) return true;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}, 'La dirección del video debe empezar por https:// (las conexiones sin cifrar no se permiten).');

const esquemaCamara = z.object({
  nombre: texto(120).min(3, 'Escribe un nombre (mínimo 3 letras).'),
  lat: coord, lng: coord,
  urlStream: urlSegura,
  tipo: z.enum(TIPOS_CAMARA),
  descripcion: texto(500).optional(),
  activa: z.boolean(),
});

export async function guardarCamara(datos: FormData) {
  const u = await exigirRol(PERMISOS.configurar);
  const id = Number(datos.get('id')) || null;
  const r = esquemaCamara.safeParse({
    nombre: datos.get('nombre'), lat: datos.get('lat'), lng: datos.get('lng'), urlStream: datos.get('urlStream') ?? '',
    tipo: datos.get('tipo'), descripcion: datos.get('descripcion') ?? undefined, activa: datos.get('activa') === 'on',
  });
  const ruta = `/consola/camaras${id ? `?editar=${id}` : '?nueva=1'}`;
  if (!r.success) volver(ruta, 'error', r.error.issues[0].message);
  if (!dentroDeCartagena(r.data.lat, r.data.lng)) volver(ruta, 'error', 'Ubica la cámara dentro de Cartagena (haz clic en el mapa).');
  const valores = { ...r.data, urlStream: r.data.urlStream || null, descripcion: r.data.descripcion || null };
  let nuevoId = id;
  if (id) await db.update(e.camaras).set(valores).where(eq(e.camaras.id, id));
  else nuevoId = (await db.insert(e.camaras).values(valores).returning({ id: e.camaras.id }))[0].id;
  await auditar(u.id, id ? 'editar' : 'crear', 'camara', nuevoId, { nombre: valores.nombre, conectada: !!valores.urlStream });
  revalidatePath('/consola/camaras');
  volver('/consola/camaras', 'ok', id ? 'Cámara actualizada.' : 'Cámara registrada.');
}

export async function eliminarCamara(datos: FormData) {
  const u = await exigirRol(PERMISOS.configurar);
  const id = Number(datos.get('id'));
  if (!id) return;
  await db.delete(e.camaras).where(eq(e.camaras.id, id));
  await auditar(u.id, 'eliminar', 'camara', id);
  revalidatePath('/consola/camaras');
  volver('/consola/camaras', 'ok', 'Cámara eliminada.');
}

// ─── Novedades en la via ────────────────────────────────────────────────────

const esquemaNovedad = z.object({
  tipo: z.enum(TIPOS_NOVEDAD),
  titulo: texto(140).min(3, 'Escribe un título (mínimo 3 letras).'),
  descripcion: texto(800).optional(),
  lat: coord, lng: coord,
  desde: z.string().optional(),
  hasta: z.string().optional(),
  activa: z.boolean(),
});

export async function guardarNovedad(datos: FormData) {
  const u = await exigirRol(PERMISOS.operar);
  const id = Number(datos.get('id')) || null;
  const ruta = `/consola/novedades${id ? `?editar=${id}` : '?nueva=1'}`;
  const r = esquemaNovedad.safeParse({
    tipo: datos.get('tipo'), titulo: datos.get('titulo'), descripcion: datos.get('descripcion') ?? undefined,
    lat: datos.get('lat'), lng: datos.get('lng'), desde: datos.get('desde') || undefined, hasta: datos.get('hasta') || undefined,
    activa: datos.get('activa') === 'on',
  });
  if (!r.success) volver(ruta, 'error', r.error.issues[0].message);
  if (!dentroDeCartagena(r.data.lat, r.data.lng)) volver(ruta, 'error', 'Marca la ubicación dentro de Cartagena (haz clic en el mapa).');
  const desde = parsearDia(r.data.desde) ?? new Date();
  const hastaDia = parsearDia(r.data.hasta);
  // "hasta" incluye todo ese dia.
  const hasta = hastaDia ? new Date(hastaDia.getTime() + 86_400_000 - 1) : null;
  if (hasta && hasta < desde) volver(ruta, 'error', 'La fecha final no puede ser anterior a la inicial.');
  const valores = { tipo: r.data.tipo, titulo: r.data.titulo, descripcion: r.data.descripcion || null, lat: r.data.lat, lng: r.data.lng, desde, hasta, activa: r.data.activa };
  let nuevoId = id;
  if (id) await db.update(e.novedadesVia).set(valores).where(eq(e.novedadesVia.id, id));
  else nuevoId = (await db.insert(e.novedadesVia).values({ ...valores, creadoPor: u.id }).returning({ id: e.novedadesVia.id }))[0].id;
  await auditar(u.id, id ? 'editar' : 'crear', 'novedad_via', nuevoId, { tipo: valores.tipo, titulo: valores.titulo });
  revalidatePath('/consola/novedades');
  revalidatePath('/mapa');
  volver('/consola/novedades', 'ok', id ? 'Novedad actualizada.' : 'Novedad publicada.');
}

export async function alternarNovedad(datos: FormData) {
  const u = await exigirRol(PERMISOS.operar);
  const id = Number(datos.get('id'));
  const activa = datos.get('activa') === '1';
  if (!id) return;
  await db.update(e.novedadesVia).set({ activa }).where(eq(e.novedadesVia.id, id));
  await auditar(u.id, activa ? 'activar' : 'finalizar', 'novedad_via', id);
  revalidatePath('/consola/novedades');
  revalidatePath('/mapa');
}

export async function eliminarNovedad(datos: FormData) {
  const u = await exigirRol(PERMISOS.operar);
  const id = Number(datos.get('id'));
  if (!id) return;
  await db.delete(e.novedadesVia).where(eq(e.novedadesVia.id, id));
  await auditar(u.id, 'eliminar', 'novedad_via', id);
  revalidatePath('/consola/novedades');
  revalidatePath('/mapa');
  volver('/consola/novedades', 'ok', 'Novedad eliminada.');
}
