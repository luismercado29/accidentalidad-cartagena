'use client';

import { useMemo, useState } from 'react';

import { Mapa, type Capa } from '@/components/mapa/Mapa';
import { barrioMasCercano, CENTRO, coordenadas, dentroDeCartagena } from '@/lib/geo';

/**
 * Elegir un punto haciendo clic en el mapa; escribe los campos lat/lng.
 * Alternativa sin mapa: los mismos campos numericos (teclado y lector de pantalla).
 */
export function SelectorUbicacion({ lat: latInicial, lng: lngInicial, radioM, capas, etiqueta = 'Ubicación', alto = '20rem', requerido = true }: {
  lat?: number | null; lng?: number | null; radioM?: number; capas?: Capa[]; etiqueta?: string; alto?: string; requerido?: boolean;
}) {
  const [punto, setPunto] = useState<[number, number] | null>(latInicial != null && lngInicial != null ? [latInicial, lngInicial] : null);
  const [radio, setRadio] = useState(radioM);
  const todas = useMemo<Capa[]>(() => [
    ...(capas ?? []),
    ...(punto && radio ? [{ tipo: 'circulos' as const, items: [{ lat: punto[0], lng: punto[1], radioM: radio, color: '#2437C7' }] }] : []),
    ...(punto ? [{ tipo: 'marcadores' as const, items: [{ lat: punto[0], lng: punto[1], icono: 'destino' as const, etiqueta: 'Punto elegido', color: '#2437C7' }] }] : []),
  ], [capas, punto, radio]);

  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">{etiqueta}{requerido ? <span aria-hidden="true" className="text-error"> *</span> : <span className="font-normal text-tinta-2"> (opcional)</span>}</legend>
      <p className="text-sm text-tinta-2">Haz clic en el mapa para marcar el punto, o escribe las coordenadas.</p>
      <Mapa etiqueta={`${etiqueta}: mapa para elegir el punto`} alto={alto} capas={todas} centro={punto ?? CENTRO} zoom={punto ? 15 : 13}
        alClic={(la, ln) => setPunto([Number(la.toFixed(6)), Number(ln.toFixed(6))])} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Latitud
          <input name="lat" type="number" step="0.000001" className="campo mt-1 font-normal" value={punto?.[0] ?? ''}
            onChange={(ev) => setPunto([Number(ev.target.value), punto?.[1] ?? CENTRO[1]])} />
        </label>
        <label className="block text-sm font-semibold">Longitud
          <input name="lng" type="number" step="0.000001" className="campo mt-1 font-normal" value={punto?.[1] ?? ''}
            onChange={(ev) => setPunto([punto?.[0] ?? CENTRO[0], Number(ev.target.value)])} />
        </label>
      </div>
      {radioM != null && (
        <label className="block text-sm font-semibold">Radio (metros)
          <input name="radioM" type="number" min={50} max={5000} step={50} className="campo mt-1 font-normal" defaultValue={radioM}
            onChange={(ev) => setRadio(Number(ev.target.value) || undefined)} />
        </label>
      )}
      <p className="anotacion text-tinta-3" aria-live="polite">
        {punto
          ? (dentroDeCartagena(punto[0], punto[1]) ? `${coordenadas(punto[0], punto[1])} · cerca de ${barrioMasCercano(punto[0], punto[1]).nombre}` : 'Fuera del área de Cartagena')
          : 'Sin punto elegido'}
      </p>
    </fieldset>
  );
}
