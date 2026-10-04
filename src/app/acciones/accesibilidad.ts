'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { db, esquema } from '@/db';
import { COOKIE_ACCESIBILIDAD, normalizarPreferencias } from '@/lib/accesibilidad';
import { usuarioActual } from '@/lib/sesion';

/** Guarda los ajustes en una cookie (sirve sin cuenta) y, si hay sesion, en el perfil. */
export async function guardarAccesibilidad(valor: unknown) {
  const preferencias = normalizarPreferencias(valor);
  (await cookies()).set(COOKIE_ACCESIBILIDAD, JSON.stringify(preferencias), {
    path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
  });
  const usuario = await usuarioActual();
  if (usuario) await db.update(esquema.usuarios).set({ accesibilidad: preferencias }).where(eq(esquema.usuarios.id, usuario.id));
  revalidatePath('/', 'layout');
  return preferencias;
}
