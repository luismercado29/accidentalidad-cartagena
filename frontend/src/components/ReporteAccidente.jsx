import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';
import { useToast } from '../hooks/useToast';
import Toast from './Toast';

const CARTAGENA_CENTER = [10.3910, -75.4794];

const FORM_INICIAL = {
  latitud: 10.3910,
  longitud: -75.4794,
  barrio: '',
  fecha_hora: new Date().toISOString().slice(0, 16) + ':00',
  gravedad: 'leve',
  tipo_vehiculo: 'automovil',
  clima: 'soleado',
  estado_via: 'bueno',
  dia_festivo: false,
  hora_pico: false,
  descripcion: '',
};

// Point-in-polygon for Cartagena land boundary
const POLIGONO = [
  [-75.5510,10.3820],[-75.5510,10.3870],[-75.5480,10.3920],[-75.5430,10.3960],
  [-75.5400,10.4020],[-75.5350,10.4050],[-75.5280,10.4080],[-75.5200,10.4050],
  [-75.5150,10.4000],[-75.5100,10.3950],[-75.5050,10.3900],[-75.4980,10.3850],
  [-75.4900,10.3800],[-75.4820,10.3750],[-75.4750,10.3720],[-75.4680,10.3700],
  [-75.4600,10.3690],[-75.4550,10.3710],[-75.4500,10.3750],[-75.4450,10.3800],
  [-75.4400,10.3860],[-75.4350,10.3920],[-75.4300,10.4000],[-75.4280,10.4100],
  [-75.4350,10.4200],[-75.4400,10.4280],[-75.4500,10.4350],[-75.4600,10.4420],
  [-75.4700,10.4480],[-75.4800,10.4550],[-75.4900,10.4600],[-75.5000,10.4580],
  [-75.5100,10.4550],[-75.5150,10.4480],[-75.5200,10.4380],[-75.5300,10.4300],
  [-75.5400,10.4260],[-75.5480,10.4200],[-75.5510,10.4100],[-75.5500,10.4000],
  [-75.5480,10.3920],[-75.5510,10.3820],
];

function coordEnTierra(lat, lng) {
  const BUF = 0.006;
  function dentro(plat, plng) {
    let inside = false;
    for (let i = 0, j = POLIGONO.length - 1; i < POLIGONO.length; j = i++) {
      const [lngi, lati] = POLIGONO[i];
      const [lngj, latj] = POLIGONO[j];
      if (((lati > plat) !== (latj > plat)) &&
          plng < ((lngj - lngi) * (plat - lati)) / (latj - lati) + lngi)
        inside = !inside;
    }
    return inside;
  }
  const offs = [[0,0],[BUF,0],[-BUF,0],[0,BUF],[0,-BUF],[BUF,BUF],[-BUF,BUF],[BUF,-BUF],[-BUF,-BUF]];
  return offs.some(([dlat,dlng]) => dentro(lat+dlat, lng+dlng));
}

