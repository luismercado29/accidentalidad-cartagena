import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export default function PanelPublico() {
  const [stats, setStats]       = useState(null);
  const [heatData, setHeatData] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState(null);

  const canvasGravRef = useRef(null);
  const canvasMesRef  = useRef(null);
  const chartGrav     = useRef(null);
  const chartMes      = useRef(null);

  useEffect(() => {
    async function cargar() {
      try {
        const [resStats, resHeat] = await Promise.all([
          fetch(`${API_BASE}/api/publico/estadisticas`).then(r => r.json()),
          fetch(`${API_BASE}/api/publico/mapa-calor`).then(r => r.json()),
        ]);
        setStats(resStats);
        setHeatData(Array.isArray(resHeat) ? resHeat : []);
      } catch (e) {
        setError('No se pudo conectar con el servidor. Verifica que el backend esté corriendo.');
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, []);

  // Chart gravedad
  useEffect(() => {
    if (!canvasGravRef.current || !stats?.por_gravedad) return;
    chartGrav.current?.destroy();
    const g = stats.por_gravedad;
    chartGrav.current = new Chart(canvasGravRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Leve', 'Grave', 'Fatal'],
        datasets: [{
          data: [g.leve || 0, g.grave || 0, g.fatal || 0],
          backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } } },
      },
    });
    return () => chartGrav.current?.destroy();
  }, [stats]);

  // Chart tendencia
  useEffect(() => {
    const tendencia = stats?.tendencia_mensual || stats?.tendencia_6_meses || [];
    if (!canvasMesRef.current || !tendencia.length) return;
    chartMes.current?.destroy();
    const t = stats.tendencia_mensual || stats.tendencia_6_meses || [];
    chartMes.current = new Chart(canvasMesRef.current, {
      type: 'line',
      data: {
        labels: t.map(d => d.etiqueta || d.mes || ''),
        datasets: [{
          label: 'Accidentes',
          data: t.map(d => d.total || 0),
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79,70,229,0.08)',
          fill: true, tension: 0.4, borderWidth: 2,
          pointBackgroundColor: '#4f46e5', pointRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { beginAtZero: true, ticks: { font: { size: 11 } } },
        },
      },
    });
    return () => chartMes.current?.destroy();
  }, [stats]);

  if (cargando) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>Cargando estadísticas públicas…</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📡</div>
      <h2 style={{ color: '#374151' }}>Sin conexión</h2>
      <p style={{ color: '#6b7280' }}>{error}</p>
    </div>
  );

  if (!cargando && stats?.total === 0) return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
      <h2 style={{ color: '#374151' }}>Sin datos disponibles</h2>
      <p style={{ color: '#6b7280' }}>No hay accidentes aprobados en el sistema. Ejecuta <code>iniciar_db_y_datos.bat</code> para cargar los datos de ejemplo, o inicia sesión como administrador para aprobar reportes.</p>
    </div>
  );

  const total = stats?.total || 0;
  const fatales = stats?.por_gravedad?.fatal || 0;
  const graves = stats?.por_gravedad?.grave || 0;
  const barrios = stats?.top5_barrios || stats?.top_barrios || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4f46e5 100%)',
        borderRadius: '16px',
        padding: '2rem 2.5rem',
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-20px', right: '-20px', fontSize: '8rem', opacity: 0.08 }}>🗺️</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.4rem' }}>
          Estadísticas Públicas de Accidentalidad
        </h1>
        <p style={{ opacity: 0.85, fontSize: '1rem' }}>
          Cartagena de Indias — Datos abiertos para la ciudadanía
        </p>
        <div style={{ marginTop: '1.2rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '20px', padding: '0.3rem 0.9rem', fontSize: '0.8rem' }}>
            🔓 Acceso libre
          </span>
          <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '20px', padding: '0.3rem 0.9rem', fontSize: '0.8rem' }}>
            📊 Datos en tiempo real
          </span>
          <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '20px', padding: '0.3rem 0.9rem', fontSize: '0.8rem' }}>
            🏙️ Tránsito Cartagena
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {[
          { label: 'Total Accidentes', value: total.toLocaleString('es-CO'), icon: '🚗', color: '#4f46e5' },
          { label: 'Accidentes Fatales', value: fatales.toLocaleString('es-CO'), icon: '☠️', color: '#ef4444' },
          { label: 'Accidentes Graves', value: graves.toLocaleString('es-CO'), icon: '🚑', color: '#f59e0b' },
          { label: 'Leves', value: (stats?.por_gravedad?.leve || 0).toLocaleString('es-CO'), icon: '🩹', color: '#22c55e' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: 'white',
            borderRadius: '12px',
            padding: '1.2rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            borderTop: `4px solid ${kpi.color}`,
            display: 'flex', alignItems: 'center', gap: '1rem',
          }}>
            <div style={{ fontSize: '2rem' }}>{kpi.icon}</div>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.2rem' }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>

        {/* Gravedad doughnut */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
            Distribución por Gravedad
          </h3>
          <div style={{ height: '240px', position: 'relative' }}>
            <canvas ref={canvasGravRef} />
          </div>
        </div>

        {/* Tendencia */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
            Tendencia Mensual
          </h3>
          <div style={{ height: '240px', position: 'relative' }}>
            {(stats?.tendencia_mensual?.length || stats?.tendencia_6_meses?.length)
              ? <canvas ref={canvasMesRef} />
              : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>Sin datos disponibles</div>
            }
          </div>
        </div>
      </div>

      {/* Top barrios */}
      {barrios.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1.2rem' }}>
            🚨 Zonas de Mayor Riesgo
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {barrios.slice(0, 10).map((b, i) => {
              const maxVal = barrios[0]?.total || 1;
              const pct = Math.round(((b.total || 0) / maxVal) * 100);
              const colors = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16'];
              const color = colors[Math.min(i, colors.length - 1)];
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: color, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#374151' }}>{b.barrio || b.nombre || '—'}</span>
                      <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>{(b.total || 0).toLocaleString('es-CO')} accidentes</span>
                    </div>
                    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        background: '#f8fafc',
        borderRadius: '12px',
        padding: '1.2rem 1.5rem',
        border: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', gap: '0.8rem',
        color: '#6b7280', fontSize: '0.82rem',
      }}>
        <span style={{ fontSize: '1.2rem' }}>ℹ️</span>
        <div>
          <strong style={{ color: '#374151' }}>CrashMap Cartagena</strong> — Panel de estadísticas públicas.
          Los datos son actualizados periódicamente por el sistema de tránsito de la ciudad.
          Para reportar un accidente, inicia sesión en la plataforma.
        </div>
      </div>
    </div>
  );
}
