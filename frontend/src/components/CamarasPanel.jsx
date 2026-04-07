import React, { useState, useEffect } from 'react';
import api from '../api';

export default function CamarasPanel({ usuario, toast }) {
  const [camaras,      setCamaras]      = useState([]);
  const [seleccionada, setSeleccionada] = useState(null);
  const [mostrarForm,  setMostrarForm]  = useState(false);
  const [editando,     setEditando]     = useState(null);
  const [cargando,     setCargando]     = useState(false);
  const [form, setForm] = useState({ nombre: '', lat: 10.391, lng: -75.4794, url_stream: '', descripcion: '' });

  async function cargar() {
    try {
      const data = await api.get('/api/camaras');
      setCamaras(Array.isArray(data) ? data : []);
      if (!seleccionada && data.length > 0) setSeleccionada(data[0]);
    } catch { /* silent */ }
  }

  useEffect(() => { cargar(); }, []); // eslint-disable-line

  function abrirNueva() {
    setForm({ nombre: '', lat: 10.391, lng: -75.4794, url_stream: '', descripcion: '' });
    setEditando(null);
    setMostrarForm(true);
  }

  function abrirEditar(cam) {
    setForm({ nombre: cam.nombre, lat: cam.lat, lng: cam.lng, url_stream: cam.url_stream, descripcion: cam.descripcion || '' });
    setEditando(cam.id);
    setMostrarForm(true);
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.url_stream.trim()) {
      toast.error('Nombre y URL del stream son requeridos');
      return;
    }
    setCargando(true);
    try {
      const payload = { nombre: form.nombre, lat: parseFloat(form.lat), lng: parseFloat(form.lng), url_stream: form.url_stream, descripcion: form.descripcion || null };
      if (editando) {
        await api.put(`/api/camaras/${editando}`, payload);
        toast.success('Cámara actualizada');
      } else {
        await api.post('/api/camaras', payload);
        toast.success('Cámara agregada');
      }
      setMostrarForm(false);
      cargar();
    } catch (e) {
      toast.error(e.message || 'Error');
    } finally {
      setCargando(false);
    }
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar esta cámara?')) return;
    try {
      await api.delete(`/api/camaras/${id}`);
      toast.success('Cámara eliminada');
      if (seleccionada?.id === id) setSeleccionada(null);
      cargar();
    } catch { toast.error('Error al eliminar'); }
  }

  // Determinar si la URL es MJPEG o imagen estática
  function esMJPEG(url) {
    return url && (url.includes('/video') || url.includes('mjpeg') || url.includes('stream') || url.includes('/cam'));
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>📹 Panel de Cámaras de Tránsito</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Feeds MJPEG en vivo de las cámaras de tránsito de Cartagena
          </p>
        </div>
        {usuario?.es_admin && (
          <button className="btn btn-primary" onClick={abrirNueva} style={{ fontSize: '0.85rem' }}>
            + Agregar cámara
          </button>
        )}
      </div>

      {/* Formulario */}
      {mostrarForm && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem', background: '#1e293b' }}>
          <h3 style={{ marginTop: 0, color: '#f1f5f9' }}>{editando ? 'Editar' : 'Nueva'} cámara</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {[
              { key: 'nombre',     label: 'Nombre *',          type: 'text',   placeholder: 'Cámara Bocagrande' },
              { key: 'url_stream', label: 'URL Stream/MJPEG *', type: 'url',    placeholder: 'http://ip:port/video' },
              { key: 'lat',        label: 'Latitud',            type: 'number', step: '0.0001' },
              { key: 'lng',        label: 'Longitud',           type: 'number', step: '0.0001' },
              { key: 'descripcion', label: 'Descripción',       type: 'text',   placeholder: 'Intersección X con Y' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4, color: '#94a3b8' }}>{f.label}</label>
                <input
                  type={f.type}
                  step={f.step}
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #334155', boxSizing: 'border-box', background: '#0f172a', color: '#f1f5f9' }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: '0.5rem', padding: '0.6rem 1rem', background: '#1e3a5f', border: '1px solid #3b82f6', borderRadius: 8, fontSize: '0.8rem', color: '#e2e8f0' }}>
            💡 Para cámaras MJPEG ingresa la URL directa del stream. Para cámaras IP con autenticación, incluye las credenciales en la URL (http://user:pass@ip/stream).
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={guardar} disabled={cargando}>{cargando ? '...' : 'Guardar'}</button>
            <button className="btn" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {camaras.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '3rem' }}>📹</div>
          <p>No hay cámaras configuradas.</p>
          {usuario?.es_admin && (
            <button className="btn btn-primary" onClick={abrirNueva} style={{ marginTop: '0.5rem' }}>
              Agregar primera cámara
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem' }}>
          {/* Lista de cámaras */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.9rem' }}>
              Cámaras ({camaras.length})
            </div>
            <div style={{ overflowY: 'auto', maxHeight: 600 }}>
              {camaras.map(cam => (
                <div
                  key={cam.id}
                  onClick={() => setSeleccionada(cam)}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: seleccionada?.id === cam.id ? '#253347' : undefined,
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.4rem' }}>📹</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cam.nombre}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {cam.descripcion || `${cam.lat.toFixed(3)}, ${cam.lng.toFixed(3)}`}
                      </div>
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: cam.activa ? '#48bb78' : '#fc8181', flexShrink: 0 }} />
                  </div>
                  {seleccionada?.id === cam.id && usuario?.es_admin && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <button className="btn" style={{ fontSize: '0.72rem', padding: '2px 10px' }} onClick={e => { e.stopPropagation(); abrirEditar(cam); }}>✏ Editar</button>
                      <button className="btn btn-danger" style={{ fontSize: '0.72rem', padding: '2px 10px' }} onClick={e => { e.stopPropagation(); eliminar(cam.id); }}>✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Visor de cámara */}
          <div>
            {seleccionada ? (
              <div className="card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{seleccionada.nombre}</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      📍 {seleccionada.lat.toFixed(5)}, {seleccionada.lng.toFixed(5)}
                      {seleccionada.descripcion && ` · ${seleccionada.descripcion}`}
                    </div>
                  </div>
                  <a
                    href={seleccionada.url_stream}
                    target="_blank"
                    rel="noreferrer"
                    className="btn"
                    style={{ fontSize: '0.8rem' }}
                  >
                    ↗ Abrir en nueva pestaña
                  </a>
                </div>

                {/* Feed MJPEG o iframe */}
                <div style={{
                  background: '#000',
                  borderRadius: 8,
                  overflow: 'hidden',
                  position: 'relative',
                  aspectRatio: '16/9',
                  maxHeight: 480,
                }}>
                  {esMJPEG(seleccionada.url_stream) ? (
                    // Para streams MJPEG auténticos: usar <img> con src al stream
                    <img
                      key={seleccionada.id}
                      src={seleccionada.url_stream}
                      alt={seleccionada.nombre}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    // Para URLs HTTP regulares: usar iframe
                    <iframe
                      key={seleccionada.id}
                      src={seleccionada.url_stream}
                      title={seleccionada.nombre}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      allow="autoplay"
                    />
                  )}
                  {/* Overlay con nombre */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                    padding: '1rem',
                    color: '#fff',
                    fontSize: '0.8rem',
                  }}>
                    📹 {seleccionada.nombre} · {new Date().toLocaleTimeString('es-CO')}
                  </div>
                </div>

                {/* Info adicional */}
                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#253347', borderRadius: 8, fontSize: '0.8rem', color: '#e2e8f0' }}>
                  <strong>URL stream:</strong>{' '}
                  <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{seleccionada.url_stream}</code>
                  <div style={{ marginTop: '0.4rem', color: 'var(--text-secondary)' }}>
                    ℹ Para integrar cámaras MJPEG reales, configura el firewall para permitir acceso desde el servidor.
                    Los streams RTSP deben convertirse a MJPEG/HLS con FFmpeg.
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                Selecciona una cámara de la lista
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grid de todas las cámaras (modo vigilancia) */}
      {camaras.length > 1 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Vista Mosaico</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(camaras.length, 3)}, 1fr)`,
            gap: '0.75rem',
          }}>
            {camaras.slice(0, 6).map(cam => (
              <div
                key={cam.id}
                onClick={() => setSeleccionada(cam)}
                className="card"
                style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', border: seleccionada?.id === cam.id ? '2px solid var(--accent)' : '2px solid transparent' }}
              >
                <div style={{ background: '#111', aspectRatio: '16/9', position: 'relative', overflow: 'hidden' }}>
                  {esMJPEG(cam.url_stream) ? (
                    <img
                      src={cam.url_stream}
                      alt={cam.nombre}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontSize: '2rem' }}>📹</div>
                  )}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.6)', padding: '0.4rem 0.6rem', color: '#fff', fontSize: '0.72rem' }}>
                    {cam.nombre}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
