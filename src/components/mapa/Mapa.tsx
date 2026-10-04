'use client';

/**
 * Mapa base (Leaflet) con capas declarativas. Leaflet se carga solo en el
 * navegador; si algo falla se muestra un aviso dentro del recuadro en lugar de
 * tumbar la pagina (antes un error del mapa dejaba la pantalla en negro).
 */
import 'leaflet/dist/leaflet.css';

import type * as Leaflet from 'leaflet';
import { useEffect, useRef, useState } from 'react';

import { CENTRO } from '@/lib/geo';

export type Ventana = { titulo: string; lineas?: string[]; enlace?: { href: string; texto: string } };

export type Capa =
  | { tipo: 'calor'; puntos: [number, number, number][]; radio?: number }
  | { tipo: 'puntos'; items: { lat: number; lng: number; color: string; radio?: number; ventana?: Ventana }[] }
  | { tipo: 'circulos'; items: { lat: number; lng: number; radioM: number; color: string; relleno?: number; ventana?: Ventana }[] }
  | { tipo: 'poligonos'; items: { coords: [number, number][]; color: string; ventana?: Ventana }[] }
  | { tipo: 'lineas'; items: { coords: [number, number][]; color: string; grosor?: number; discontinua?: boolean; opacidad?: number; ventana?: Ventana }[] }
  | { tipo: 'marcadores'; items: { lat: number; lng: number; icono: Icono; etiqueta: string; color?: string; ventana?: Ventana; pulso?: boolean }[] };

export type Icono = 'camara' | 'unidad' | 'qr' | 'novedad' | 'incidente' | 'origen' | 'destino' | 'reporte' | 'alerta';

const SVG: Record<Icono, string> = {
  camara: '<path d="M4 7h11v10H4zM15 10l5-3v10l-5-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  unidad: '<circle cx="12" cy="8" r="3.2" fill="currentColor"/><path d="M5.5 20c.6-4 3-6 6.5-6s5.9 2 6.5 6" fill="currentColor"/>',
  qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2v2h-2zM18 14h2v2h-2z" fill="currentColor"/>',
  novedad: '<path d="M12 3 22 20H2Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9v5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/>',
  incidente: '<path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="4.5" fill="currentColor"/>',
  origen: '<circle cx="12" cy="12" r="6" fill="currentColor"/>',
  destino: '<path d="M6 21V4h11l-2 4 2 4H8" fill="currentColor"/>',
  reporte: '<path d="M5 4h14v12H9l-4 4z" fill="currentColor"/>',
  alerta: '<path d="M12 3a6 6 0 0 1 6 6v4l2 3H4l2-3V9a6 6 0 0 1 6-6Z" fill="currentColor"/><path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="2"/>',
};

function contenidoVentana(v: Ventana) {
  const raiz = document.createElement('div');
  const t = document.createElement('strong');
  t.textContent = v.titulo;
  raiz.appendChild(t);
  for (const l of v.lineas ?? []) {
    const p = document.createElement('div');
    p.textContent = l;
    p.style.color = '#4A475C';
    raiz.appendChild(p);
  }
  if (v.enlace) {
    const a = document.createElement('a');
    a.href = v.enlace.href;
    a.textContent = v.enlace.texto;
    a.style.cssText = 'display:inline-block;margin-top:6px;font-weight:600;color:#2437C7';
    raiz.appendChild(a);
  }
  return raiz;
}

