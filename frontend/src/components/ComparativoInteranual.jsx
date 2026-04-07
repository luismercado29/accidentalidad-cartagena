import React, { useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import api from '../api';

Chart.register(...registerables);

export default function ComparativoInteranual({ usuario, toast }) {
  const [datos,   setDatos]   = useState(null);
  const [anio1,   setAnio1]   = useState(new Date().getFullYear() - 1);
  const [anio2,   setAnio2]   = useState(new Date().getFullYear());
  const [cargando, setCargando] = useState(false);
  const chartRef = useRef(null);
  const chartInstRef = useRef(null);

  async function cargar() {
    setCargando(true);
    try {
      const data = await api.get(`/api/metricas/comparativo-interanual?anio1=${anio1}&anio2=${anio2}`);
      setDatos(data);
    } catch (e) {
      toast.error('Error al cargar datos comparativos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []); // eslint-disable-line

  useEffect(() => {
    if (!datos || !chartRef.current) return;

    if (chartInstRef.current) {
      chartInstRef.current.destroy();
      chartInstRef.current = null;
    }

    const ctx = chartRef.current.getContext('2d');
    const vals1 = datos.series.map(s => s[datos.anio1] || 0);
    const vals2 = datos.series.map(s => s[datos.anio2] || 0);

    chartInstRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: datos.labels,
        datasets: [
          {
            label: String(datos.anio1),
            data: vals1,
            backgroundColor: 'rgba(99,179,237,0.7)',
            borderColor: 'rgba(66,153,225,1)',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: String(datos.anio2),
            data: vals2,
            backgroundColor: 'rgba(104,211,145,0.7)',
            borderColor: 'rgba(56,161,105,1)',
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: 'Variación %',
            data: datos.series.map(s => s.variacion_pct),
            type: 'line',
            yAxisID: 'yPct',
            borderColor: 'rgba(246,173,85,1)',
            backgroundColor: 'rgba(246,173,85,0.1)',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: 'rgba(246,173,85,1)',
            tension: 0.3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { color: '#f1f5f9' } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label === 'Variación %') {
                  const val = ctx.raw;
                  return `Variación: ${val === null ? 'N/A' : (val > 0 ? '+' : '') + val + '%'}`;
                }
                return `${ctx.dataset.label}: ${ctx.raw} accidentes`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.07)' },
          },
          y: {
            position: 'left',
            title: { display: true, text: 'Accidentes', color: '#94a3b8' },
            ticks: { color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.07)' },
            beginAtZero: true,
          },
          yPct: {
            position: 'right',
            title: { display: true, text: 'Variación (%)', color: '#f6ad55' },
            ticks: {
              color: '#f6ad55',
              callback: v => v + '%',
            },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }, [datos]);

  const tendenciaColor = datos?.tendencia === 'reduccion' ? '#68d391' :
                         datos?.tendencia === 'aumento'   ? '#fc8181' : '#90cdf4';
  const tendenciaIcon  = datos?.tendencia === 'reduccion' ? '▼' :
                         datos?.tendencia === 'aumento'   ? '▲' : '→';

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>📊 Comparativo Interanual</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Evolución año a año para medir el impacto de intervenciones viales
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.8rem', marginRight: 6, color: '#f1f5f9' }}>Año base:</label>
            <input
              type="number"
              value={anio1}
              min={2020}
              max={2030}
              onChange={e => setAnio1(parseInt(e.target.value))}
              style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', marginRight: 6, color: '#f1f5f9' }}>Año actual:</label>
            <input
              type="number"
              value={anio2}
              min={2020}
              max={2030}
              onChange={e => setAnio2(parseInt(e.target.value))}
              style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#f1f5f9' }}
            />
          </div>
          <button className="btn btn-primary" onClick={cargar} disabled={cargando} style={{ fontSize: '0.85rem' }}>
            {cargando ? 'Cargando...' : 'Comparar'}
          </button>
        </div>
      </div>

      {/* KPIs resumen */}
      {datos && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Total {datos.anio1}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{datos.totales[datos.anio1]}</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Total {datos.anio2}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{datos.totales[datos.anio2]}</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '1rem', border: `2px solid ${tendenciaColor}` }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
              Variación anual
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: tendenciaColor }}>
              {tendenciaIcon} {Math.abs(datos.variacion_anual_pct)}%
            </div>
            <div style={{ fontSize: '0.75rem', color: tendenciaColor, fontWeight: 600 }}>
              {datos.tendencia === 'reduccion' ? 'Reducción de accidentes' :
               datos.tendencia === 'aumento'   ? 'Aumento de accidentes' : 'Sin variación'}
            </div>
          </div>
        </div>
      )}

      {/* Gráfico */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>
          Accidentes por mes: {datos?.anio1} vs {datos?.anio2}
        </h3>
        {cargando ? (
          <div style={{ height: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            Cargando...
          </div>
        ) : (
          <div style={{ height: 350, position: 'relative' }}>
            <canvas ref={chartRef} />
          </div>
        )}
      </div>

      {/* Tabla detallada */}
      {datos && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
            Detalle mensual
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#253347' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Mes</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>{datos.anio1}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>{datos.anio1} (Fatales)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>{datos.anio2}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>{datos.anio2} (Fatales)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Variación</th>
                </tr>
              </thead>
              <tbody>
                {datos.series.map((s, i) => {
                  const v = s.variacion_pct;
                  const vc = v === null ? '#94a3b8' : v > 0 ? '#fc8181' : v < 0 ? '#68d391' : '#90cdf4';
                  return (
                    <tr key={s.mes} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? '#253347' : undefined }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{s.mes}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{s[datos.anio1]}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#fc8181' }}>
                        {s[`${datos.anio1}_fatales`]}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>{s[datos.anio2]}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#fc8181' }}>
                        {s[`${datos.anio2}_fatales`]}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, color: vc }}>
                        {v === null ? 'N/A' : `${v > 0 ? '+' : ''}${v}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700, background: '#253347' }}>
                  <td style={{ padding: '10px 12px' }}>TOTAL</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{datos.totales[datos.anio1]}</td>
                  <td />
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>{datos.totales[datos.anio2]}</td>
                  <td />
                  <td style={{ padding: '10px 12px', textAlign: 'center', color: tendenciaColor }}>
                    {tendenciaIcon} {datos.variacion_anual_pct}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
