'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import type { EstadoFormulario } from '@/app/acciones/cuenta';
import { db, esquema as e } from '@/db';
import { clasificar } from '@/lib/analitica/clasificador';
import { leerTodas, urlPermitida, type ResultadoLectura } from '@/lib/fuentes';
import { CENTRO } from '@/lib/geo';
import { auditar, codigoSeguimiento } from '@/lib/registro';
import { exigirRol, PERMISOS } from '@/lib/sesion';
import { fechaLocal } from '@/lib/tiempo';

const RUTA = '/consola/fuentes';

export type EstadoLectura = { resultados?: ResultadoLectura[]; error?: string };

export async function leerFuentesAhora(_: EstadoLectura): Promise<EstadoLectura> {
  const u = await exigirRol(PERMISOS.operar);
  try {
    const resultados = await leerTodas();
    await auditar(u.id, 'leer_fuentes', 'fuentes', null, { origen: 'manual', resultados });
    revalidatePath(RUTA);
    return { resultados };
  } catch (err) {
    console.error('[fuentes]', err);
    return { error: 'No se pudieron leer las fuentes. Inténtalo de nuevo en unos minutos.' };
  }
}

const REDES = ['facebook', 'instagram', 'x', 'tiktok', 'prensa', 'otra'] as const;

const esquemaPublicacion = z.object({
  red: z.enum(REDES, { message: 'Elige la red o el medio.' }),
  url: z.string().trim().url('Pega el enlace completo de la publicación (https://…).').max(1000)
    .refine((u) => u.startsWith('https://'), 'El enlace debe empezar por https://'),
  texto: z.string().trim().min(10, 'Pega el texto de la publicación (al menos 10 caracteres).').max(3000),
  fecha: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Fecha inválida.'),
});

/** Alta manual de una publicacion de redes o de prensa: se clasifica igual que las del RSS. */
export async function agregarPublicacion(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const u = await exigirRol(PERMISOS.operar);
  const valores = { red: String(datos.get('red') ?? ''), url: String(datos.get('url') ?? ''), texto: String(datos.get('texto') ?? ''), fecha: String(datos.get('fecha') ?? '') };
  const r = esquemaPublicacion.safeParse(valores);
  if (!r.success) {
    const errores: Record<string, string> = {};
    for (const i of r.error.issues) errores[String(i.path[0])] ??= i.message;
    return { error: 'Revisa los campos marcados.', errores, valores };
  }
  const { red, url, texto, fecha } = r.data;
  const titulo = texto.split(/\n|(?<=[.!?])\s/)[0].slice(0, 200);
  const c = clasificar(titulo, texto);
  let publicadoEn = new Date();
  if (fecha) {
    const [a, m, d] = fecha.split('-').map(Number);
    const f = fechaLocal(a, m - 1, d, 12);
    if (!Number.isNaN(f.getTime()) && f.getTime() <= Date.now()) publicadoEn = f;
  }
  const manual = await db.query.fuentes.findFirst({ where: eq(e.fuentes.tipo, 'manual') });
  const [n] = await db.insert(e.noticias).values({
    fuenteId: manual?.id ?? null, red, titulo, url, resumen: texto, publicadoEn,
    barrio: c.barrio?.nombre ?? null, lat: c.barrio?.lat ?? null, lng: c.barrio?.lng ?? null,
    gravedadDetectada: c.gravedad, relevancia: c.relevancia,
  }).onConflictDoNothing().returning({ id: e.noticias.id });
  if (!n) return { error: 'Esa publicación ya estaba registrada.', errores: { url: 'Este enlace ya existe en la lista.' }, valores };
  await auditar(u.id, 'crear', 'noticia', n.id, { red, url, relevancia: c.relevancia });
  revalidatePath(RUTA);
  return { ok: `Publicación agregada. Relevancia ${c.relevancia}/100${c.barrio ? ` · ${c.barrio.nombre}` : ''}${c.gravedad ? ` · gravedad estimada: ${c.gravedad.replace('_', ' ')}` : ''}.` };
}

async function noticiaDe(datos: FormData) {
  const id = Number(datos.get('id'));
  if (!Number.isInteger(id) || id < 1) return null;
  return (await db.query.noticias.findFirst({ where: eq(e.noticias.id, id) })) ?? null;
}

