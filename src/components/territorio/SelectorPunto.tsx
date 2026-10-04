'use client';

import { useId, useMemo, useState } from 'react';

import { Mapa, type Capa, type Icono } from '@/components/mapa/Mapa';

/**
 * Elegir una ubicacion con un clic. Los campos de latitud y longitud son
 * visibles y editables (alternativa sin mouse).
 */
export function SelectorPunto({ lat: lat0, lng: lng0, icono = 'novedad', color = '#B45309', contexto = [] }: {
  lat?: number | null; lng?: number | null; icono?: Icono; color?: string; contexto?: Capa[];
}) {
  const id = useId();
  const [lat, setLat] = useState(lat0 != null ? String(lat0) : '');
  const [lng, setLng] = useState(lng0 != null ? String(lng0) : '');
  const [anuncio, setAnuncio] = useState('');
  const la = Number(lat), ln = Number(lng);
  const valido = lat !== '' && lng !== '' && Number.isFinite(la) && Number.isFinite(ln);

  const capas = useMemo<Capa[]>(() => [
    ...contexto,
    { tipo: 'marcadores', items: valido ? [{ lat: la, lng: ln, icono, color, etiqueta: 'Ubicación elegida' }] : [] },
  ], [contexto, valido, la, ln, icono, color]);

  return (
    <div className="space-y-3">
      <Mapa etiqueta="Mapa para elegir la ubicación: haz clic en el punto" alto="16rem" capas={capas}
        centro={valido ? [la, ln] : undefined} zoom={valido ? 15 : 13}
        alClic={(a, b) => { setLat(a.toFixed(6)); setLng(b.toFixed(6)); setAnuncio(`Ubicación fijada en ${a.toFixed(4)}, ${b.toFixed(4)}`); }} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor={`${id}-lat`} className="block text-sm font-semibold">Latitud</label>
          <input id={`${id}-lat`} name="lat" className="campo font-mono" inputMode="decimal" required value={lat} onChange={(ev) => setLat(ev.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-lng`} className="block text-sm font-semibold">Longitud</label>
          <input id={`${id}-lng`} name="lng" className="campo font-mono" inputMode="decimal" required value={lng} onChange={(ev) => setLng(ev.target.value)} />
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{anuncio}</p>
    </div>
  );
}
