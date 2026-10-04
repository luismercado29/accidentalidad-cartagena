'use server';

import bcrypt from 'bcryptjs';
import { eq, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { db, esquema } from '@/db';
import { ROLES_EQUIPO } from '@/db/esquema';
import { bloqueado, limpiarIntentos, sumarIntento } from '@/lib/limites';
import { auditar } from '@/lib/registro';
import { cerrarSesion, destinoSeguro, iniciarSesion, usuarioActual } from '@/lib/sesion';

export type EstadoFormulario = { error?: string; errores?: Record<string, string>; ok?: string; valores?: Record<string, string> };

async function ipCliente() {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
}

/** Hash de relleno: se compara aunque la cuenta no exista, para no revelar por el tiempo si existe. */
const HASH_FALSO = '$2b$12$5fhMcIe/kIPiYSMKjXPWYurgJMRwTLnoez.ESD0Kpad61tZ6bRJR6';

export async function ingresarAccion(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const identificador = String(datos.get('usuario') ?? '').trim().toLowerCase().slice(0, 120);
  const clave = String(datos.get('clave') ?? '').slice(0, 200);
  const valores = { usuario: identificador };
  const claves = [`ip:${await ipCliente()}`, `u:${identificador}`];
  if (bloqueado(claves[0], 20) || bloqueado(claves[1], 5)) {
    return { error: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.', valores };
  }
  const usuario = identificador
    ? await db.query.usuarios.findFirst({ where: or(eq(sql`lower(${esquema.usuarios.usuario})`, identificador), eq(sql`lower(${esquema.usuarios.email})`, identificador)) })
    : undefined;
  const valida = await bcrypt.compare(clave, usuario?.hashClave ?? HASH_FALSO);
  if (!usuario || !valida || !usuario.activo) {
    claves.forEach((c) => sumarIntento(c));
    return { error: usuario && valida && !usuario.activo ? 'Esta cuenta está desactivada. Pide a la administración que la reactive.' : 'Usuario o contraseña incorrectos.', valores };
  }
  limpiarIntentos(claves[1]);
  await iniciarSesion(usuario.id);
  await db.update(esquema.usuarios).set({ ultimoIngreso: new Date() }).where(eq(esquema.usuarios.id, usuario.id));
  await auditar(usuario.id, 'ingresar', 'sesion', usuario.id);
  const equipo = ROLES_EQUIPO.includes(usuario.rol);
  redirect(destinoSeguro(datos.get('siguiente'), equipo ? '/consola' : '/'));
}

export async function cerrarSesionAccion() {
  const u = await usuarioActual();
  if (u) await auditar(u.id, 'salir', 'sesion', u.id);
  await cerrarSesion();
  redirect('/');
}
