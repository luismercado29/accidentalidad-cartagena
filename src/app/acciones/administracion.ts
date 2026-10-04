'use server';

import { randomInt } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { and, count, eq, inArray, like, ne, or, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db, esquema as e } from '@/db';
import { ROLES } from '@/db/esquema';
import { auditar } from '@/lib/registro';
import { exigirRol, PERMISOS } from '@/lib/sesion';

export type EstadoClave = { error?: string; errores?: Record<string, string>; clave?: string; usuario?: string; valores?: Record<string, string> };

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
/** Contraseña temporal fuerte (16 caracteres, ~92 bits) sin caracteres confusos. */
function claveTemporal() {
  const base = Array.from({ length: 16 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return `${base.slice(0, 4)}-${base.slice(4, 8)}-${base.slice(8, 12)}-${base.slice(12)}`;
}

const esquemaUsuario = z.object({
  usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Usuario: 3 a 40 caracteres (letras, números, punto, guion).'),
  nombre: z.string().trim().min(2, 'Escribe el nombre completo.').max(80),
  email: z.string().trim().toLowerCase().email('Escribe un correo válido.'),
  rol: z.enum(ROLES),
});

export async function crearUsuario(_: EstadoClave, datos: FormData): Promise<EstadoClave> {
  const admin = await exigirRol(PERMISOS.administrar);
  const valores = { usuario: String(datos.get('usuario') ?? ''), nombre: String(datos.get('nombre') ?? ''), email: String(datos.get('email') ?? ''), rol: String(datos.get('rol') ?? 'operador') };
  const r = esquemaUsuario.safeParse(valores);
  if (!r.success) {
    const errores: Record<string, string> = {};
    for (const i of r.error.issues) errores[String(i.path[0])] ??= i.message;
    return { errores, valores };
  }
  const existe = await db.query.usuarios.findFirst({
    where: or(eq(sql`lower(${e.usuarios.usuario})`, r.data.usuario), eq(sql`lower(${e.usuarios.email})`, r.data.email)),
    columns: { usuario: true },
  });
  if (existe) return { errores: existe.usuario.toLowerCase() === r.data.usuario ? { usuario: 'Ese usuario ya existe.' } : { email: 'Ese correo ya está registrado.' }, valores };
  const clave = claveTemporal();
  const [nuevo] = await db.insert(e.usuarios).values({ ...r.data, hashClave: await bcrypt.hash(clave, 12) }).returning({ id: e.usuarios.id });
  await auditar(admin.id, 'crear', 'usuario', nuevo.id, { usuario: r.data.usuario, rol: r.data.rol });
  revalidatePath('/consola/usuarios');
  return { clave, usuario: r.data.usuario };
}

export async function restablecerClave(_: EstadoClave, datos: FormData): Promise<EstadoClave> {
  const admin = await exigirRol(PERMISOS.administrar);
  const id = Number(datos.get('id'));
  const u = await db.query.usuarios.findFirst({ where: eq(e.usuarios.id, id), columns: { id: true, usuario: true } });
  if (!u) return { error: 'La cuenta no existe.' };
  const clave = claveTemporal();
  await db.update(e.usuarios).set({ hashClave: await bcrypt.hash(clave, 12) }).where(eq(e.usuarios.id, id));
  await auditar(admin.id, 'restablecer_clave', 'usuario', id, { usuario: u.usuario });
  return { clave, usuario: u.usuario };
}

async function adminsActivos(excepto: number) {
  const [r] = await db.select({ n: count() }).from(e.usuarios).where(and(eq(e.usuarios.rol, 'admin'), eq(e.usuarios.activo, true), ne(e.usuarios.id, excepto)));
  return r.n;
}

function volver(tipo: 'ok' | 'error', mensaje: string): never {
  redirect(`/consola/usuarios?${tipo}=${encodeURIComponent(mensaje)}`);
}

export async function cambiarRol(datos: FormData) {
  const admin = await exigirRol(PERMISOS.administrar);
  const id = Number(datos.get('id'));
  const rol = z.enum(ROLES).safeParse(datos.get('rol'));
  if (!id || !rol.success) volver('error', 'Rol inválido.');
  const u = await db.query.usuarios.findFirst({ where: eq(e.usuarios.id, id) });
  if (!u) volver('error', 'La cuenta no existe.');
  if (u.rol === 'admin' && rol.data !== 'admin' && (await adminsActivos(id)) === 0) volver('error', 'No puedes quitar el rol al último administrador activo.');
  if (id === admin.id && rol.data !== 'admin') volver('error', 'No puedes quitarte tu propio rol de administración.');
  await db.update(e.usuarios).set({ rol: rol.data }).where(eq(e.usuarios.id, id));
  await auditar(admin.id, 'cambiar_rol', 'usuario', id, { de: u.rol, a: rol.data });
  revalidatePath('/consola/usuarios');
  volver('ok', `Rol de ${u.usuario} actualizado.`);
}

export async function alternarActivo(datos: FormData) {
  const admin = await exigirRol(PERMISOS.administrar);
  const id = Number(datos.get('id'));
  const activo = datos.get('activo') === '1';
  const u = await db.query.usuarios.findFirst({ where: eq(e.usuarios.id, id) });
  if (!u) volver('error', 'La cuenta no existe.');
  if (!activo && id === admin.id) volver('error', 'No puedes desactivar tu propia cuenta.');
  if (!activo && u.rol === 'admin' && (await adminsActivos(id)) === 0) volver('error', 'No puedes desactivar al último administrador activo.');
  await db.update(e.usuarios).set({ activo }).where(eq(e.usuarios.id, id));
  await auditar(admin.id, activo ? 'activar' : 'desactivar', 'usuario', id, { usuario: u.usuario });
  revalidatePath('/consola/usuarios');
  volver('ok', `Cuenta ${u.usuario} ${activo ? 'activada' : 'desactivada'}.`);
}

// ─── Ajustes del sistema ────────────────────────────────────────────────────

function volverAjustes(tipo: 'ok' | 'error', mensaje: string): never {
  redirect(`/consola/ajustes?${tipo}=${encodeURIComponent(mensaje)}`);
}

export async function cambiarModoDemo(datos: FormData) {
  const admin = await exigirRol(PERMISOS.administrar);
  const activo = datos.get('activo') === '1';
  await db.insert(e.ajustes).values({ clave: 'demo', valor: { activo } })
    .onConflictDoUpdate({ target: e.ajustes.clave, set: { valor: { activo }, actualizado: new Date() } });
  await auditar(admin.id, activo ? 'activar' : 'desactivar', 'modo_demo', null);
  revalidatePath('/consola/ajustes');
  volverAjustes('ok', activo ? 'Modo demostración activado: la simulación en vivo vuelve a generar actividad.' : 'Modo demostración desactivado: ya no se generan eventos simulados.');
}

const FRASE = 'BORRAR DATOS SIMULADOS';

/** Borra todo lo simulado. Los datos reales (manuales, ciudadanos, importados, legado) no se tocan. */
export async function borrarSimulados(datos: FormData) {
  const admin = await exigirRol(PERMISOS.administrar);
  if (String(datos.get('confirmacion') ?? '').trim().toUpperCase() !== FRASE) volverAjustes('error', `Para confirmar escribe exactamente: ${FRASE}`);

  const resultado = await db.transaction(async (tx) => {
    const sinSim = tx.select({ id: e.siniestros.id }).from(e.siniestros).where(eq(e.siniestros.fuente, 'simulado'));
    const incSim = tx.select({ id: e.incidentes.id }).from(e.incidentes).where(eq(e.incidentes.simulado, true));
    // Reportes de demostracion: los sembrados (RV-D…) y los ligados a incidentes o siniestros simulados.
    const reportes = await tx.delete(e.reportes).where(or(
      like(e.reportes.codigo, 'RV-D%'),
      inArray(e.reportes.incidenteId, incSim),
      inArray(e.reportes.siniestroId, sinSim),
    )).returning({ id: e.reportes.id });
    // Las unidades asignadas a incidentes simulados quedan disponibles.
    await tx.update(e.unidades).set({ estado: 'disponible' })
      .where(and(eq(e.unidades.estado, 'asignada'), inArray(e.unidades.id, tx.select({ id: e.incidenteUnidades.unidadId }).from(e.incidenteUnidades).where(inArray(e.incidenteUnidades.incidenteId, incSim)))));
    const incidentes = await tx.delete(e.incidentes).where(eq(e.incidentes.simulado, true)).returning({ id: e.incidentes.id });
    const siniestros = await tx.delete(e.siniestros).where(eq(e.siniestros.fuente, 'simulado')).returning({ id: e.siniestros.id });
    // Puntos negros calculados con datos simulados: se recalculan desde Puntos negros.
    await tx.delete(e.puntosNegros);
    await tx.insert(e.ajustes).values({ clave: 'demo', valor: { activo: false } })
      .onConflictDoUpdate({ target: e.ajustes.clave, set: { valor: { activo: false }, actualizado: new Date() } });
    return { reportes: reportes.length, incidentes: incidentes.length, siniestros: siniestros.length };
  });

  await auditar(admin.id, 'eliminar', 'datos_simulados', null, resultado);
  revalidatePath('/consola', 'layout');
  volverAjustes('ok', `Se borraron ${resultado.siniestros} siniestros, ${resultado.incidentes} incidentes y ${resultado.reportes} reportes simulados. El modo demostración quedó desactivado; recalcula los puntos negros.`);
}
