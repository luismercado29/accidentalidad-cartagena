import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

// ─── helpers ──────────────────────────────────────────────────────────────────
const tiempoRelativo = (fechaStr) => {
  const diff  = Date.now() - new Date(fechaStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'Ahora mismo';
  if (mins < 60)  return `Hace ${mins} min`;
  if (hours < 24) return `Hace ${hours}h`;
  if (days < 7)   return `Hace ${days} días`;
  return new Date(fechaStr).toLocaleDateString('es-CO');
};

function tipoIcono(tipo) {
  switch ((tipo || '').toLowerCase()) {
    case 'accidente': return '🚨';
    case 'sistema':   return 'ℹ️';
    case 'importacion':
    case 'import':    return '📊';
    case 'externo':   return '📡';
    case 'error':     return '🔴';
    case 'warning':   return '🟡';
    case 'success':   return '🟢';
    default:          return '🔔';
  }
}

function tipoColor(tipo) {
  switch ((tipo || '').toLowerCase()) {
    case 'accidente': return '#ef4444';
    case 'error':     return '#ef4444';
    case 'warning':   return '#f59e0b';
    case 'success':   return '#22c55e';
    case 'importacion':
    case 'import':    return '#8b5cf6';
    case 'externo':   return '#06b6d4';
    default:          return '#667eea';
  }
}

const FILTROS = [
  { id: 'todas',          label: 'Todas',         icono: '🔔' },
  { id: 'no_leidas',      label: 'No Leídas',     icono: '🔵' },
  { id: 'accidente',      label: 'Accidentes',    icono: '🚨' },
  { id: 'sistema',        label: 'Sistema',       icono: 'ℹ️' },
  { id: 'importacion',    label: 'Importaciones', icono: '📊' },
];

// ═════════════════════════════════════════════════════════════════════════════
export default function Notificaciones({ usuario, token, toast }) {
  const [notificaciones, setNotificaciones] = useState([]);
  const [filtroActivo,   setFiltroActivo]   = useState('todas');
  const [cargando,       setCargando]       = useState(true);

  // ── load ──────────────────────────────────────────────────────────────────
  const cargarNotificaciones = useCallback(async () => {
    try {
      const data = await api.get('/api/notificaciones');
      setNotificaciones(Array.isArray(data) ? data : []);
    } catch {
      toast('error', 'Error al cargar notificaciones');
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => {
    cargarNotificaciones();
  }, [cargarNotificaciones]);

  // ── mark all read ──────────────────────────────────────────────────────────
  async function marcarTodasLeidas() {
    try {
      await api.post('/api/notificaciones/marcar-leidas', {});
      setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
      toast('success', 'Todas las notificaciones marcadas como leídas');
    } catch {
      toast('error', 'Error al marcar notificaciones');
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  async function eliminarNotificacion(id) {
    try {
      await api.delete(`/api/notificaciones/${id}`);
      setNotificaciones(prev => prev.filter(n => n.id !== id));
    } catch {
      toast('error', 'Error al eliminar notificación');
    }
  }

  // ── filter ─────────────────────────────────────────────────────────────────
  const filtradas = notificaciones.filter(n => {
    switch (filtroActivo) {
      case 'no_leidas':   return !n.es_leida;
      case 'accidente':   return (n.tipo || '').toLowerCase() === 'accidente';
      case 'sistema':     return (n.tipo || '').toLowerCase() === 'sistema';
      case 'importacion': return ['importacion', 'import'].includes((n.tipo || '').toLowerCase());
      default:            return true;
    }
  });

  const noLeidas = notificaciones.filter(n => !n.es_leida).length;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.2rem' }}>
            Centro de Notificaciones
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
            {noLeidas > 0 ? `${noLeidas} notificación${noLeidas !== 1 ? 'es' : ''} sin leer` : 'Todo al día'}
          </p>
        </div>
        {noLeidas > 0 && (
          <button className="btn-editar-admin" onClick={marcarTodasLeidas}>
            ✅ Marcar todo como leído
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {FILTROS.map(f => {
          const count = f.id === 'no_leidas'
            ? noLeidas
            : f.id === 'todas'
              ? notificaciones.length
              : notificaciones.filter(n => ['importacion','import'].includes((n.tipo||'').toLowerCase())
                  ? f.id === 'importacion'
                  : (n.tipo||'').toLowerCase() === f.id
                ).length;
          return (
            <button
              key={f.id}
              className={`filtro-chip${filtroActivo === f.id ? ' active' : ''}`}
              onClick={() => setFiltroActivo(f.id)}
            >
              {f.icono} {f.label}
              {count > 0 && (
                <span style={{
                  marginLeft: '0.4rem',
                  background: filtroActivo === f.id ? 'rgba(255,255,255,0.3)' : '#e5e7eb',
                  color: filtroActivo === f.id ? 'white' : '#374151',
                  borderRadius: '10px',
                  padding: '0.1rem 0.5rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem' }} />
          Cargando notificaciones…
        </div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔕</div>
          <h3 style={{ color: '#1f2937', marginBottom: '0.5rem' }}>Sin notificaciones</h3>
          <p style={{ color: '#6b7280' }}>
            {filtroActivo === 'todas'
              ? 'No hay notificaciones registradas aún.'
              : 'No hay notificaciones en esta categoría.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtradas.map((n, idx) => (
            <NotifCard
              key={n.id ?? idx}
              notif={n}
              onEliminar={() => eliminarNotificacion(n.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Notification card ────────────────────────────────────────────────────────
function NotifCard({ notif, onEliminar }) {
  const [hover, setHover] = useState(false);
  const color = tipoColor(notif.tipo);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.9rem',
        padding: '1rem 1.2rem',
        background: notif.es_leida ? 'white' : '#fafbff',
        border: `1px solid ${notif.es_leida ? '#f3f4f6' : '#e0e7ff'}`,
        borderRadius: '10px',
        position: 'relative',
        transition: 'box-shadow 0.2s',
        boxShadow: hover ? '0 4px 12px rgba(0,0,0,0.07)' : 'none',
      }}
    >
      {/* Unread indicator */}
      {!notif.es_leida && (
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          background: color,
          borderRadius: '10px 0 0 10px',
        }} />
      )}

      {/* Icon */}
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        background: `${color}18`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.3rem',
        flexShrink: 0,
      }}>
        {tipoIcono(notif.tipo)}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
          <p style={{ fontWeight: notif.es_leida ? 600 : 700, color: '#1f2937', fontSize: '0.92rem' }}>
            {notif.titulo || notif.title || notif.tipo || 'Notificación'}
          </p>
          {!notif.es_leida && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
          )}
        </div>
        <p style={{ color: '#4b5563', fontSize: '0.87rem', lineHeight: 1.5, marginBottom: '0.3rem' }}>
          {notif.mensaje || notif.message || ''}
        </p>
        {notif.created_at && (
          <p style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
            {tiempoRelativo(notif.created_at)}
          </p>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={onEliminar}
        title="Eliminar notificación"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.3rem',
          borderRadius: '6px',
          color: '#9ca3af',
          fontSize: '1.1rem',
          opacity: hover ? 1 : 0,
          transition: 'opacity 0.2s',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
