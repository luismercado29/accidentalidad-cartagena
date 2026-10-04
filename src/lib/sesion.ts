import 'server-only';

import { eq } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { db, esquema } from '@/db';
import { ROLES_EQUIPO, type Rol } from '@/db/esquema';

const COOKIE = 'vial_sesion';
const DURACION_S = 60 * 60 * 12; // un turno largo

function secreto() {
  const valor = process.env.AUTH_SECRET ?? process.env.SECRET_KEY;
  if (!valor) {
    if (process.env.NODE_ENV === 'production') throw new Error('AUTH_SECRET no esta configurado: las sesiones no se pueden firmar.');
    return new TextEncoder().encode('solo-para-desarrollo-local-no-usar-en-produccion');
  }
  return new TextEncoder().encode(valor);
}

export async function iniciarSesion(usuarioId: number) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(usuarioId))
    .setIssuedAt()
    .setExpirationTime(`${DURACION_S}s`)
    .sign(secreto());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_S,
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
}

async function idDeSesion(): Promise<number | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ['HS256'] });
    const id = Number(payload.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export type UsuarioSesion = Pick<typeof esquema.usuarios.$inferSelect, 'id' | 'nombre' | 'usuario' | 'email' | 'rol' | 'accesibilidad'>;

/** Usuario de la peticion actual (una consulta por peticion gracias a cache()). */
export const usuarioActual = cache(async (): Promise<UsuarioSesion | null> => {
  const id = await idDeSesion();
  if (id == null) return null;
  const u = await db.query.usuarios.findFirst({
    where: eq(esquema.usuarios.id, id),
    columns: { id: true, nombre: true, usuario: true, email: true, rol: true, accesibilidad: true, activo: true },
  });
  if (!u || !u.activo) return null;
  const { activo: _, ...resto } = u;
  return resto;
});

export const esEquipo = (u: UsuarioSesion | null) => !!u && ROLES_EQUIPO.includes(u.rol);

export async function requerirUsuario(siguiente?: string) {
  const u = await usuarioActual();
  if (!u) redirect(`/ingresar${siguiente ? `?siguiente=${encodeURIComponent(siguiente)}` : ''}`);
  return u;
}

/**
 * Exige un rol del equipo. Sin `roles`, basta con pertenecer al equipo.
 * El admin siempre puede todo.
 */
export async function requerirRol(roles: Rol[] = ROLES_EQUIPO, siguiente = '/consola') {
  const u = await requerirUsuario(siguiente);
  if (u.rol !== 'admin' && !roles.includes(u.rol)) redirect(esEquipo(u) ? '/consola?aviso=sin-permiso' : '/?aviso=sin-permiso');
  return u;
}

/** Para Server Actions y rutas API: no redirige, lanza. */
export async function exigirRol(roles: Rol[] = ROLES_EQUIPO) {
  const u = await usuarioActual();
  if (!u || (u.rol !== 'admin' && !roles.includes(u.rol))) throw new Error('No autorizado');
  return u;
}

/** Solo acepta destinos internos (evita redirecciones abiertas tras el ingreso). */
export function destinoSeguro(valor: unknown, porDefecto = '/') {
  return typeof valor === 'string' && valor.startsWith('/') && !valor.startsWith('//') ? valor : porDefecto;
}

/** Que puede hacer cada rol (la consola oculta lo que no aplica). */
export const PERMISOS = {
  operar: ['admin', 'supervisor', 'operador'] as Rol[], // incidentes, reportes, turno
  analizar: ['admin', 'supervisor', 'analista'] as Rol[], // analitica y registro
  registrar: ['admin', 'supervisor', 'operador', 'analista'] as Rol[], // crear/editar siniestros
  configurar: ['admin', 'supervisor'] as Rol[], // zonas, geocercas, camaras, fuentes, QR
  administrar: ['admin'] as Rol[], // usuarios, auditoria, datos de demostracion
};

export const puede = (u: UsuarioSesion | null, permiso: keyof typeof PERMISOS) => !!u && (u.rol === 'admin' || PERMISOS[permiso].includes(u.rol));
