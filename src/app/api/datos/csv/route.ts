import { sql } from 'drizzle-orm';

import { db, esquema as e } from '@/db';
import { condicionesSiniestros } from '@/lib/consultas';
import { diaISO, resolverPeriodo } from '@/lib/tiempo';

export const dynamic = 'force-dynamic';

/** Escapa un campo CSV y neutraliza formulas (=, +, -, @) al abrirlo en hojas de calculo. */
function campo(v: string | number) {
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Datos abiertos agregados: conteos por dia, barrio y gravedad en el periodo pedido.
 * Sin coordenadas exactas, descripciones ni datos de quienes reportan.
 */
export async function GET(req: Request) {
  const periodo = resolverPeriodo(new URL(req.url).searchParams, 'anio');
  const dia = sql<string>`to_char(${e.siniestros.ocurridoEn} at time zone 'America/Bogota', 'YYYY-MM-DD')`;
  const barrio = sql<string>`coalesce(${e.siniestros.barrio}, 'Sin dato')`;
  const filas = await db
    .select({
      dia, barrio, gravedad: e.siniestros.gravedad,
      siniestros: sql<number>`count(*)::int`,
      heridos: sql<number>`coalesce(sum(${e.siniestros.heridos}),0)::int`,
      fallecidos: sql<number>`coalesce(sum(${e.siniestros.fallecidos}),0)::int`,
    })
    .from(e.siniestros)
    .where(condicionesSiniestros({ periodo }))
    .groupBy(dia, barrio, e.siniestros.gravedad)
    .orderBy(dia, barrio)
    .limit(200_000);

  const lineas = ['fecha,barrio,gravedad,siniestros,heridos,fallecidos',
    ...filas.map((f) => [f.dia, f.barrio, f.gravedad, f.siniestros, f.heridos, f.fallecidos].map(campo).join(','))];
  const nombre = `siniestralidad-cartagena_${periodo.desde ? diaISO(periodo.desde) : 'inicio'}_${diaISO(new Date(periodo.hasta.getTime() - 1))}.csv`;
  return new Response(`﻿${lineas.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'public, max-age=300',
    },
  });
}
