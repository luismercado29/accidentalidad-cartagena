import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

// ── Helpers ──────────────────────────────────────────────────────────────────
function calcularSLAColor(minutos, slaLimite, estado) {
  if (estado === 'cerrado') return '#48bb78';
  const slaMin = slaLimite || 30;
  const pct = minutos / slaMin;
  if (pct >= 1) return '#fc8181';     // vencido
  if (pct >= 0.75) return '#f6ad55';  // cerca del límite
  return '#68d391';                   // en tiempo
}

function SLABadge({ minutos, slaMinutos, estado }) {
  const color = calcularSLAColor(minutos, slaMinutos, estado);
  const vencido = estado !== 'cerrado' && minutos >= slaMinutos;
  return (
    <span style={{
      background: color,
      color: '#1a202c',
      fontSize: '0.75rem',
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 12,
      whiteSpace: 'nowrap',
    }}>
      {vencido ? '⚠ VENCIDO' : `${minutos}/${slaMinutos} min`}
    </span>
  );
}

function EstadoBadge({ estado }) {
  const mapa = {
    pendiente:   { label: 'Pendiente',    bg: '#fefcbf', color: '#744210' },
    en_atencion: { label: 'En Atención',  bg: '#bee3f8', color: '#2a4a6b' },
    cerrado:     { label: 'Cerrado',      bg: '#c6f6d5', color: '#22543d' },
  };
  const cfg = mapa[estado] || mapa.pendiente;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontSize: '0.72rem', fontWeight: 700,
      padding: '2px 10px', borderRadius: 12,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Temporizador en vivo ──────────────────────────────────────────────────────
function Cronometro({ createdAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const inicio = new Date(createdAt);
    const tick = () => {
      const diff = Math.floor((Date.now() - inicio.getTime()) / 1000);
      setElapsed(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return (
    <span style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700 }}>
      {h > 0 ? `${h}h ` : ''}{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function GestorIncidentes({ usuario, toast }) {
  const [incidentes,    setIncidentes]    = useState([]);
  const [historial,     setHistorial]     = useState(null);
  const [vista,         setVista]         = useState('activos');
  const [cargando,      setCargando]      = useState(false);
  const [modal,         setModal]         = useState(null);   // { tipo, incidente }
  const [notas,         setNotas]         = useState('');
  const [crearForm,     setCrearForm]     = useState(false);
  const [nuevoInc,      setNuevoInc]      = useState({ accidente_id: '', telefono: '', sla: 30 });

  const cargarActivos = useCallback(async () => {
    try {
      const data = await api.get('/api/incidentes/activos');
      setIncidentes(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, []);

  const cargarHistorial = useCallback(async () => {
    try {
      const data = await api.get('/api/incidentes/historial');
      setHistorial(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    cargarActivos();
    const id = setInterval(cargarActivos, 15000);
    return () => clearInterval(id);
  }, [cargarActivos]);

  useEffect(() => {
    if (vista === 'historial') cargarHistorial();
  }, [vista, cargarHistorial]);

  async function accionIncidente(inc, tipo) {
    setModal({ tipo, incidente: inc });
    setNotas('');
  }

  async function confirmarAccion() {
    if (!modal) return;
    setCargando(true);
    try {
      const endpoint = modal.tipo === 'atencion'
        ? `/api/incidentes/${modal.incidente.id}/en-atencion`
        : `/api/incidentes/${modal.incidente.id}/cerrar`;
      const params = notas ? `?notas=${encodeURIComponent(notas)}` : '';
      await api.put(endpoint + params, {});
      toast.success(modal.tipo === 'atencion' ? 'Incidente asignado' : 'Incidente cerrado');
      setModal(null);
      cargarActivos();
    } catch (e) {
      toast.error(e.message || 'Error al actualizar');
    } finally {
      setCargando(false);
    }
  }

  async function crearIncidente() {
    if (!nuevoInc.accidente_id) {
      toast.error('Ingresa el ID del accidente');
      return;
    }
    setCargando(true);
    try {
      await api.post('/api/incidentes', {
        accidente_id: parseInt(nuevoInc.accidente_id),
        telefono_reportante: nuevoInc.telefono || null,
        sla_minutos: parseInt(nuevoInc.sla),
      });
      toast.success('Incidente creado');
      setCrearForm(false);
      setNuevoInc({ accidente_id: '', telefono: '', sla: 30 });
      cargarActivos();
    } catch (e) {
      toast.error(e.message || 'Error al crear incidente');
    } finally {
      setCargando(false);
    }
  }

  const gravColor = { fatal: '#fc8181', grave: '#f6ad55', leve: '#68d391' };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>🚨 Gestión de Incidentes</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Flujo en tiempo real: reportado → en atención → cerrado (SLA 30 min)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className={`btn ${vista === 'activos' ? 'btn-primary' : ''}`}
            onClick={() => setVista('activos')}
            style={{ fontSize: '0.85rem' }}
          >
            Activos ({incidentes.length})
          </button>
          <button
            className={`btn ${vista === 'historial' ? 'btn-primary' : ''}`}
            onClick={() => setVista('historial')}
            style={{ fontSize: '0.85rem' }}
          >
            Historial
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setCrearForm(true)}
            style={{ fontSize: '0.85rem' }}
          >
            + Nuevo
          </button>
        </div>
      </div>

      {/* Formulario crear incidente */}
      {crearForm && (
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem', background: '#1e3a5f', border: '1px solid #3b82f6', color: '#e2e8f0' }}>
          <h4 style={{ marginTop: 0 }}>Crear incidente desde accidente</h4>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4, color: '#94a3b8' }}>ID Accidente *</label>
              <input
                type="number"
                value={nuevoInc.accidente_id}
                onChange={e => setNuevoInc({ ...nuevoInc, accidente_id: e.target.value })}
                style={{ width: 120, padding: '6px 8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
                placeholder="ID"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4, color: '#94a3b8' }}>Tel. Reportante (WhatsApp)</label>
              <input
                type="text"
                value={nuevoInc.telefono}
                onChange={e => setNuevoInc({ ...nuevoInc, telefono: e.target.value })}
                style={{ width: 160, padding: '6px 8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
                placeholder="+573001234567"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4, color: '#94a3b8' }}>SLA (min)</label>
              <input
                type="number"
                value={nuevoInc.sla}
                onChange={e => setNuevoInc({ ...nuevoInc, sla: e.target.value })}
                style={{ width: 80, padding: '6px 8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
              />
            </div>
            <button className="btn btn-primary" onClick={crearIncidente} disabled={cargando}>
              {cargando ? '...' : 'Crear'}
            </button>
            <button className="btn" onClick={() => setCrearForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Vista activos */}
      {vista === 'activos' && (
        <>
          {incidentes.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '2.5rem' }}>✅</div>
              <p>No hay incidentes activos</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {incidentes.map(inc => (
                <div
                  key={inc.id}
                  className="card"
                  style={{
                    padding: '1rem',
                    border: `2px solid ${inc.sla_vencido ? '#fc8181' : '#e2e8f0'}`,
                    background: inc.sla_vencido ? '#fff5f5' : 'var(--card-bg)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>#{inc.id}</span>
                      <EstadoBadge estado={inc.estado} />
                      {inc.accidente && (
                        <span style={{
                          background: gravColor[inc.accidente.gravedad] || '#e2e8f0',
                          color: '#1a202c',
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontWeight: 600,
                        }}>
                          {(inc.accidente.gravedad || '').toUpperCase()}
                        </span>
                      )}
                      <SLABadge
                        minutos={inc.minutos_transcurridos}
                        slaMinutos={inc.sla_minutos}
                        estado={inc.estado}
                      />
                    </div>
                    <Cronometro createdAt={inc.created_at} />
                  </div>

                  <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.25rem' }}>
                    <div style={{ fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Barrio: </span>
                      <strong>{inc.accidente?.barrio || '—'}</strong>
                    </div>
                    <div style={{ fontSize: '0.82rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Accidente ID: </span>
                      <strong>#{inc.accidente_id}</strong>
                    </div>
                    {inc.telefono_reportante && (
                      <div style={{ fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>WhatsApp: </span>
                        <strong>{inc.telefono_reportante}</strong>
                      </div>
                    )}
                  </div>

                  {inc.accidente?.descripcion && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      {inc.accidente.descripcion}
                    </div>
                  )}

                  {inc.notas_operador && (
                    <div style={{ marginTop: '0.4rem', padding: '4px 8px', background: '#edf2f7', borderRadius: 6, fontSize: '0.8rem' }}>
                      📝 {inc.notas_operador}
                    </div>
                  )}

                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    {inc.estado === 'pendiente' && (
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '0.8rem', padding: '4px 14px' }}
                        onClick={() => accionIncidente(inc, 'atencion')}
                      >
                        🚑 Tomar incidente
                      </button>
                    )}
                    {inc.estado !== 'cerrado' && (
                      <button
                        className="btn"
                        style={{ fontSize: '0.8rem', padding: '4px 14px', background: '#c6f6d5', color: '#22543d', border: '1px solid #68d391' }}
                        onClick={() => accionIncidente(inc, 'cerrar')}
                      >
                        ✓ Cerrar incidente
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Vista historial */}
      {vista === 'historial' && historial && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Total cerrados', value: historial.total },
              { label: 'Cumplieron SLA', value: `${historial.cumple_sla} (${historial.pct_sla}%)` },
              { label: 'Tiempo promedio', value: `${historial.tiempo_promedio_min} min` },
            ].map(kpi => (
              <div key={kpi.label} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{kpi.value}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Tabla */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#253347' }}>
                  {['#', 'Accidente', 'Tiempo resp.', 'SLA', 'Cumple', 'Cierre', 'Notas'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historial.incidentes.map((inc, i) => (
                  <tr key={inc.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? '#253347' : undefined }}>
                    <td style={{ padding: '8px 12px' }}>{inc.id}</td>
                    <td style={{ padding: '8px 12px' }}>#{inc.accidente_id}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{inc.tiempo_respuesta_min} min</td>
                    <td style={{ padding: '8px 12px' }}>{inc.sla_minutos} min</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ color: inc.cumple_sla ? '#22543d' : '#9b2c2c', fontWeight: 700 }}>
                        {inc.cumple_sla ? '✓' : '✗'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                      {inc.fecha_cierre ? new Date(inc.fecha_cierre).toLocaleString('es-CO') : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {inc.notas || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal acción */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
        }}>
          <div className="card" style={{ width: 420, padding: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>
              {modal.tipo === 'atencion' ? '🚑 Tomar Incidente' : '✓ Cerrar Incidente'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {modal.tipo === 'atencion'
                ? `Asignarás el incidente #${modal.incidente.id} a tu nombre.`
                : `Cerrarás el incidente #${modal.incidente.id}. ${modal.incidente.telefono_reportante ? 'Se enviará notificación WhatsApp al reportante.' : ''}`
              }
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, color: '#94a3b8' }}>Notas (opcional)</label>
              <textarea
                rows={3}
                value={notas}
                onChange={e => setNotas(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9', resize: 'vertical', boxSizing: 'border-box' }}
                placeholder="Agregar notas o comentarios..."
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setModal(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={confirmarAccion}
                disabled={cargando}
              >
                {cargando ? '...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
