import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { leerTodas } from '@/lib/fuentes';
import { auditar } from '@/lib/registro';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Lectura programada de fuentes RSS (Vercel Cron envia Authorization: Bearer $CRON_SECRET). */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return NextResponse.json({ error: 'CRON_SECRET no está configurado.' }, { status: 503 });
  const recibido = Buffer.from(req.headers.get('authorization') ?? '');
  const esperado = Buffer.from(`Bearer ${secreto}`);
  if (recibido.length !== esperado.length || !timingSafeEqual(recibido, esperado)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const resultados = await leerTodas();
  await auditar(null, 'leer_fuentes', 'fuentes', null, { origen: 'cron', resultados });
  return NextResponse.json({ ok: true, resultados });
}