export default function ReporteAccidente({ usuario }) {
  const [form, setForm]                   = useState({ ...FORM_INICIAL });
  const [enviado, setEnviado]             = useState(false);
  const [enviando, setEnviando]           = useState(false);
  const [seleccionandoMapa, setSelMapa]   = useState(false);
  const [gpsActivo, setGpsActivo]         = useState(false);

  // ── GPS automático ─────────────────────────────────────────────────────────
  function usarGPS() {
    if (!navigator.geolocation) {
      toast.error('Tu dispositivo no soporta geolocalización');
      return;
    }
    setGpsActivo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        setForm(prev => ({ ...prev, latitud: lat, longitud: lng }));
        setGpsActivo(false);
        toast.success(`GPS: ${lat}, ${lng} (±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        setGpsActivo(false);
        if (err.code === 1) toast.error('Permiso de ubicación denegado');
        else toast.error('No se pudo obtener la ubicación GPS');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  const mapDomRef  = useRef(null);
  const mapInstRef = useRef(null);
  const markerRef  = useRef(null);
  const formRef    = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  const { toasts, removeToast, toast } = useToast();

  // ── Leaflet map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!seleccionandoMapa) {
      if (mapInstRef.current) {
        mapInstRef.current.remove();
        mapInstRef.current = null;
        markerRef.current  = null;
      }
      return;
    }
    const timer = setTimeout(() => {
      if (!mapDomRef.current || mapInstRef.current) return;
      const { latitud, longitud } = formRef.current;
      mapInstRef.current = L.map(mapDomRef.current).setView(
        [parseFloat(latitud) || CARTAGENA_CENTER[0], parseFloat(longitud) || CARTAGENA_CENTER[1]], 14
      );
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 19,
      }).addTo(mapInstRef.current);

      const lat0 = parseFloat(latitud) || CARTAGENA_CENTER[0];
      const lng0 = parseFloat(longitud) || CARTAGENA_CENTER[1];
      markerRef.current = L.circleMarker([lat0, lng0], {
        radius: 10, fillColor: '#6366f1', color: '#fff', weight: 3, fillOpacity: 1,
      }).bindPopup('Ubicación actual').addTo(mapInstRef.current);

      mapInstRef.current.on('click', (e) => {
        const clat = parseFloat(e.latlng.lat.toFixed(6));
        const clng = parseFloat(e.latlng.lng.toFixed(6));
        if (markerRef.current) markerRef.current.remove();
        markerRef.current = L.circleMarker([clat, clng], {
          radius: 10, fillColor: '#22c55e', color: '#fff', weight: 3, fillOpacity: 1,
        }).bindPopup('Ubicación seleccionada ✓').addTo(mapInstRef.current).openPopup();
        setForm(prev => ({ ...prev, latitud: clat, longitud: clng }));
      });
    }, 80);
    return () => clearTimeout(timer);
  }, [seleccionandoMapa]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    const lat = parseFloat(form.latitud);
    const lng = parseFloat(form.longitud);
    if (!coordEnTierra(lat, lng)) {
      toast.error('Las coordenadas están en el mar o fuera de Cartagena. Selecciona una ubicación en tierra.');
      return;
    }
    const fechaNorm = form.fecha_hora && form.fecha_hora.length === 16
      ? form.fecha_hora + ':00' : form.fecha_hora;
    setEnviando(true);
    try {
      await api.post('/api/accidentes/reportar', {
        ...form,
        latitud:    lat,
        longitud:   lng,
        fecha_hora: fechaNorm,
      });
      setEnviado(true);
    } catch (err) {
      toast.error(err.message || 'Error al enviar el reporte');
    } finally {
      setEnviando(false);
    }
  }, [form, toast]);

  function resetForm() {
    setForm({ ...FORM_INICIAL, fecha_hora: new Date().toISOString().slice(0, 16) + ':00' });
    setEnviado(false);
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (enviado) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1.5rem', padding: '2rem' }}>
        <Toast toasts={toasts} onRemove={removeToast} />
        <div style={{ fontSize: '4rem' }}>✅</div>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1e293b', textAlign: 'center' }}>
          ¡Reporte enviado con éxito!
        </h2>
        <p style={{ color: '#64748b', textAlign: 'center', maxWidth: 420, lineHeight: 1.6 }}>
          Tu reporte ha sido recibido y quedará en estado <strong>Pendiente</strong> hasta ser verificado por un administrador. Gracias por contribuir a la seguridad vial de Cartagena.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={resetForm}
            style={{
              padding: '0.75rem 2rem', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: 'white', border: 'none', borderRadius: '10px',
              fontWeight: 700, cursor: 'pointer', fontSize: '0.95rem',
            }}
          >
            📝 Enviar otro reporte
          </button>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* Map selection overlay */}
      {seleccionandoMapa && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.8rem 1.5rem', background: '#1e293b', color: 'white', flexShrink: 0,
          }}>
            <span style={{ fontWeight: 600 }}>🗺️ Haz clic en el mapa para indicar la ubicación del accidente</span>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button
                onClick={() => setSelMapa(false)}
                style={{ background: '#22c55e', border: 'none', color: 'white', padding: '0.4rem 1.2rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
              >
                ✓ Confirmar ubicación
              </button>
              <button
                onClick={() => { setForm(p => ({ ...p, latitud: CARTAGENA_CENTER[0], longitud: CARTAGENA_CENTER[1] })); setSelMapa(false); }}
                style={{ background: '#475569', border: 'none', color: 'white', padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          </div>
          <div style={{ fontSize: '0.82rem', background: '#0f172a', color: '#94a3b8', padding: '0.35rem 1.5rem', flexShrink: 0 }}>
            Coordenadas: {parseFloat(form.latitud||0).toFixed(5)}, {parseFloat(form.longitud||0).toFixed(5)}
          </div>
          <div ref={mapDomRef} style={{ flex: 1 }} />
        </div>
      )}

      {/* Page header */}
      <div style={{
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        borderRadius: '14px', padding: '1.5rem 2rem',
        color: 'white', display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        <div style={{ fontSize: '2.5rem' }}>📝</div>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.2rem' }}>
            Reportar Accidente
          </h2>
          <p style={{ opacity: 0.85, fontSize: '0.88rem' }}>
            Tu reporte quedará <strong>pendiente de verificación</strong> por un administrador antes de publicarse.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

        {/* ── Ubicación ── */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            📍 Ubicación del accidente
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            {[['Latitud','latitud'],['Longitud','longitud']].map(([label,key]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>{label}</label>
                <input
                  type="number" step="0.000001"
                  value={form[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Barrio / Sector</label>
              <input
                type="text" value={form.barrio}
                onChange={e => setForm(p => ({ ...p, barrio: e.target.value }))}
                placeholder="Ej: Bocagrande, Manga…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={usarGPS}
                disabled={gpsActivo}
                title="Usar GPS automático"
                style={{
                  padding: '0.65rem 1rem', background: gpsActivo ? '#d1fae5' : '#ecfdf5',
                  color: '#065f46', border: '2px solid #6ee7b7', borderRadius: '8px',
                  fontWeight: 700, cursor: gpsActivo ? 'wait' : 'pointer', fontSize: '0.88rem',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {gpsActivo ? '⟳ GPS...' : '📍 GPS'}
              </button>
              <button
                type="button"
                onClick={() => setSelMapa(true)}
                style={{
                  flex: 1, padding: '0.65rem', background: '#eef2ff',
                  color: '#4f46e5', border: '2px dashed #4f46e5', borderRadius: '8px',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.88rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                🗺️ Seleccionar en el mapa
              </button>
            </div>
          </div>
          {coordEnTierra(parseFloat(form.latitud), parseFloat(form.longitud)) ? (
            <div style={{ padding: '0.5rem 0.8rem', background: '#f0fdf4', borderRadius: '6px', fontSize: '0.8rem', color: '#16a34a', border: '1px solid #bbf7d0', fontWeight: 600 }}>
              ✓ Ubicación en tierra: {parseFloat(form.latitud).toFixed(5)}, {parseFloat(form.longitud).toFixed(5)}
            </div>
          ) : (
            <div style={{ padding: '0.5rem 0.8rem', background: '#fef2f2', borderRadius: '6px', fontSize: '0.8rem', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600 }}>
              ⚠️ Coordenadas en el mar o fuera de Cartagena — usa el mapa para seleccionar
            </div>
          )}
        </div>

        {/* ── Detalles ── */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '1.2rem' }}>📅 Detalles del incidente</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Fecha y Hora *</label>
              <input
                type="datetime-local" required
                value={form.fecha_hora.slice(0,16)}
                onChange={e => setForm(p => ({ ...p, fecha_hora: e.target.value + ':00' }))}
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Gravedad *</label>
              <select
                value={form.gravedad}
                onChange={e => setForm(p => ({ ...p, gravedad: e.target.value }))}
                style={{ width: '100%', padding: '0.6rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', background: 'white' }}
              >
                <option value="leve">🟡 Leve (solo daños materiales)</option>
                <option value="grave">🟠 Grave (con heridos)</option>
                <option value="fatal">🔴 Fatal</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Tipo de vehículo</label>
              <select
                value={form.tipo_vehiculo}
                onChange={e => setForm(p => ({ ...p, tipo_vehiculo: e.target.value }))}
                style={{ width: '100%', padding: '0.6rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', background: 'white' }}
              >
                <option value="automovil">🚗 Automóvil</option>
                <option value="moto">🏍️ Motocicleta</option>
                <option value="bus">🚌 Bus</option>
                <option value="camion">🚛 Camión</option>
                <option value="bicicleta">🚲 Bicicleta</option>
                <option value="peatón">🚶 Peatón</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Condiciones climáticas</label>
              <select
                value={form.clima}
                onChange={e => setForm(p => ({ ...p, clima: e.target.value }))}
                style={{ width: '100%', padding: '0.6rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', background: 'white' }}
              >
                <option value="soleado">☀️ Soleado</option>
                <option value="nublado">☁️ Nublado</option>
                <option value="lluvia">🌧️ Lluvia</option>
                <option value="niebla">🌫️ Niebla</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Estado de la vía</label>
              <select
                value={form.estado_via}
                onChange={e => setForm(p => ({ ...p, estado_via: e.target.value }))}
                style={{ width: '100%', padding: '0.6rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', background: 'white' }}
              >
                <option value="bueno">✅ Bueno</option>
                <option value="regular">⚠️ Regular</option>
                <option value="malo">❌ Malo</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem', color: '#374151' }}>
                <input type="checkbox" checked={form.dia_festivo} onChange={e => setForm(p => ({ ...p, dia_festivo: e.target.checked }))} style={{ width: 16, height: 16 }} />
                📅 Día festivo
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.88rem', color: '#374151' }}>
                <input type="checkbox" checked={form.hora_pico} onChange={e => setForm(p => ({ ...p, hora_pico: e.target.checked }))} style={{ width: 16, height: 16 }} />
                🚦 Hora pico
              </label>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Descripción (opcional)</label>
            <textarea
              rows={3} value={form.descripcion}
              onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
              placeholder="Describe brevemente cómo ocurrió el accidente…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.9rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Status notice */}
        <div style={{ padding: '1rem 1.2rem', background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', fontSize: '0.88rem', color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.1rem' }}>ℹ️</span>
          <span>Tu reporte se enviará con estado <strong>Pendiente</strong> y será revisado por un administrador antes de aparecer en el mapa público.</span>
        </div>

        {/* Submit */}
        <button
          type="submit" disabled={enviando}
          style={{
            padding: '1rem', fontSize: '1rem',
            background: enviando ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color: 'white', border: 'none', borderRadius: '10px',
            fontWeight: 700, cursor: enviando ? 'not-allowed' : 'pointer',
            boxShadow: enviando ? 'none' : '0 4px 14px rgba(99,102,241,0.4)',
            transition: 'all 0.2s',
          }}
        >
          {enviando ? '⏳ Enviando reporte…' : '📤 Enviar reporte de accidente'}
        </button>
      </form>
    </div>
  );
}
