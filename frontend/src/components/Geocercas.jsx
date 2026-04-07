import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';

const CTG_CENTER = [10.3910, -75.4794];

export default function Geocercas({ usuario, token, toast }) {
  const mapDivRef   = useRef(null);
  const mapaRef     = useRef(null);
  const polyLayersRef = useRef([]);
  const tempPolyRef   = useRef(null);
  const tempMarkersRef = useRef([]);

  const [geocercas, setGeocercas]             = useState([]);
  const [cargando, setCargando]               = useState(true);
  const [dibujando, setDibujando]             = useState(false);
  const [puntosDibujados, setPuntosDibujados] = useState([]);
  const [mostrarForm, setMostrarForm]         = useState(false);
  const [formData, setFormData]               = useState({ nombre: '', descripcion: '', activa: true });
  const [geocercaSeleccionada, setGeocercaSeleccionada] = useState(null);

  const dibujandoRef     = useRef(false);
  const puntosRef        = useRef([]);

  // Keep refs in sync
  useEffect(() => { dibujandoRef.current = dibujando; }, [dibujando]);
  useEffect(() => { puntosRef.current = puntosDibujados; }, [puntosDibujados]);

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapaRef.current || !mapDivRef.current) return;
    const map = L.map(mapDivRef.current, { zoomControl: true }).setView(CTG_CENTER, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e) => {
      if (!dibujandoRef.current) return;
      const pt = [e.latlng.lat, e.latlng.lng];
      const newPuntos = [...puntosRef.current, pt];
      puntosRef.current = newPuntos;
      setPuntosDibujados(newPuntos);

      // Marker
      const m = L.circleMarker(pt, { radius: 5, color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 1 });
      m.addTo(map);
      tempMarkersRef.current.push(m);

      // Update temp polygon
      if (tempPolyRef.current) {
        tempPolyRef.current.remove();
        tempPolyRef.current = null;
      }
      if (newPuntos.length > 1) {
        tempPolyRef.current = L.polygon(newPuntos, {
          color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.15,
          dashArray: '6 4',
        }).addTo(map);
      }
    });

    mapaRef.current = map;
    return () => {
      map.remove();
      mapaRef.current = null;
    };
  }, []);

  // ── Load geocercas & draw them ──────────────────────────────────────────────
  const cargar = useCallback(async () => {
    try {
      const data = await api.get('/api/geocercas');
      setGeocercas(Array.isArray(data) ? data : []);
    } catch {
      setGeocercas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Re-draw geocercas on map whenever list changes
  useEffect(() => {
    if (!mapaRef.current) return;
    polyLayersRef.current.forEach(l => l.remove());
    polyLayersRef.current = [];

    geocercas.forEach(g => {
      const coords = parseCoords(g);
      if (coords.length < 3) return;
      const color = g.activa ? '#4f46e5' : '#94a3b8';
      const poly = L.polygon(coords, {
        color, fillColor: color, fillOpacity: 0.15, weight: 2,
      });
      poly.bindPopup(`
        <div style="min-width:160px">
          <b style="font-size:0.95rem">${g.nombre}</b>
          ${g.descripcion ? `<br/><span style="color:#6b7280;font-size:0.8rem">${g.descripcion}</span>` : ''}
          <br/><span style="font-size:0.75rem;background:${g.activa ? '#dcfce7' : '#fee2e2'};color:${g.activa ? '#166534' : '#dc2626'};padding:2px 6px;border-radius:4px">
            ${g.activa ? 'Activa' : 'Inactiva'}
          </span>
        </div>
      `);
      poly.addTo(mapaRef.current);
      polyLayersRef.current.push(poly);
    });
  }, [geocercas]);

  function parseCoords(g) {
    try {
      // Backend stores GeoJSON Polygon: {type:"Polygon", coordinates:[[lng,lat],...]}
      const geojson = typeof g.poligono_geojson === 'string'
        ? JSON.parse(g.poligono_geojson)
        : g.poligono_geojson;
      const ring = geojson?.coordinates?.[0];
      if (!Array.isArray(ring)) return [];
      return ring.map(p => [p[1], p[0]]); // [lng,lat] -> [lat,lng] for Leaflet
    } catch { return []; }
  }

  // ── Drawing controls ────────────────────────────────────────────────────────
  function iniciarDibujo() {
    setDibujando(true);
    setPuntosDibujados([]);
    puntosRef.current = [];
    if (mapaRef.current) mapaRef.current.getContainer().style.cursor = 'crosshair';
    toast.info('Haz clic en el mapa para definir los vértices. Mínimo 3 puntos.');
  }

  function cancelarDibujo() {
    setDibujando(false);
    setPuntosDibujados([]);
    puntosRef.current = [];
    if (tempPolyRef.current) { tempPolyRef.current.remove(); tempPolyRef.current = null; }
    tempMarkersRef.current.forEach(m => m.remove());
    tempMarkersRef.current = [];
    if (mapaRef.current) mapaRef.current.getContainer().style.cursor = '';
  }

  function confirmarDibujo() {
    if (puntosDibujados.length < 3) {
      toast.warning('Se necesitan al menos 3 puntos para crear una geocerca');
      return;
    }
    setDibujando(false);
    if (mapaRef.current) mapaRef.current.getContainer().style.cursor = '';
    setMostrarForm(true);
  }

  async function guardarGeocerca() {
    if (!formData.nombre.trim()) { toast.warning('El nombre es obligatorio'); return; }
    try {
      await api.post('/api/geocercas', {
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        // Backend expects poligono_geojson: GeoJSON Polygon string [lng, lat] per spec
        poligono_geojson: JSON.stringify({
          type: 'Polygon',
          coordinates: [puntosDibujados.map(p => [p[1], p[0]])], // [lng, lat]
        }),
        nivel_alerta: 'medio',
        activa: formData.activa,
      });
      toast.success('Geocerca creada correctamente');
      setMostrarForm(false);
      setPuntosDibujados([]);
      puntosRef.current = [];
      setFormData({ nombre: '', descripcion: '', activa: true });
      if (tempPolyRef.current) { tempPolyRef.current.remove(); tempPolyRef.current = null; }
      tempMarkersRef.current.forEach(m => m.remove());
      tempMarkersRef.current = [];
      cargar();
    } catch (err) {
      toast.error(err.message || 'Error al guardar geocerca');
    }
  }

  async function eliminarGeocerca(id) {
    if (!window.confirm('¿Eliminar esta geocerca?')) return;
    try {
      await api.delete(`/api/geocercas/${id}`);
      toast.warning('Geocerca eliminada');
      cargar();
    } catch (err) { toast.error(err.message || 'Error al eliminar'); }
  }

  async function toggleActiva(g) {
    try {
      await api.put(`/api/geocercas/${g.id}`, {
        nombre: g.nombre,
        descripcion: g.descripcion,
        poligono_geojson: g.poligono_geojson,
        nivel_alerta: g.nivel_alerta || 'medio',
        activa: !g.activa,
      });
      toast.success(g.activa ? 'Geocerca desactivada' : 'Geocerca activada');
      cargar();
    } catch (err) { toast.error(err.message || 'Error'); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1f2937' }}>Gestión de Geocercas</h2>
          <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>
            Define áreas de interés y recibe alertas cuando ocurran accidentes dentro de ellas
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {dibujando ? (
            <>
              <button onClick={cancelarDibujo} style={{ padding: '0.6rem 1.2rem', background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: '8px', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
                ✕ Cancelar
              </button>
              <button
                onClick={confirmarDibujo}
                disabled={puntosDibujados.length < 3}
                style={{ padding: '0.6rem 1.2rem', background: puntosDibujados.length < 3 ? '#e5e7eb' : 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: '8px', color: puntosDibujados.length < 3 ? '#9ca3af' : 'white', cursor: puntosDibujados.length < 3 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.88rem' }}
              >
                ✓ Confirmar ({puntosDibujados.length} pts)
              </button>
            </>
          ) : (
            <button onClick={iniciarDibujo} style={{ padding: '0.6rem 1.2rem', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
              + Nueva Geocerca
            </button>
          )}
        </div>
      </div>

      {dibujando && (
        <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: '10px', padding: '0.9rem 1.2rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span style={{ fontSize: '1.4rem' }}>✏️</span>
          <div>
            <strong style={{ color: '#1d4ed8', fontSize: '0.9rem' }}>Modo dibujo activo</strong>
            <p style={{ color: '#3b82f6', fontSize: '0.8rem', margin: 0 }}>
              Haz clic en el mapa para agregar vértices ({puntosDibujados.length} puntos). Mínimo 3 para crear el área.
            </p>
          </div>
        </div>
      )}

      {/* Map */}
      <div style={{ borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', height: '460px', position: 'relative' }}>
        <div ref={mapDivRef} style={{ height: '100%', width: '100%' }} />
        {cargando && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}>
            <div className="spinner" />
          </div>
        )}
      </div>

      {/* Geocercas list */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
          Geocercas configuradas ({geocercas.length})
        </h3>

        {cargando ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="spinner" />
          </div>
        ) : geocercas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗺️</div>
            <p>No hay geocercas configuradas. Haz clic en "Nueva Geocerca" para comenzar.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {geocercas.map(g => (
              <div
                key={g.id}
                onClick={() => setGeocercaSeleccionada(prev => prev?.id === g.id ? null : g)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '0.9rem 1rem',
                  borderRadius: '10px',
                  border: `2px solid ${geocercaSeleccionada?.id === g.id ? '#4f46e5' : '#e5e7eb'}`,
                  background: geocercaSeleccionada?.id === g.id ? '#eef2ff' : '#f9fafb',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: g.activa ? '#22c55e' : '#94a3b8', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1f2937' }}>{g.nombre}</div>
                  {g.descripcion && (
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.descripcion}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '0.75rem', background: g.activa ? '#dcfce7' : '#f3f4f6', color: g.activa ? '#166534' : '#6b7280', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: 600 }}>
                  {g.activa ? 'Activa' : 'Inactiva'}
                </span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    onClick={e => { e.stopPropagation(); toggleActiva(g); }}
                    title={g.activa ? 'Desactivar' : 'Activar'}
                    style={{ padding: '0.35rem 0.6rem', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    {g.activa ? '⏸' : '▶'}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); eliminarGeocerca(g.id); }}
                    title="Eliminar"
                    style={{ padding: '0.35rem 0.6rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', color: '#dc2626' }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nueva geocerca */}
      {mostrarForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
          onClick={e => { if (e.target === e.currentTarget) setMostrarForm(false); }}
        >
          <div style={{ background: 'white', borderRadius: '16px', padding: '2rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1f2937' }}>Nueva Geocerca</h3>
              <button onClick={() => setMostrarForm(false)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>Nombre *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={e => setFormData(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej. Zona Centro Histórico"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.9rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.88rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>Descripción</label>
                <textarea
                  rows={2}
                  value={formData.descripcion}
                  onChange={e => setFormData(p => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Descripción del área…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.9rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.88rem', resize: 'vertical' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem', color: '#374151' }}>
                <input type="checkbox" checked={formData.activa} onChange={e => setFormData(p => ({ ...p, activa: e.target.checked }))} />
                Activar geocerca inmediatamente
              </label>
              <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '0.75rem', fontSize: '0.8rem', color: '#166534' }}>
                ✓ {puntosDibujados.length} vértices definidos
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setMostrarForm(false)} style={{ flex: 1, padding: '0.7rem', background: '#f3f4f6', border: '1.5px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
              <button onClick={guardarGeocerca} style={{ flex: 2, padding: '0.7rem', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                💾 Guardar Geocerca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
