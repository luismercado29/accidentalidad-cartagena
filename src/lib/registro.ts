import 'server-only';

import { randomInt } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { db, esquema } from '@/db';
import { partesLocales } from '@/lib/tiempo';

/** Deja constancia de una accion del equipo. Nunca rompe la accion principal si falla. */
export async function auditar(usuarioId: number | null, accion: string, entidad: string, entidadId?: string | number | null, detalle: Record<string, unknown> = {}) {
  try {
    await db.insert(esquema.auditoria).values({ usuarioId, accion, entidad, entidadId: entidadId == null ? null : String(entidadId), detalle });
  } catch (e) {
    console.error('[auditoria]', e);
  }
}

/** Aviso para todo el equipo (usuarioId null) o para una persona. */
export async function notificar(n: { titulo: string; mensaje: string; tipo?: 'info' | 'alerta' | 'reporte' | 'incidente' | 'sistema'; enlace?: string; usuarioId?: number | null }) {
  await db.insert(esquema.notificaciones).values({ titulo: n.titulo, mensaje: n.mensaje, tipo: n.tipo ?? 'info', enlace: n.enlace, usuarioId: n.usuarioId ?? null });
}

/** Codigo legible y consecutivo por año: SV-2026-000123, IN-2026-00045. */
export async function siguienteCodigo(prefijo: 'SV' | 'IN', fecha = new Date()) {
  const anio = partesLocales(fecha).anio;
  const tabla = prefijo === 'SV' ? esquema.siniestros : esquema.incidentes;
  const base = `${prefijo}-${anio}-`;
  const [fila] = await db
    .select({ max: sql<string | null>`max(${tabla.codigo})` })
    .from(tabla)
    // Solo codigos consecutivos numericos (los de demostracion, p. ej. IN-2026-D00001, no cuentan).
    .where(sql`${tabla.codigo} ~ ${`^${base}[0-9]+$`}`);
  const n = fila?.max ? Number(fila.max.slice(base.length)) + 1 : 1;
  return `${base}${String(n).padStart(prefijo === 'SV' ? 6 : 5, '0')}`;
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I: se dictan por telefono sin confusiones

/** Codigo de seguimiento para el ciudadano: RV-7KQ2-M9 */
export function codigoSeguimiento() {
  const parte = (n: number) => Array.from({ length: n }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return `RV-${parte(4)}-${parte(2)}`;
}
