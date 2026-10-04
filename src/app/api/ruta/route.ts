import { and, between, eq, gte } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db, esquema as e } from '@/db';
import { evaluarRuta, lineaBase, nivelIndice, type LineaBase, type SiniestroRuta } from '@/lib/analitica/ruta';
import { dentroDeCartagena } from '@/lib/geo';
import { bloqueado, sumarIntento } from '@/lib/limites';

/**
 * Ruta segura: pide alternativas al enrutador (Mapbox si hay token, si no el
 * OSRM publico) y las ordena por riesgo usando el historico verificado de los
 * ultimos 3 años (evaluarRuta). Devuelve tramos ya agrupados por nivel.
 */
export const dynamic = 'force-dynamic';

const punto = z.tuple([z.number().finite(), z.number().finite()]).refine(([lat, lng]) => dentroDeCartagena(lat, lng), 'El punto debe estar dentro de Cartagena.');
const entrada = z.object({
  origen: punto,
  destino: punto,
  salida: z.string().datetime({ offset: true }).optional(),
  modo: z.enum(['auto', 'moto']).default('auto'),
});

type Alternativa = { coords: [number, number][]; distanciaM: number; duracionS: number };

async function alternativas(o: [number, number], d: [number, number]): Promise<{ lista: Alternativa[]; proveedor: string }> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const par = `${o[1]},${o[0]};${d[1]},${d[0]}`;
  if (token) {
    try {
      const r = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${par}?alternatives=true&geometries=geojson&overview=full&language=es&access_token=${token}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const j = await r.json() as { routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] };
        if (j.routes?.length) return { proveedor: 'Mapbox', lista: j.routes.map((x) => ({ coords: x.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), distanciaM: x.distance, duracionS: x.duration })) };
      }
    } catch (err) { console.error('[ruta:mapbox]', err); }
  }
  const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${par}?alternatives=3&overview=full&geometries=geojson`, {
    signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'PulsoVial/2.0 (proyecto de portafolio)' },
  });
  if (!r.ok) throw new Error(`OSRM ${r.status}`);
  const j = await r.json() as { code: string; routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] };
  if (j.code !== 'Ok' || !j.routes?.length) throw new Error(`OSRM ${j.code}`);
  return { proveedor: 'OSRM (OpenStreetMap)', lista: j.routes.map((x) => ({ coords: x.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), distanciaM: x.distance, duracionS: x.duration })) };
}

/** Agrupa tramos consecutivos del mismo nivel en una sola polilinea (respuesta mas liviana). */
function agrupar(tramos: ReturnType<typeof evaluarRuta>['tramos']) {
  const res: { nivel: 'bajo' | 'medio' | 'alto'; coords: [number, number][] }[] = [];
  for (const t of tramos) {
    const ultimo = res[res.length - 1];
    if (ultimo && ultimo.nivel === t.nivel) ultimo.coords.push(t.hasta);
    else res.push({ nivel: t.nivel, coords: [t.desde, t.hasta] });
  }
  return res;
}

// Linea base de toda la ciudad (cambia lento): se recalcula cada 10 minutos por proceso.
let cacheBase: { base: LineaBase; hora: number; hasta: number } | null = null;
async function baseCiudad(salida: Date) {
  const hora = salida.getHours();
  if (cacheBase && cacheBase.hasta > Date.now() && cacheBase.hora === hora) return cacheBase.base;
  const filas = await db.select({ gravedad: e.siniestros.gravedad, ocurridoEn: e.siniestros.ocurridoEn }).from(e.siniestros)
    .where(and(eq(e.siniestros.estado, 'verificado'), gte(e.siniestros.ocurridoEn, new Date(salida.getTime() - 3 * 365 * 86_400_000))));
  const base = lineaBase(filas, salida);
  cacheBase = { base, hora, hasta: Date.now() + 10 * 60_000 };
  return base;
}

export async function POST(req: Request) {
  const ip = ((await headers()).get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (bloqueado(`ruta:${ip}`, 20)) return NextResponse.json({ error: 'Demasiadas consultas seguidas. Espera un minuto e inténtalo de nuevo.' }, { status: 429 });
  sumarIntento(`ruta:${ip}`, 60_000);

  let cuerpo: unknown;
  try { cuerpo = await req.json(); } catch { return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 }); }
  const p = entrada.safeParse(cuerpo);
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
  const { origen, destino, modo } = p.data;
  const salida = p.data.salida ? new Date(p.data.salida) : new Date();

  let resultado: Awaited<ReturnType<typeof alternativas>>;
  try {
    resultado = await alternativas(origen, destino);
  } catch (err) {
    console.error('[ruta]', err);
    return NextResponse.json({ error: 'El servicio de rutas no respondió. Intenta de nuevo en unos segundos; mientras tanto, el mapa de calor muestra las zonas a evitar.' }, { status: 502 });
  }

  // Historico verificado de 3 años dentro de la caja de todas las alternativas.
  const todos = resultado.lista.flatMap((a) => a.coords);
  const lats = todos.map((c) => c[0]), lngs = todos.map((c) => c[1]);
  const m = 0.003;
  const filas = await db.select({ lat: e.siniestros.lat, lng: e.siniestros.lng, gravedad: e.siniestros.gravedad, ocurridoEn: e.siniestros.ocurridoEn, barrio: e.siniestros.barrio, vehiculos: e.siniestros.vehiculos })
    .from(e.siniestros)
    .where(and(
      eq(e.siniestros.estado, 'verificado'),
      gte(e.siniestros.ocurridoEn, new Date(salida.getTime() - 3 * 365 * 86_400_000)),
      between(e.siniestros.lat, Math.min(...lats) - m, Math.max(...lats) + m),
      between(e.siniestros.lng, Math.min(...lngs) - m, Math.max(...lngs) + m),
    ));
  const historico: SiniestroRuta[] = filas;
  const deMotos: SiniestroRuta[] = filas.filter((f) => f.vehiculos.includes('motocicleta'));

  const base = await baseCiudad(salida);
  const rutas = resultado.lista.map((a, i) => {
    const ev = evaluarRuta(a.coords, historico, salida, base);
    const motos = modo === 'moto' ? evaluarRuta(a.coords, deMotos, salida, base) : null;
    // En moto pesan mas los siniestros donde hubo motocicletas involucradas.
    const indice = Math.round((ev.indice + (motos ? motos.indice * 0.5 : 0)) * 10) / 10;
    return {
      id: i,
      distanciaM: Math.round(a.distanciaM),
      duracionS: Math.round(a.duracionS * (modo === 'moto' ? 0.92 : 1)),
      indice,
      nivel: nivelIndice(indice, base),
      siniestrosCerca: ev.siniestrosCerca,
      fatalesCerca: ev.fatalesCerca,
      motosCerca: motos?.siniestrosCerca ?? null,
      tramos: agrupar(ev.tramos),
      focos: ev.focos,
      coords: a.coords,
    };
  });

  const masRapida = [...rutas].sort((x, y) => x.duracionS - y.duracionS)[0];
  rutas.sort((x, y) => x.indice - y.indice || x.duracionS - y.duracionS);
  return NextResponse.json({
    proveedor: resultado.proveedor,
    salida: salida.toISOString(),
    modo,
    recomendada: rutas[0]?.id ?? null,
    masRapida: masRapida?.id ?? null,
    historico: historico.length,
    rutas,
  });
}
