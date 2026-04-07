import React, { useState, useEffect } from 'react';
import api from '../api';

export default function AlertasZona({ usuario, toast }) {
  const [configs,    setConfigs]    = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cargando,   setCargando]   = useState(false);
  const [form, setForm] = useState({
    nombre_zona: '',
    lat: 10.391,
    lng: -75.4794,
    radio_metros: 500,
    max_accidentes: 3,
    ventana_minutos: 30,
    email_supervisor: '',
    whatsapp_supervisor: '',
  });

  async function cargar() {
    try {
      const data = await api.get('/api/alertas/config');
      setConfigs(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }

  useEffect(() => { cargar(); }, []);

  async function guardar() {
    if (!form.nombre_zona.trim()) { toast.error('El nombre de zona es requerido'); return; }
    setCargando(true);
    try {
      await api.post('/api/alertas/config', {
        nombre_zona: form.nombre_zona,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        radio_metros: parseInt(form.radio_metros),
        max_accidentes: parseInt(form.max_accidentes),
        ventana_minutos: parseInt(form.ventana_minutos),
        email_supervisor: form.email_supervisor || null,
        whatsapp_supervisor: form.whatsapp_supervisor || null,
      });
      toast.success('Alerta configurada');
      setMostrarForm(false);
      setForm({ nombre_zona: '', lat: 10.391, lng: -75.4794, radio_metros: 500, max_accidentes: 3, ventana_minutos: 30, email_supervisor: '', whatsapp_supervisor: '' });
      cargar();
    } catch (e) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setCargando(false);
    }
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar esta configuración de alerta?')) return;
    try {
      await api.delete(`/api/alertas/config/${id}`);
      toast.success('Eliminada');
      cargar();
    } catch { toast.error('Error al eliminar'); }
  }

  async function verificarAhora() {
    try {
      const res = await api.post('/api/alertas/verificar', {});
      if (res.alertas_disparadas?.length > 0) {
        toast.warning(`Alertas disparadas: ${res.alertas_disparadas.join(', ')}`);
      } else {
        toast.info('Sin acumulaciones detectadas en este momento');
      }
    } catch { toast.error('Error al verificar'); }
  }

  const zonasPredefinidas = [
    { nombre: 'La Cordialidad', lat: 10.395, lng: -75.490 },
    { nombre: 'Av. Pedro de Heredia', lat: 10.3995, lng: -75.4950 },
    { nombre: 'Bocagrande', lat: 10.3922, lng: -75.5386 },
    { nombre: 'Centro Histórico', lat: 10.4236, lng: -75.5472 },
    { nombre: 'El Bosque', lat: 10.3905, lng: -75.4880 },
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>⚡ Alertas Automáticas por Zona</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Notificación automática cuando se acumulan N accidentes en una zona en X minutos
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn" onClick={verificarAhora} style={{ fontSize: '0.85rem' }}>
            🔍 Verificar ahora
          </button>
          <button className="btn btn-primary" onClick={() => setMostrarForm(true)} style={{ fontSize: '0.85rem' }}>
            + Nueva alerta
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="card" style={{ padding: '0.75rem 1rem', background: '#1e3a5f', border: '1px solid #3b82f6', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#e2e8f0' }}>
        <strong style={{ color: '#90cdf4' }}>¿Cómo funciona?</strong> El sistema verifica automáticamente cada 5 minutos.
        Si en el radio configurado se registran N o más accidentes dentro de la ventana de tiempo,
        se envía una notificación interna + email/WhatsApp al supervisor. Las verificaciones
        también ocurren en cada solicitud al API.
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem', background: '#1e293b' }}>
          <h3 style={{ marginTop: 0, color: '#f1f5f9' }}>Nueva configuración de alerta</h3>

          {/* Zonas rápidas */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Zona predefinida (carga coordenadas):</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
              {zonasPredefinidas.map(z => (
                <button
                  key={z.nombre}
                  className="btn"
                  style={{ fontSize: '0.78rem', padding: '3px 12px' }}
                  onClick={() => setForm({ ...form, nombre_zona: z.nombre, lat: z.lat, lng: z.lng })}
                >
                  {z.nombre}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {[
              { key: 'nombre_zona', label: 'Nombre zona *', type: 'text', placeholder: 'Ej: La Cordialidad' },
              { key: 'lat', label: 'Latitud', type: 'number', step: '0.0001' },
              { key: 'lng', label: 'Longitud', type: 'number', step: '0.0001' },
              { key: 'radio_metros', label: 'Radio (m)', type: 'number', min: 100, max: 5000 },
              { key: 'max_accidentes', label: 'Máx. accidentes', type: 'number', min: 1, max: 20 },
              { key: 'ventana_minutos', label: 'Ventana (min)', type: 'number', min: 5, max: 240 },
              { key: 'email_supervisor', label: 'Email supervisor', type: 'email', placeholder: 'supervisor@cartagena.gov.co' },
              { key: 'whatsapp_supervisor', label: 'WhatsApp supervisor', type: 'text', placeholder: '+573001234567' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4, color: '#94a3b8' }}>{f.label}</label>
                <input
                  type={f.type}
                  step={f.step}
                  min={f.min}
                  max={f.max}
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #334155', boxSizing: 'border-box', background: '#0f172a', color: '#f1f5f9' }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={guardar} disabled={cargando}>
              {cargando ? 'Guardando...' : 'Guardar'}
            </button>
            <button className="btn" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Lista de configuraciones */}
      {configs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem' }}>⚡</div>
          <p>No hay alertas configuradas. Crea una para empezar a monitorear zonas.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {configs.map(cfg => (
            <div key={cfg.id} className="card" style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.4rem' }}>
                  {cfg.nombre_zona}
                  <span style={{ marginLeft: 8, background: cfg.activa ? '#c6f6d5' : '#fed7d7', color: cfg.activa ? '#22543d' : '#742a2a', fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                    {cfg.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span>📍 {cfg.lat.toFixed(4)}, {cfg.lng.toFixed(4)}</span>
                  <span>🎯 Radio: {cfg.radio_metros}m</span>
                  <span>⚠ Umbral: {cfg.max_accidentes} acc. en {cfg.ventana_minutos} min</span>
                  {cfg.email_supervisor && <span>📧 {cfg.email_supervisor}</span>}
                  {cfg.whatsapp_supervisor && <span>💬 {cfg.whatsapp_supervisor}</span>}
                </div>
              </div>
              <button
                className="btn btn-danger"
                style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                onClick={() => eliminar(cfg.id)}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
