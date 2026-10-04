import { NextResponse } from 'next/server';
import { z } from 'zod';

import { responder } from '@/lib/asistente';
import { bloqueado, sumarIntento } from '@/lib/limites';
import { esEquipo, usuarioActual } from '@/lib/sesion';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const cuerpo = z.object({
  mensajes: z.array(z.object({
    rol: z.enum(['usuario', 'asistente']),
    texto: z.string().trim().min(1).max(1000),
  })).min(1).max(10),
});

/** Asistente: no guarda conversaciones; el historial viaja en cada peticion. */
export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  const equipo = esEquipo(await usuarioActual());
  // Limite por IP: 20 preguntas cada 10 minutos (60 para el equipo).
  const clave = `asistente:${ip}`;
  if (bloqueado(clave, equipo ? 60 : 20)) {
    return NextResponse.json({ error: 'Hiciste muchas preguntas seguidas. Espera unos minutos e inténtalo de nuevo.' }, { status: 429 });
  }
  sumarIntento(clave, 10 * 60_000);

  let datos: z.infer<typeof cuerpo>;
  try {
    const r = cuerpo.safeParse(await req.json());
    if (!r.success) return NextResponse.json({ error: 'Mensaje inválido: máximo 10 mensajes de 1.000 caracteres.' }, { status: 400 });
    datos = r.data;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  if (datos.mensajes.at(-1)!.rol !== 'usuario') return NextResponse.json({ error: 'El último mensaje debe ser una pregunta.' }, { status: 400 });

  try {
    return NextResponse.json(await responder(datos.mensajes));
  } catch (err) {
    console.error('[asistente]', err);
    return NextResponse.json({ error: 'No pude consultar los datos en este momento. Inténtalo de nuevo.' }, { status: 500 });
  }
}
