import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// ── Colores semáforo ──────────────────────────────────────────────────────────
const SEMAFORO = {
  rojo:     { bg: '#9b2c2c', text: '#fff9f9', icon: '🔴' },
  amarillo: { bg: '#744210', text: '#fffff0', icon: '🟡' },
  verde:    { bg: '#1c4532', text: '#f0fff4', icon: '🟢' },
};

function SemaforoCard({ zona }) {
  const cfg = SEMAFORO[zona.nivel] || SEMAFORO.verde;
  return (
    <div style={{
      background: cfg.bg,
      color: cfg.text,
      borderRadius: 12,
      padding: '0.75rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '0.9rem',
    }}>
      <span style={{ fontSize: '1.2rem' }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {zona.barrio}
        </div>
        <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
          {zona.accidentes_2h} acc. (2h)
        </div>
      </div>
    </div>
  );
}

function KpiCard({ valor, label, color, icon }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 16,
      padding: '1.5rem',
      textAlign: 'center',
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{ fontSize: '2.2rem', marginBottom: '0.25rem' }}>{icon}</div>
      <div style={{ fontSize: '2.5rem', fontWeight: 900, color, lineHeight: 1 }}>{valor}</div>
      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: '0.25rem' }}>{label}</div>
    </div>
  );
}

// ── Mapa estático con puntos (Leaflet sin React) ──────────────────────────────
function MapaTurno({ puntos }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, {
      center: [10.391, -75.4794],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    mapInstanceRef.current = map;
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    // Limpiar markers anteriores
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    const colorGrav = { fatal: '#fc8181', grave: '#f6ad55', leve: '#68d391' };
    const sizeGrav  = { fatal: 22, grave: 18, leve: 14 };
    puntos.forEach(p => {
      const color = colorGrav[p.gravedad] || '#90cdf4';
      const size  = sizeGrav[p.gravedad]  || 14;
      const half  = size / 2;
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:${color};
          border:3px solid #fff;
          box-shadow:0 0 0 3px ${color}80, 0 0 14px ${color};
          animation:pulse-pin 1.5s ease-in-out infinite;
        "></div>
        <style>
          @keyframes pulse-pin {
            0%,100%{box-shadow:0 0 0 3px ${color}80,0 0 14px ${color}}
            50%{box-shadow:0 0 0 8px ${color}30,0 0 22px ${color}}
          }
        </style>`,
        iconSize: [size, size],
        iconAnchor: [half, half],
      });
      const marker = L.marker([p.lat, p.lng], { icon })
        .bindPopup(`<b>${p.gravedad.toUpperCase()}</b><br>${p.barrio || 'Sin barrio'}<br>Hace ${p.hace_min} min`)
        .addTo(mapInstanceRef.current);
      markersRef.current.push(marker);
    });
  }, [puntos]);

  return (
    <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }} />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Página pública del Panel de Turno (sin login)
// Acceder vía: /panel-turno o como componente dentro del sistema
// ════════════════════════════════════════════════════════════════════════════
export default function PanelTurno() {
  const [datos,    setDatos]    = useState(null);
  const [lastUpd,  setLastUpd]  = useState(null);
  const [error,    setError]    = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  async function cargarDatos() {
    try {
      const res = await fetch(`${API}/api/panel-turno/datos`);
      const data = await res.json();
      setDatos(data);
      setLastUpd(new Date());
      setError(false);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    cargarDatos();
    const id = setInterval(cargarDatos, 30000);
    return () => clearInterval(id);
  }, []);

  const ahora = new Date();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d1b2a 0%, #1a3a5c 50%, #0d1b2a 100%)',
      color: '#fff',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      padding: fullScreen ? 0 : '1rem',
      boxSizing: 'border-box',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: fullScreen ? 0 : '12px 12px 0 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '1.8rem' }}>🗺️</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.05em' }}>
              PANEL DE TURNO — CrashMap Cartagena
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
              Secretaría de Movilidad · Solo Lectura
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'monospace' }}>
              {ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
              {ahora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          <button
            onClick={() => setFullScreen(f => !f)}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            {fullScreen ? '⊡ Normal' : '⛶ Pantalla completa'}
          </button>
          {lastUpd && (
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textAlign: 'right' }}>
              Actualizado<br />{lastUpd.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#fc8181' }}>
          ⚠ No se pudo conectar al servidor. Reintentando...
        </div>
      )}

      {datos && (
        <div style={{ padding: '1rem' }}>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <KpiCard valor={datos.kpis.total_hoy} label="Accidentes hoy" color="#90cdf4" icon="🚗" />
            <KpiCard valor={datos.kpis.fatales_hoy} label="Fatales hoy" color="#fc8181" icon="💀" />
            <KpiCard valor={datos.kpis.graves_hoy} label="Graves hoy" color="#f6ad55" icon="🚑" />
            <KpiCard valor={datos.kpis.incidentes_activos} label="Incidentes activos" color="#68d391" icon="🔔" />
            {datos.kpis.incidentes_vencidos > 0 && (
              <KpiCard valor={datos.kpis.incidentes_vencidos} label="SLA vencidos" color="#fc8181" icon="⚠" />
            )}
          </div>

          {/* Mapa + Semáforo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1rem', marginBottom: '1rem', minHeight: 400 }}>
            {/* Mapa */}
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.1)',
              minHeight: 400,
            }}>
              <MapaTurno puntos={datos.puntos_activos} />
            </div>

            {/* Semáforo zonas */}
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 12,
              padding: '1rem',
              border: '1px solid rgba(255,255,255,0.1)',
              overflowY: 'auto',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Semáforo de Zonas (2h)
              </div>
              {datos.semaforo_zonas.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>Sin actividad en zonas</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {datos.semaforo_zonas.map(z => <SemaforoCard key={z.barrio} zona={z} />)}
                </div>
              )}
            </div>
          </div>

          {/* Incidentes activos */}
          {datos.incidentes_activos.length > 0 && (
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 12,
              padding: '1rem',
              border: '1px solid rgba(255,255,255,0.1)',
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.75rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Incidentes con SLA activo
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {datos.incidentes_activos.map(inc => {
                  const pct = inc.minutos / inc.sla;
                  const colorBar = inc.vencido ? '#fc8181' : pct > 0.75 ? '#f6ad55' : '#68d391';
                  return (
                    <div key={inc.id} style={{
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 10,
                      padding: '0.75rem 1rem',
                      border: `2px solid ${inc.vencido ? '#fc8181' : 'rgba(255,255,255,0.1)'}`,
                      minWidth: 160,
                    }}>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>#{inc.id}</div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem' }}>
                        {inc.estado === 'en_atencion' ? '🚑 En atención' : '🔔 Pendiente'}
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 4, height: 6, marginBottom: '0.25rem' }}>
                        <div style={{
                          width: `${Math.min(pct * 100, 100)}%`,
                          background: colorBar,
                          height: '100%',
                          borderRadius: 4,
                          transition: 'width 1s',
                        }} />
                      </div>
                      <div style={{ fontSize: '0.78rem', color: colorBar, fontWeight: 600 }}>
                        {inc.vencido ? '⚠ VENCIDO' : `${inc.minutos}/${inc.sla} min`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
