'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { db, esquema as e } from '@/db';
import { barrioMasCercano, dentroDeCartagena } from '@/lib/geo';
import { auditar } from '@/lib/registro';
import { exigirRol, PERMISOS } from '@/lib/sesion';

export type EstadoQr = { error?: string; errores?: Record<string, string>; ok?: string; valores?: Record<string, string> };

const esquemaPunto = z.object({
  codigo: z.string().trim().toUpperCase().regex(/^QR-[A-Z0-9]{2,12}$/, 'Usa el formato QR-XXX (letras y números, 2 a 12).'),
  nombre: z.string().trim().min(3, 'Escribe un nombre (mínimo 3 caracteres).').max(120),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function guardarPuntoQr(_: EstadoQr, datos: FormData): Promise<EstadoQr> {
  const u = await exigirRol(PERMISOS.configurar);
  const valores = Object.fromEntries(['id', 'codigo', 'nombre', 'lat', 'lng'].map((k) => [k, String(datos.get(k) ?? '')]));
  const r = esquemaPunto.safeParse(valores);
  const errores: Record<string, string> = {};
  if (!r.success) for (const i of r.error.issues) errores[String(i.path[0])] ??= i.path[0] === 'lat' || i.path[0] === 'lng' ? 'Escribe una coordenada válida.' : i.message;
  if (r.success && !dentroDeCartagena(r.data.lat, r.data.lng)) errores.lat = 'El punto debe estar dentro de Cartagena.';
  if (!r.success || Object.keys(errores).length) return { errores, valores };
  const id = Number(valores.id) || null;
  const otro = await db.query.puntosQr.findFirst({ where: eq(e.puntosQr.codigo, r.data.codigo), columns: { id: true } });
  if (otro && otro.id !== id) return { errores: { codigo: 'Ya existe un punto con ese código.' }, valores };
  const fila = { ...r.data, barrio: barrioMasCercano(r.data.lat, r.data.lng).nombre };
  if (id) {
    await db.update(e.puntosQr).set(fila).where(eq(e.puntosQr.id, id));
    await auditar(u.id, 'editar', 'punto_qr', id, fila);
  } else {
    const [n] = await db.insert(e.puntosQr).values(fila).returning({ id: e.puntosQr.id });
    await auditar(u.id, 'crear', 'punto_qr', n.id, fila);
  }
  revalidatePath('/consola/qr');
  return { ok: id ? 'Punto actualizado.' : `Punto ${r.data.codigo} creado.` };
}

export async function alternarPuntoQr(id: number) {
  const u = await exigirRol(PERMISOS.configurar);
  const p = await db.query.puntosQr.findFirst({ where: eq(e.puntosQr.id, id) });
  if (!p) return;
  await db.update(e.puntosQr).set({ activo: !p.activo }).where(eq(e.puntosQr.id, id));
  await auditar(u.id, p.activo ? 'desactivar' : 'activar', 'punto_qr', id);
  revalidatePath('/consola/qr');
}

/** Los reportes ya recibidos conservan su historia: la referencia al punto queda en blanco. */
export async function eliminarPuntoQr(id: number) {
  const u = await exigirRol(PERMISOS.configurar);
  const p = await db.query.puntosQr.findFirst({ where: eq(e.puntosQr.id, id), columns: { codigo: true } });
  if (!p) return;
  await db.delete(e.puntosQr).where(eq(e.puntosQr.id, id));
  await auditar(u.id, 'eliminar', 'punto_qr', id, { codigo: p.codigo });
  revalidatePath('/consola/qr');
}
