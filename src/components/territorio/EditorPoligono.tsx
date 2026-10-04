'use client';

import { Eraser, Undo2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { Mapa, type Capa } from '@/components/mapa/Mapa';

type Punto = [number, number]; // [lat, lng]

function leer(texto: string): Punto[] {
  try {
    const v = JSON.parse(texto);
    if (Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length >= 2 && p.every((n: unknown) => typeof n === 'number'))) return v.map((p) => [p[0], p[1]]);
  } catch { /* texto libre o GeoJSON: lo valida el servidor */ }
  return [];
}

/**
 * Dibuja un poligono con clics en el mapa. El campo de texto es la fuente de
 * verdad y la alternativa accesible: se puede escribir o pegar ahi (JSON
 * [[lat,lng],...], GeoJSON o una linea «lat, lng» por vertice).
 */
export function EditorPoligono({ inicial, color = '#B45309', otras = [] }: { inicial?: Punto[]; color?: string; otras?: { coords: Punto[]; color: string; nombre: string }[] }) {
  const id = useId();
  const [texto, setTexto] = useState(inicial?.length ? JSON.stringify(inicial.map(([a, b]) => [+a.toFixed(6), +b.toFixed(6)])) : '');
  const [anuncio, setAnuncio] = useState('');
  const puntos = useMemo(() => leer(texto), [texto]);
  const fijar = (p: Punto[], msg: string) => { setTexto(p.length ? JSON.stringify(p) : ''); setAnuncio(msg); };

  const capas = useMemo<Capa[]>(() => [
    { tipo: 'poligonos', items: otras.map((o) => ({ coords: o.coords, color: o.color, ventana: { titulo: o.nombre } })) },
    puntos.length >= 3
      ? { tipo: 'poligonos', items: [{ coords: puntos, color }] }
      : { tipo: 'lineas', items: puntos.length >= 2 ? [{ coords: puntos, color, grosor: 3, discontinua: true }] : [] },
    { tipo: 'puntos', items: puntos.map((p, i) => ({ lat: p[0], lng: p[1], color: i === 0 ? '#121019' : color, radio: 6 })) },
  ], [puntos, color, otras]);

  return (
    <div className="space-y-3">
      <Mapa
        etiqueta="Mapa para dibujar la geocerca: cada clic agrega un vértice"
        alto="22rem" capas={capas} ajustar={!!inicial?.length}
        alClic={(lat, lng) => fijar([...puntos, [+lat.toFixed(6), +lng.toFixed(6)]], `Vértice ${puntos.length + 1} agregado`)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-tinta-2"><strong className="text-tinta">{puntos.length}</strong> vértices · haz clic en el mapa para agregar (mínimo 3).</p>
        <button type="button" className="boton boton-secundario boton-chico" disabled={!puntos.length}
          onClick={() => fijar(puntos.slice(0, -1), 'Último vértice eliminado')}><Undo2 className="size-4" aria-hidden="true" />Deshacer</button>
        <button type="button" className="boton boton-secundario boton-chico" disabled={!puntos.length}
          onClick={() => fijar([], 'Polígono borrado')}><Eraser className="size-4" aria-hidden="true" />Limpiar</button>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={id} className="block font-semibold">Coordenadas del polígono</label>
        <textarea id={id} name="poligono" rows={3} className="campo font-mono text-sm" value={texto} onChange={(ev) => setTexto(ev.target.value)}
          aria-describedby={`${id}-ayuda`} spellCheck={false} />
        <p id={`${id}-ayuda`} className="text-sm text-tinta-2">Se llena al hacer clic en el mapa. También puedes pegar GeoJSON (Polygon) o una línea «lat, lng» por vértice.</p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{anuncio}</p>
    </div>
  );
}