/** Crea un reporte ciudadano (canal externo) a partir de la noticia, para que siga el flujo normal de revision. */
export async function convertirEnReporte(datos: FormData) {
  const u = await exigirRol(PERMISOS.operar);
  const n = await noticiaDe(datos);
  if (!n || n.estado === 'convertida') return;
  const [rep] = await db.insert(e.reportes).values({
    codigo: codigoSeguimiento(), lat: n.lat ?? CENTRO[0], lng: n.lng ?? CENTRO[1], barrio: n.barrio,
    descripcion: `${n.titulo}${n.resumen && n.resumen !== n.titulo ? `\n\n${n.resumen}` : ''}\n\nFuente: ${n.url}`.slice(0, 3000),
    gravedadEstimada: n.gravedadDetectada ?? 'leve', hayHeridos: n.gravedadDetectada === 'leve' || n.gravedadDetectada === 'grave',
    canal: 'externo', creado: n.publicadoEn,
    direccion: n.lat == null ? 'Ubicación aproximada: revisar (la noticia no menciona un barrio reconocible)' : null,
  }).returning({ id: e.reportes.id, codigo: e.reportes.codigo });
  await db.update(e.noticias).set({ estado: 'convertida' }).where(eq(e.noticias.id, n.id));
  await auditar(u.id, 'convertir', 'noticia', n.id, { reporte: rep.codigo });
  revalidatePath(RUTA);
  revalidatePath('/consola/reportes');
  redirect(`/consola/reportes?id=${rep.id}`);
}

/** Vincula la noticia a un siniestro ya registrado (por su codigo). */
export async function vincularNoticia(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const u = await exigirRol(PERMISOS.operar);
  const n = await noticiaDe(datos);
  const codigo = String(datos.get('codigo') ?? '').trim().toUpperCase().slice(0, 30);
  if (!n) return { error: 'La noticia ya no existe.' };
  if (!codigo) return { error: 'Escribe el código del siniestro.', errores: { codigo: 'Escribe el código, por ejemplo SV-2026-000123.' } };
  const s = await db.query.siniestros.findFirst({ where: eq(sql`upper(${e.siniestros.codigo})`, codigo), columns: { id: true, codigo: true } });
  if (!s) return { error: `No existe el siniestro ${codigo}.`, errores: { codigo: 'No encontramos ese código.' }, valores: { codigo } };
  await db.update(e.noticias).set({ estado: 'vinculada', siniestroId: s.id }).where(eq(e.noticias.id, n.id));
  await auditar(u.id, 'vincular', 'noticia', n.id, { siniestro: s.codigo });
  revalidatePath(RUTA);
  return { ok: `Vinculada a ${s.codigo}.` };
}

export async function descartarNoticia(datos: FormData) {
  const u = await exigirRol(PERMISOS.operar);
  const n = await noticiaDe(datos);
  if (!n) return;
  const nuevo = n.estado === 'descartada' ? 'nueva' : 'descartada';
  await db.update(e.noticias).set({ estado: nuevo }).where(eq(e.noticias.id, n.id));
  await auditar(u.id, nuevo === 'descartada' ? 'descartar' : 'restaurar', 'noticia', n.id);
  revalidatePath(RUTA);
}

// ─── Gestion de fuentes RSS (configurar) ────────────────────────────────────

export async function guardarFuente(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const u = await exigirRol(PERMISOS.configurar);
  const nombre = String(datos.get('nombre') ?? '').trim().slice(0, 120);
  const url = String(datos.get('url') ?? '').trim().slice(0, 1000);
  const errores: Record<string, string> = {};
  if (nombre.length < 3) errores.nombre = 'Escribe un nombre (mínimo 3 letras).';
  if (!urlPermitida(url)) errores.url = 'Usa una dirección https pública del canal RSS o Atom.';
  if (Object.keys(errores).length) return { error: 'Revisa los campos marcados.', errores, valores: { nombre, url } };
  const ya = await db.query.fuentes.findFirst({ where: and(eq(e.fuentes.tipo, 'rss'), eq(e.fuentes.url, url)) });
  if (ya) return { error: 'Esa fuente ya existe.', errores: { url: 'Ya está registrada.' }, valores: { nombre, url } };
  const [f] = await db.insert(e.fuentes).values({ nombre, url, tipo: 'rss' }).returning({ id: e.fuentes.id });
  await auditar(u.id, 'crear', 'fuente', f.id, { nombre, url });
  revalidatePath(RUTA);
  return { ok: `Fuente «${nombre}» agregada. Se leerá en la próxima lectura.` };
}

export async function alternarFuente(datos: FormData) {
  const u = await exigirRol(PERMISOS.configurar);
  const id = Number(datos.get('id'));
  const f = Number.isInteger(id) ? await db.query.fuentes.findFirst({ where: eq(e.fuentes.id, id) }) : null;
  if (!f) return;
  await db.update(e.fuentes).set({ activa: !f.activa }).where(eq(e.fuentes.id, id));
  await auditar(u.id, f.activa ? 'desactivar' : 'activar', 'fuente', id, { nombre: f.nombre });
  revalidatePath(RUTA);
}

export async function eliminarFuente(datos: FormData) {
  const u = await exigirRol(PERMISOS.configurar);
  const id = Number(datos.get('id'));
  const f = Number.isInteger(id) ? await db.query.fuentes.findFirst({ where: eq(e.fuentes.id, id) }) : null;
  if (!f || f.tipo !== 'rss') return; // los canales manual y WhatsApp son del sistema
  await db.delete(e.fuentes).where(eq(e.fuentes.id, id));
  await auditar(u.id, 'eliminar', 'fuente', id, { nombre: f.nombre, url: f.url });
  revalidatePath(RUTA);
}
