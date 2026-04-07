import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';

const ESTADO_CFG = {
  sin_intervenir: { label: 'Sin Intervenir', bg: '#fed7d7', color: '#9b2c2c', icon: '🔴' },
  en_proceso:     { label: 'En Proceso',     bg: '#fefcbf', color: '#744210', icon: '🟡' },
  intervenido:    { label: 'Intervenido',    bg: '#c6f6d5', color: '#22543d', icon: '🟢' },
};

export default function PuntosNegros({ usuario, toast }) {
  const [puntos,     setPuntos]     = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [cargando,   setCargando]   = useState(false);
  const [syncCargando, setSyncCargando] = useState(false);
  const [editNotas,  setEditNotas]  = useState('');
  const [editEstado, setEditEstado] = useState('');
  const [modalEdit,  setModalEdit]  = useState(false);
  const fileRef = useRef(null);

  async function cargar() {
    try {
      const data = await api.get('/api/puntos-negros');
      setPuntos(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }

  useEffect(() => { cargar(); }, []);

  // Mapa Leaflet
  const mapRef = useRef(null);
  const mapInstRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current || mapInstRef.current) return;
    const map = L.map(mapRef.current, { center: [10.391, -75.4794], zoom: 12 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(map);
    mapInstRef.current = map;
    return () => { map.remove(); mapInstRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapInstRef.current) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const colors = { sin_intervenir: '#fc8181', en_proceso: '#f6ad55', intervenido: '#68d391' };
    puntos.forEach((p, i) => {
      const color = colors[p.estado_intervencion] || '#fc8181';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#1a202c">${p.ranking}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const m = L.marker([p.lat, p.lng], { icon })
        .bindPopup(`<b>#${p.ranking} ${p.nombre}</b><br>${p.total_accidentes} accidentes<br>Score: ${p.score_peligro}`)
        .addTo(mapInstRef.current);
      m.on('click', () => setSelected(p));
      markersRef.current.push(m);
    });
  }, [puntos]);

  async function sincronizar() {
    if (!window.confirm('Esto recalculará los puntos negros usando clustering sobre todos los accidentes. ¿Continuar?')) return;
    setSyncCargando(true);
    try {
      const res = await api.post('/api/puntos-negros/sincronizar', {});
      toast.success(`${res.sincronizados} puntos negros sincronizados`);
      cargar();
    } catch (e) {
      toast.error(e.message || 'Error al sincronizar');
    } finally {
      setSyncCargando(false);
    }
  }

  function abrirEdicion(p) {
    setSelected(p);
    setEditEstado(p.estado_intervencion);
    setEditNotas(p.notas || '');
    setModalEdit(true);
  }

  async function guardarEstado() {
    if (!selected) return;
    setCargando(true);
    try {
      await api.put(`/api/puntos-negros/${selected.id}/estado`, {
        estado_intervencion: editEstado,
        notas: editNotas || null,
      });
      toast.success('Estado actualizado');
      setModalEdit(false);
      cargar();
    } catch (e) {
      toast.error(e.message || 'Error');
    } finally {
      setCargando(false);
    }
  }

  async function subirFoto(puntoId) {
    const file = fileRef.current?.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('foto', file);
    setCargando(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/puntos-negros/${puntoId}/foto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Error al subir foto');
      toast.success('Foto subida');
      cargar();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCargando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const totalSinIntervenir = puntos.filter(p => p.estado_intervencion === 'sin_intervenir').length;
  const totalEnProceso     = puntos.filter(p => p.estado_intervencion === 'en_proceso').length;
  const totalIntervenido   = puntos.filter(p => p.estado_intervencion === 'intervenido').length;

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>🔴 Módulo de Puntos Negros</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Intersecciones y tramos con mayor concentración histórica de accidentes
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={sincronizar}
          disabled={syncCargando}
          style={{ fontSize: '0.85rem' }}
        >
          {syncCargando ? '⟳ Calculando...' : '⟳ Sincronizar desde DB'}
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total puntos negros', value: puntos.length, color: '#f1f5f9', icon: '📍' },
          { label: 'Sin intervenir',      value: totalSinIntervenir, color: '#fc8181', icon: '🔴' },
          { label: 'En proceso',          value: totalEnProceso,     color: '#f6ad55', icon: '🟡' },
          { label: 'Intervenidos',        value: totalIntervenido,   color: '#68d391', icon: '🟢' },
        ].map(k => (
          <div key={k.label} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '1.4rem' }}>{k.icon}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Layout: mapa + lista */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1rem' }}>
        {/* Mapa */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 500 }}>
          <div ref={mapRef} style={{ width: '100%', height: 500 }} />
        </div>

        {/* Lista ranking */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
            Ranking de peligrosidad
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 460 }}>
            {puntos.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Sincroniza para calcular puntos negros
              </div>
            ) : (
              puntos.map((p) => {
                const ecfg = ESTADO_CFG[p.estado_intervencion] || ESTADO_CFG.sin_intervenir;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelected(p)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: selected?.id === p.id ? '#253347' : undefined,
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                        <span style={{
                          background: ecfg.bg, color: ecfg.color,
                          fontWeight: 800, fontSize: '0.9rem',
                          width: 28, height: 28, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {p.ranking}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.barrio || p.nombre}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {p.total_accidentes} acc · {p.fatales} fatales · Score: {p.score_peligro}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.72rem', background: ecfg.bg, color: ecfg.color, padding: '2px 6px', borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 4 }}>
                        {ecfg.icon} {ecfg.label}
                      </span>
                    </div>

                    {selected?.id === p.id && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn"
                          style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                          onClick={(e) => { e.stopPropagation(); abrirEdicion(p); }}
                        >
                          ✏ Editar estado
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                        >
                          📷 Subir foto
                        </button>
                        {p.foto_url && (
                          <a
                            href={`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}${p.foto_url}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: '0.75rem', padding: '3px 10px', textDecoration: 'none', color: 'var(--accent)' }}
                            onClick={e => e.stopPropagation()}
                          >
                            👁 Ver foto
                          </a>
                        )}
                      </div>
                    )}
                    {p.notas && selected?.id === p.id && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        📝 {p.notas}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Input oculto para fotos */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={() => selected && subirFoto(selected.id)}
      />

      {/* Modal editar estado */}
      {modalEdit && selected && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
        }}>
          <div className="card" style={{ width: 420, padding: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Editar Punto Negro #{selected.ranking}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{selected.nombre}</p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Estado de intervención</label>
              <select
                value={editEstado}
                onChange={e => setEditEstado(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
              >
                {Object.entries(ESTADO_CFG).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Notas de intervención</label>
              <textarea
                rows={3}
                value={editNotas}
                onChange={e => setEditNotas(e.target.value)}
                placeholder="Detalles de la intervención, fechas, responsable..."
                style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setModalEdit(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarEstado} disabled={cargando}>
                {cargando ? '...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
