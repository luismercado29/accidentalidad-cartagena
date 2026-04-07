import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

// ─── Static data sources config ───────────────────────────────────────────────
const FUENTES = [
  {
    nombre:      'El Universal — Noticias Locales',
    tipo:        'noticias',
    icono:       '📰',
    descripcion: 'Monitoreo de noticias sobre accidentes en Cartagena',
    estado:      'simulado',
    coleccion:   'RSS / Web Scraping',
    fuente:      'El Universal, El Heraldo',
  },
  {
    nombre:      'Redes Sociales',
    tipo:        'social',
    icono:       '📱',
    descripcion: 'Reportes ciudadanos en Twitter, Facebook e Instagram',
    estado:      'simulado',
    coleccion:   'API Social Media',
    fuente:      'Twitter/X, Facebook',
  },
  {
    nombre:      'Cámaras de Tránsito',
    tipo:        'camaras',
    icono:       '📹',
    descripcion: 'Procesamiento de imágenes con IA para detectar infracciones',
    estado:      'desarrollo',
    coleccion:   'Computer Vision / YOLOv8',
    fuente:      'Red CCTV municipal',
  },
  {
    nombre:      'API Climática IDEAM',
    tipo:        'clima',
    icono:       '🌧️',
    descripcion: 'Condiciones meteorológicas que afectan la accidentalidad',
    estado:      'desarrollo',
    coleccion:   'OpenWeatherMap API',
    fuente:      'IDEAM / OpenWeatherMap',
  },
  {
    nombre:      'Sensores Viales IoT',
    tipo:        'sensores',
    icono:       '📡',
    descripcion: 'Sensores de baches, presión vehicular y estado de vías',
    estado:      'planificado',
    coleccion:   'IoT / MQTT',
    fuente:      'Red de sensores',
  },
];