/** Teselas: Mapbox si hay token publico; si no, OpenStreetMap atenuado para que destaquen los datos. */
function capaBase(L: typeof Leaflet, oscuro: boolean) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    const estilo = oscuro ? 'dark-v11' : 'light-v11';
    return L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/${estilo}/tiles/512/{z}/{x}/{y}@2x?access_token=${token}`, {
      tileSize: 512, zoomOffset: -1, maxZoom: 19,
      attribution: '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    });
  }
  // Respaldo sin token: teselas estandar de OpenStreetMap (uso moderado, con atribucion).
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: oscuro ? 'teselas-oscuras' : 'teselas-claras',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
}

export function Mapa({ capas, etiqueta, alto = '28rem', centro = CENTRO, zoom = 13, ajustar = false, oscuro = false, alClic, className = '' }: {
  capas: Capa[]; etiqueta: string; alto?: string; centro?: [number, number]; zoom?: number; ajustar?: boolean; oscuro?: boolean;
  alClic?: (lat: number, lng: number) => void; className?: string;
}) {
  const nodo = useRef<HTMLDivElement>(null);
  const mapa = useRef<Leaflet.Map | null>(null);
  const grupo = useRef<Leaflet.LayerGroup | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const clic = useRef(alClic);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  clic.current = alClic;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const L = (await import('leaflet')).default;
        (window as unknown as { L: typeof Leaflet }).L = L;
        await import('leaflet.heat');
        if (!vivo || !nodo.current) return;
        lib.current = L;
        const m = L.map(nodo.current, { center: centro, zoom, zoomControl: true, attributionControl: true, preferCanvas: true });
        m.attributionControl.setPrefix(false);
        capaBase(L, oscuro).addTo(m);
        grupo.current = L.layerGroup().addTo(m);
        m.on('click', (ev: Leaflet.LeafletMouseEvent) => clic.current?.(ev.latlng.lat, ev.latlng.lng));
        mapa.current = m;
        setEstado('listo');
      } catch (err) {
        console.error('[mapa]', err);
        if (vivo) setEstado('error');
      }
    })();
    return () => { vivo = false; mapa.current?.remove(); mapa.current = null; };
    // El mapa se crea una vez; las capas se actualizan en el efecto siguiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = lib.current, m = mapa.current, g = grupo.current;
    if (estado !== 'listo' || !L || !m || !g) return;
    try {
      g.clearLayers();
      const limites: [number, number][] = [];
      const ventana = (capa: Leaflet.Layer, v?: Ventana) => { if (v) (capa as Leaflet.Path).bindPopup(() => contenidoVentana(v)); return capa; };
      for (const c of capas) {
        if (c.tipo === 'calor') {
          if (!c.puntos.length) continue;
          const heat = (L as unknown as { heatLayer: (p: [number, number, number][], o: object) => Leaflet.Layer }).heatLayer;
          g.addLayer(heat(c.puntos, { radius: c.radio ?? 18, blur: 16, maxZoom: 16, minOpacity: 0.3, gradient: { 0.2: '#FFE08A', 0.45: '#FFC21A', 0.7: '#E5531A', 1: '#7A1010' } }));
          c.puntos.forEach((p) => limites.push([p[0], p[1]]));
        } else if (c.tipo === 'puntos') {
          for (const p of c.items) {
            g.addLayer(ventana(L.circleMarker([p.lat, p.lng], { radius: p.radio ?? 5, color: '#fff', weight: 1, fillColor: p.color, fillOpacity: 0.9 }), p.ventana));
            limites.push([p.lat, p.lng]);
          }
        } else if (c.tipo === 'circulos') {
          for (const p of c.items) {
            g.addLayer(ventana(L.circle([p.lat, p.lng], { radius: p.radioM, color: p.color, weight: 2, fillColor: p.color, fillOpacity: p.relleno ?? 0.15 }), p.ventana));
            limites.push([p.lat, p.lng]);
          }
        } else if (c.tipo === 'poligonos') {
          for (const p of c.items) {
            g.addLayer(ventana(L.polygon(p.coords, { color: p.color, weight: 2, fillOpacity: 0.12 }), p.ventana));
            p.coords.forEach((x) => limites.push(x));
          }
        } else if (c.tipo === 'lineas') {
          for (const p of c.items) {
            g.addLayer(ventana(L.polyline(p.coords, { color: p.color, weight: p.grosor ?? 5, opacity: p.opacidad ?? 0.9, dashArray: p.discontinua ? '8 8' : undefined, lineCap: 'round' }), p.ventana));
            p.coords.forEach((x) => limites.push(x));
          }
        } else if (c.tipo === 'marcadores') {
          for (const p of c.items) {
            const icono = L.divIcon({
              className: '',
              html: `<span style="display:grid;place-items:center;width:30px;height:30px;border-radius:999px;background:${p.color ?? '#121019'};color:#fff;border:2px solid #fff;box-shadow:0 4px 12px rgb(0 0 0 / .3)"${p.pulso ? ' class="latido"' : ''}><svg viewBox="0 0 24 24" width="16" height="16">${SVG[p.icono]}</svg></span>`,
              iconSize: [30, 30], iconAnchor: [15, 15],
            });
            const mk = L.marker([p.lat, p.lng], { icon: icono, title: p.etiqueta, alt: p.etiqueta, keyboard: false });
            if (p.ventana) mk.bindPopup(() => contenidoVentana(p.ventana!));
            g.addLayer(mk);
            limites.push([p.lat, p.lng]);
          }
        }
      }
      if (ajustar && limites.length > 1) m.fitBounds(L.latLngBounds(limites), { padding: [30, 30], maxZoom: 16 });
    } catch (err) {
      console.error('[mapa:capas]', err);
    }
  }, [capas, estado, ajustar]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-borde ${className}`} style={{ height: alto }}>
      <div ref={nodo} role="region" aria-label={etiqueta} className="size-full" />
      {estado !== 'listo' && (
        <div className="absolute inset-0 grid place-items-center bg-hundido p-6 text-center text-tinta-2">
          {estado === 'cargando' ? <p role="status">Cargando mapa…</p>
            : <p role="alert">No se pudo cargar el mapa. Los datos siguen disponibles en la tabla de esta página.</p>}
        </div>
      )}
    </div>
  );
}
