import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const NIVEL_CFG = {
  alto:  { color: '#fc8181', bg: 'rgba(252,129,129,0.12)', textColor: '#f1f5f9', label: 'Alto Riesgo',  icon: '🔴' },
  medio: { color: '#f6ad55', bg: 'rgba(246,173,85,0.12)',  textColor: '#f1f5f9', label: 'Riesgo Medio', icon: '🟡' },
  bajo:  { color: '#68d391', bg: 'rgba(104,211,145,0.10)', textColor: '#f1f5f9', label: 'Riesgo Bajo',  icon: '🟢' },
};

export default function PrediccionRiesgo({ usuario, toast }) {
  const [datos,    setDatos]    = useState(null);
  const [cargando, setCargando] = useState(false);
  const [params, setParams] = useState({
    dia_semana: new Date().getDay() === 0 ? 6 : new Date().getDay() - 1,
    hora_inicio: 7,
    hora_fin: 9,
  });
  const mapRef = useRef(null);
  const mapInstRef = useRef(null);
  const circlesRef = useRef([]);

  async function predecir() {
    setCargando(true);
    try {
      const { dia_semana, hora_inicio, hora_fin } = params;
      const data = await api.get(`/api/predicciones/mapa-calor-predictivo?dia_semana=${dia_semana}&hora_inicio=${hora_inicio}&hora_fin=${hora_fin}`);
      setDatos(data);
    } catch (e) {
      toast.error('Error al generar predicción');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { predecir(); }, []); // eslint-disable-line

  // Inicializar mapa
  useEffect(() => {
    if (!mapRef.current || mapInstRef.current) return;
    const map = L.map(mapRef.current, { center: [10.391, -75.4794], zoom: 12 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    mapInstRef.current = map;
    return () => { map.remove(); mapInstRef.current = null; };
  }, []);

  // Actualizar capas del mapa con predicciones
  useEffect(() => {
    if (!mapInstRef.current || !datos) return;

    // Limpiar capas anteriores
    circlesRef.current.forEach(c => c.remove());
    circlesRef.current = [];

    const colores = { alto: '#e53e3e', medio: '#dd6b20', bajo: '#38a169' };

    // Puntos históricos (pequeños puntos semitransparentes)
    datos.puntos_historicos.forEach(p => {
      const c = L.circleMarker([p.lat, p.lng], {
        radius: 4,
        fillColor: '#63b3ed',
        fillOpacity: 0.5,
        stroke: false,
      }).addTo(mapInstRef.current);
      circlesRef.current.push(c);
    });

    // Predicciones por barrio (círculos proporcionales al riesgo)
    datos.predicciones_por_barrio.forEach(b => {
      const radio = 200 + b.riesgo_combinado * 600;
      const color = colores[b.nivel] || '#63b3ed';
      const circle = L.circle([b.lat, b.lng], {
        radius: radio,
        fillColor: color,
        fillOpacity: 0.3,
        color: color,
        weight: 1,
      }).bindTooltip(
        `<b>${b.barrio}</b><br>Riesgo: ${(b.riesgo_combinado * 100).toFixed(0)}%<br>Histórico: ${b.densidad_historica} accidentes`,
        { permanent: false }
      ).addTo(mapInstRef.current);
      circlesRef.current.push(circle);
    });
  }, [datos]);

  const horariosPredefinidos = [
    { label: 'Mañana (6-9h)',  hora_inicio: 6,  hora_fin: 9  },
    { label: 'Almuerzo (12-14h)', hora_inicio: 12, hora_fin: 14 },
    { label: 'Tarde (17-19h)', hora_inicio: 17, hora_fin: 19 },
    { label: 'Noche (20-23h)', hora_inicio: 20, hora_fin: 23 },
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>🔮 Predicción de Riesgo por Hora y Día</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Combinación de modelo ML + densidad histórica para predecir zonas de riesgo
        </p>
      </div>

      {/* Selector de parámetros */}
      <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Día */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Día de la semana</label>
            <select
              value={params.dia_semana}
              onChange={e => setParams({ ...params, dia_semana: parseInt(e.target.value) })}
              style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', minWidth: 140 }}
            >
              {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          {/* Hora inicio */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Hora inicio</label>
            <input
              type="number"
              min={0}
              max={23}
              value={params.hora_inicio}
              onChange={e => setParams({ ...params, hora_inicio: parseInt(e.target.value) })}
              style={{ width: 80, padding: '7px 8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
            />
          </div>
          {/* Hora fin */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Hora fin</label>
            <input
              type="number"
              min={0}
              max={23}
              value={params.hora_fin}
              onChange={e => setParams({ ...params, hora_fin: parseInt(e.target.value) })}
              style={{ width: 80, padding: '7px 8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
            />
          </div>
          <button className="btn btn-primary" onClick={predecir} disabled={cargando} style={{ fontSize: '0.9rem', padding: '8px 20px' }}>
            {cargando ? '⟳ Calculando...' : '🔮 Predecir'}
          </button>
        </div>

        {/* Horarios rápidos */}
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', alignSelf: 'center' }}>Horario rápido:</span>
          {horariosPredefinidos.map(h => (
            <button
              key={h.label}
              className="btn"
              style={{ fontSize: '0.78rem', padding: '3px 12px' }}
              onClick={() => setParams({ ...params, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin })}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Estado del modelo */}
      {datos && (
        <div style={{
          padding: '0.6rem 1rem',
          background: datos.modelo_entrenado ? 'rgba(104,211,145,0.12)' : 'rgba(246,173,85,0.12)',
          border: `1px solid ${datos.modelo_entrenado ? '#68d391' : '#f6ad55'}`,
          borderRadius: 8,
          fontSize: '0.82rem',
          marginBottom: '1rem',
          color: '#e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          {datos.modelo_entrenado
            ? '🟢 Modelo ML entrenado con datos reales. Las predicciones combinan datos históricos + machine learning.'
            : '🟡 El modelo ML aún no ha sido entrenado (usa pesos aleatorios). Las predicciones se basan principalmente en densidad histórica. Ve a Dashboard → ML para entrenar el modelo.'
          }
        </div>
      )}

      {/* Resultado — resumen */}
      {datos && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#253347', borderRadius: 8, fontSize: '0.875rem', color: '#f1f5f9' }}>
          <strong>Predicción:</strong> {datos.dia_nombre}, {datos.hora_inicio}:00 — {datos.hora_fin}:00 h
          · <strong>{datos.total_historicos}</strong> accidentes históricos en este horario
        </div>
      )}

      {/* Layout mapa + ranking — mapa SIEMPRE en el DOM para que Leaflet lo inicialice */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem' }}>
        {/* Mapa */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', minHeight: 500, position: 'relative' }}>
          <div ref={mapRef} style={{ width: '100%', height: 500 }} />
          {!datos && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', fontSize: '0.9rem', pointerEvents: 'none',
              background: 'rgba(15,23,42,0.6)',
            }}>
              {cargando ? '⟳ Calculando predicción...' : 'Presiona "Predecir" para ver el mapa'}
            </div>
          )}
        </div>

        {/* Top zonas de riesgo */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
            Top Zonas de Riesgo
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 460 }}>
            {!datos ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Sin datos aún
              </div>
            ) : datos.predicciones_por_barrio.map((b) => {
              const ncfg = NIVEL_CFG[b.nivel] || NIVEL_CFG.bajo;
              const pct = Math.round(b.riesgo_combinado * 100);
              return (
                <div key={b.barrio} style={{
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid #334155',
                  background: ncfg.bg,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f1f5f9' }}>
                      {ncfg.icon} {b.barrio}
                    </span>
                    <span style={{
                      background: ncfg.color + '33',
                      color: ncfg.color,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                    }}>
                      {pct}%
                    </span>
                  </div>
                  {/* Barra de riesgo */}
                  <div style={{ background: '#334155', borderRadius: 4, height: 5 }}>
                    <div style={{
                      width: `${pct}%`,
                      background: ncfg.color,
                      height: '100%',
                      borderRadius: 4,
                      transition: 'width 0.6s',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    {b.densidad_historica} históricos · ML: {(b.riesgo_ml * 100).toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Leyenda */}
      {datos && (
        <div className="card" style={{ marginTop: '1rem', padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Leyenda:</span>
            {Object.values(NIVEL_CFG).map(n => (
              <span key={n.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                <span>{n.icon}</span>
                <span style={{ color: n.color, fontWeight: 600 }}>{n.label}</span>
              </span>
            ))}
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>·</span>
            <span style={{ fontSize: '0.8rem', color: '#63b3ed' }}>● Puntos históricos reales</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              El tamaño de los círculos es proporcional al nivel de riesgo predicho.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