// ─── helpers ──────────────────────────────────────────────────────────────────
function estadoBadge(estado) {
  switch (estado) {
    case 'simulado':
      return { label: 'Simulado',   bg: '#D1FAE5', color: '#065F46' };
    case 'desarrollo':
      return { label: 'En Desarrollo', bg: '#FEF3C7', color: '#92400E' };
    default:
      return { label: 'Planificado',  bg: '#F3F4F6', color: '#6B7280' };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
export default function FuentesExternas({ usuario, token, toast }) {
  const [accidentesExternos,  setAccidentesExternos]  = useState([]);
  const [ultimaSincronizacion,setUltimaSincronizacion]= useState(null);
  const [simulando,           setSimulando]           = useState(false);
  const [resultadoSimulacion, setResultadoSimulacion] = useState(null);
  const [sincronizando,       setSincronizando]       = useState(null); // tipo de fuente
  const [conteosPorFuente,    setConteosPorFuente]    = useState({});

  // ── load external accidents ────────────────────────────────────────────────
  const cargarAccidentesExternos = useCallback(async () => {
    try {
      const data = await api.get('/api/accidentes');
      const externos = Array.isArray(data)
        ? data.filter(a => (a.fuente || '').toLowerCase() === 'externo')
        : [];
      setAccidentesExternos(externos);

      // Count by source type (stored in descripcion or a source_tipo field)
      const conteos = {};
      externos.forEach(a => {
        const t = a.fuente_tipo || 'noticias';
        conteos[t] = (conteos[t] || 0) + 1;
      });
      setConteosPorFuente(conteos);
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => {
    cargarAccidentesExternos();
  }, [cargarAccidentesExternos]);

  // ── simulate full capture ──────────────────────────────────────────────────
  async function simularCaptura() {
    setSimulando(true);
    setResultadoSimulacion(null);
    try {
      const data = await api.post('/api/fuentes-externas/simular', {});
      const capturados = data?.capturados ?? data?.count ?? data?.importados ?? 0;
      const msg = data?.mensaje ?? `${capturados} accidente${capturados !== 1 ? 's' : ''} capturado${capturados !== 1 ? 's' : ''}`;
      setResultadoSimulacion({ capturados, mensaje: msg, detalle: data });
      setUltimaSincronizacion(new Date());
      toast.success(msg);
      await cargarAccidentesExternos();
    } catch (err) {
      toast.error(err.message || 'Error al simular captura');
    } finally {
      setSimulando(false);
    }
  }

  // ── sync individual source ─────────────────────────────────────────────────
  async function sincronizarFuente(tipo) {
    setSincronizando(tipo);
    try {
      await api.post('/api/fuentes-externas/simular', { tipo });
      toast.success(`Fuente "${tipo}" sincronizada`);
      setUltimaSincronizacion(new Date());
      await cargarAccidentesExternos();
    } catch (err) {
      toast.error(err.message || `Error al sincronizar ${tipo}`);
    } finally {
      setSincronizando(null);
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.2rem' }}>
            Fuentes Externas de Datos
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
            Integración con fuentes externas de información sobre accidentalidad
          </p>
        </div>
        {ultimaSincronizacion && (
          <span style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
            Última sincronización: {ultimaSincronizacion.toLocaleTimeString('es-CO')}
          </span>
        )}
      </div>

      {/* ══ Section 1: Source control panel ═══════════════════════════════════ */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#374151', marginBottom: '1rem' }}>
          Panel de Control de Fuentes
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {FUENTES.map(f => {
            const badge = estadoBadge(f.estado);
            const esSim = f.estado === 'simulado';
            const enSinc = sincronizando === f.tipo;
            return (
              <div
                key={f.tipo}
                className="stats-card"
                style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '10px',
                    background: esSim ? '#eef2ff' : '#f9fafb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.5rem', flexShrink: 0,
                  }}>
                    {f.icono}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1f2937' }}>{f.nombre}</span>
                    </div>
                    <span style={{ padding: '0.2rem 0.7rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.5 }}>
                  {f.descripcion}
                </p>

                {/* Meta */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#9ca3af' }}>Método</span>
                    <span style={{ color: '#374151', fontWeight: 600 }}>{f.coleccion}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#9ca3af' }}>Fuente</span>
                    <span style={{ color: '#374151', fontWeight: 600 }}>{f.fuente}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ color: '#9ca3af' }}>Captados</span>
                    <span style={{ color: '#374151', fontWeight: 700 }}>
                      {conteosPorFuente[f.tipo] ?? 0}
                    </span>
                  </div>
                  {ultimaSincronizacion && esSim && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ color: '#9ca3af' }}>Última sincronización</span>
                      <span style={{ color: '#374151', fontWeight: 500 }}>
                        {ultimaSincronizacion.toLocaleTimeString('es-CO')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action */}
                {esSim ? (
                  <button
                    className="btn-editar-admin"
                    style={{ width: '100%', marginTop: 'auto' }}
                    onClick={() => sincronizarFuente(f.tipo)}
                    disabled={enSinc || simulando}
                  >
                    {enSinc ? '⏳ Sincronizando…' : '🔄 Sincronizar Ahora'}
                  </button>
                ) : (
                  <div style={{ marginTop: 'auto', padding: '0.6rem', background: '#f9fafb', borderRadius: '8px', fontSize: '0.82rem', color: '#9ca3af', textAlign: 'center' }}>
                    {f.estado === 'desarrollo' ? '🔧 En desarrollo activo' : '📅 En hoja de ruta'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ Section 2: Captured accidents table ═══════════════════════════════ */}
      <div className="stats-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.2rem' }}>📡</span>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1f2937' }}>
              Registros Captados Automáticamente
            </h2>
            {accidentesExternos.length > 0 && (
              <span style={{ padding: '0.15rem 0.6rem', background: '#eef2ff', color: '#4f46e5', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700 }}>
                {accidentesExternos.length}
              </span>
            )}
          </div>
        </div>

        {accidentesExternos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 2rem', background: '#f9fafb', borderRadius: '10px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.8rem' }}>📭</div>
            <h3 style={{ color: '#374151', marginBottom: '0.4rem' }}>Sin registros externos</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              Usa el simulador de abajo para capturar datos externos de prueba.
            </p>
          </div>
        ) : (
          <div className="tabla-reportes">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Barrio</th>
                  <th>Gravedad</th>
                  <th>Descripción</th>
                  <th>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {[...accidentesExternos]
                  .sort((a, b) => new Date(b.fecha_hora || 0) - new Date(a.fecha_hora || 0))
                  .slice(0, 50)
                  .map(acc => (
                    <tr key={acc.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                        {acc.fecha_hora ? new Date(acc.fecha_hora).toLocaleString('es-CO') : '—'}
                      </td>
                      <td>{acc.barrio || '—'}</td>
                      <td>
                        <span className={`badge-gravedad ${(acc.gravedad || '').toLowerCase()}`}>
                          {acc.gravedad || '—'}
                        </span>
                      </td>
                      <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', color: '#6b7280' }}>
                        {acc.descripcion || '—'}
                      </td>
                      <td>
                        <span style={{ padding: '0.2rem 0.6rem', background: '#F3E8FF', color: '#6B21A8', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700 }}>
                          externo
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ Section 3: Simulator ══════════════════════════════════════════════ */}
      <div className="stats-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.3rem' }}>🔄</span>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1f2937' }}>
            Simular Captura de Datos Externos
          </h2>
        </div>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Este botón simula la captura automática de accidentes desde las fuentes externas configuradas
          (noticias y redes sociales). Los registros generados se agregarán a la base de datos con
          fuente = "externo" y podrán consultarse en el mapa de calor y en el dashboard.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn-enviar-crashmap"
            style={{ minWidth: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}
            onClick={simularCaptura}
            disabled={simulando}
          >
            {simulando ? (
              <>
                <span className="spinner" style={{ width: '18px', height: '18px', borderWidth: '3px', display: 'inline-block' }} />
                Simulando captura…
              </>
            ) : (
              '🔄 Simular Captura de Datos Externos'
            )}
          </button>

          {resultadoSimulacion && (
            <div style={{
              padding: '0.8rem 1.2rem',
              borderRadius: '8px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.7rem',
            }}>
              <span style={{ fontSize: '1.3rem' }}>✅</span>
              <div>
                <p style={{ fontWeight: 700, color: '#065f46', fontSize: '0.92rem' }}>
                  {resultadoSimulacion.capturados} accidente{resultadoSimulacion.capturados !== 1 ? 's' : ''} capturado{resultadoSimulacion.capturados !== 1 ? 's' : ''}
                </p>
                <p style={{ color: '#047857', fontSize: '0.82rem' }}>
                  {resultadoSimulacion.mensaje}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* How it works */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
          <p style={{ fontWeight: 700, fontSize: '0.88rem', color: '#374151', marginBottom: '0.6rem' }}>
            ¿Cómo funciona la simulación?
          </p>
          <ul style={{ paddingLeft: '1.2rem', color: '#6b7280', fontSize: '0.85rem', lineHeight: 1.8 }}>
            <li>Se generan entre 1 y 3 accidentes con coordenadas aleatorias dentro de Cartagena.</li>
            <li>La gravedad, el clima y el tipo de vehículo se asignan aleatoriamente.</li>
            <li>Cada registro queda marcado como <strong>fuente = externo</strong> en la base de datos.</li>
            <li>Los datos aparecen inmediatamente en el mapa de calor y el dashboard.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
