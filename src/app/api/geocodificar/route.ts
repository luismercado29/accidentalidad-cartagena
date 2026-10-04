import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { BARRIOS, CORREDORES, dentroDeCartagena, LIMITES } from '@/lib/geo';
import { bloqueado, sumarIntento } from '@/lib/limites';

/**
 * Busca direcciones y lugares, siempre dentro de Cartagena.
 * Primero los barrios y corredores conocidos (sin salir a la red); luego Mapbox
 * si hay token, o Nominatim (OpenStreetMap) respetando su politica de uso:
 * User-Agent propio, cache y pocas peticiones por persona.
 */
export const dynamic = 'force-dynamic';

type Lugar = { nombre: string; detalle: string; lat: number; lng: number };

const cache = new Map<string, { hasta: number; lugares: Lugar[] }>();
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function locales(q: string): Lugar[] {
  const t = sinTildes(q);
  const barrios = BARRIOS
    .filter((b) => [b.nombre, ...(b.alias ?? [])].some((n) => sinTildes(n).includes(t)))
    .map((b) => ({ nombre: b.nombre, detalle: 'Barrio · Cartagena', lat: b.lat, lng: b.lng }));
  const corredores = CORREDORES
    .filter((c) => sinTildes(c.nombre).includes(t))
    .map((c) => { const [lat, lng] = c.puntos[Math.floor(c.puntos.length / 2)]; return { nombre: c.nombre, detalle: 'Corredor vial · Cartagena', lat, lng }; });
  return [...corredores, ...barrios].slice(0, 4);
}

async function externos(q: string): Promise<Lugar[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const caja = `${LIMITES.oeste},${LIMITES.sur},${LIMITES.este},${LIMITES.norte}`;
  if (token) {
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&bbox=${caja}&country=co&language=es&limit=6&access_token=${token}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`Mapbox ${r.status}`);
    const d = await r.json() as { features?: { geometry: { coordinates: [number, number] }; properties: { name?: string; full_address?: string; place_formatted?: string } }[] };
    return (d.features ?? []).map((f) => ({
      nombre: f.properties.name ?? q, detalle: f.properties.place_formatted ?? f.properties.full_address ?? 'Cartagena',
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
    }));
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&bounded=1&countrycodes=co&accept-language=es&viewbox=${LIMITES.oeste},${LIMITES.norte},${LIMITES.este},${LIMITES.sur}&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'PulsoVial/2.0 (observatorio de siniestralidad vial de Cartagena; proyecto de portafolio)' } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const d = await r.json() as { display_name: string; name?: string; lat: string; lon: string }[];
  return d.map((x) => {
    const partes = x.display_name.split(',').map((p) => p.trim());
    return { nombre: x.name || partes[0], detalle: partes.slice(1, 4).join(', '), lat: Number(x.lat), lng: Number(x.lon) };
  });
}

export async function GET(req: Request) {
  const q = z.string().trim().min(3).max(120).safeParse(new URL(req.url).searchParams.get('q'));
  if (!q.success) return NextResponse.json({ lugares: [], error: 'Escribe al menos 3 letras.' }, { status: 400 });
  const consulta = q.data;
  const clave = sinTildes(consulta);

  const enCache = cache.get(clave);
  if (enCache && enCache.hasta > Date.now()) return NextResponse.json({ lugares: enCache.lugares });

  const conocidos = locales(consulta);
  const ip = ((await headers()).get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (bloqueado(`geo:${ip}`, 30)) {
    return NextResponse.json({ lugares: conocidos, aviso: 'Demasiadas búsquedas seguidas; se muestran solo barrios conocidos. Intenta en un minuto.' });
  }
  sumarIntento(`geo:${ip}`, 60_000);

  let lugares = conocidos;
  let aviso: string | undefined;
  try {
    const ext = (await externos(consulta)).filter((l) => Number.isFinite(l.lat) && dentroDeCartagena(l.lat, l.lng));
    lugares = [...conocidos, ...ext].slice(0, 8);
  } catch (err) {
    console.error('[geocodificar]', err);
    aviso = 'El buscador de direcciones no respondió; se muestran barrios conocidos. También puedes marcar el punto en el mapa.';
  }
  if (!aviso) {
    cache.set(clave, { hasta: Date.now() + 60 * 60_000, lugares });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  }
  return NextResponse.json({ lugares, aviso });
}
