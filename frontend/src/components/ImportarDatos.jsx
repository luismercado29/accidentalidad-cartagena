import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';

// ─── CSV template data ────────────────────────────────────────────────────────
const TEMPLATE_HEADERS = [
  'latitud', 'longitud', 'fecha_hora', 'gravedad', 'tipo_vehiculo',
  'clima', 'estado_via', 'descripcion', 'barrio',
];

const TEMPLATE_ROWS = [
  ['10.3922', '-75.5386', '2024-01-15 08:30', 'leve', 'moto', 'soleado', 'bueno', 'Colisión en intersección', 'Bocagrande'],
  ['10.4120', '-75.5200', '2024-01-16 14:45', 'grave', 'auto', 'lluvia', 'regular', 'Accidente en curva', 'Manga'],
];

const COLUMNAS_INFO = [
  { nombre: 'latitud',       tipo: 'número', requerido: true,  ejemplo: '10.3922'             },
  { nombre: 'longitud',      tipo: 'número', requerido: true,  ejemplo: '-75.5386'            },
  { nombre: 'fecha_hora',    tipo: 'texto',  requerido: true,  ejemplo: '2024-01-15 08:30'    },
  { nombre: 'gravedad',      tipo: 'texto',  requerido: true,  ejemplo: 'leve/grave/fatal'    },
  { nombre: 'tipo_vehiculo', tipo: 'texto',  requerido: true,  ejemplo: 'moto/auto/bus/camion/bicicleta' },
  { nombre: 'clima',         tipo: 'texto',  requerido: false, ejemplo: 'soleado/nublado/lluvia' },
  { nombre: 'estado_via',    tipo: 'texto',  requerido: false, ejemplo: 'bueno/regular/malo'  },
  { nombre: 'descripcion',   tipo: 'texto',  requerido: false, ejemplo: 'Descripción del accidente' },
  { nombre: 'barrio',        tipo: 'texto',  requerido: false, ejemplo: 'Bocagrande'          },
];

// ─── helpers ──────────────────────────────────────────────────────────────────
function parsearCSVSimple(texto) {
  const lineas = texto.trim().split('\n').filter(l => l.trim());
  if (lineas.length < 2) return [];
  const headers = lineas[0].split(',').map(h => h.trim().replace(/"/g, ''));
  return lineas.slice(1).map(linea => {
    const vals = linea.split(',').map(v => v.trim().replace(/"/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

function descargarPlantillaCSV() {
  const rows = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS.map(r => r)];
  const csvContent = rows.map(row => row.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'plantilla_accidentes.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function ImportarDatos({ usuario, token, toast }) {
  const [archivo,         setArchivo]         = useState(null);
  const [previsualizacion,setPrevisualizacion] = useState([]);
  const [resultado,       setResultado]       = useState(null);
  const [cargando,        setCargando]        = useState(false);
  const [arrastrando,     setArrastrando]     = useState(false);
  const [historial,       setHistorial]       = useState([]);
  const [progreso,        setProgreso]        = useState(0);

  const inputRef      = useRef(null);
  const intervaloRef  = useRef(null);

  // ── load import history ────────────────────────────────────────────────────
  const cargarHistorial = useCallback(async () => {
    try {
      const data = await api.get('/api/notificaciones');
      const importaciones = Array.isArray(data)
        ? data.filter(n => n.tipo === 'importacion' || n.tipo === 'import')
        : [];
      setHistorial(importaciones);
    } catch { /* historial es opcional */ }
  }, []);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  // ── file selection ─────────────────────────────────────────────────────────
  function procesarArchivo(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      toast.error('Formato no válido. Use .csv, .xlsx o .xls');
      return;
    }
    setArchivo(file);
    setResultado(null);

    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = e => {
        const filas = parsearCSVSimple(e.target.result);
        setPrevisualizacion(filas.slice(0, 5));
      };
      reader.readAsText(file);
    } else {
      // Excel: preview not available client-side without library
      setPrevisualizacion([]);
    }
  }

  // ── drag & drop ────────────────────────────────────────────────────────────
  function onDragOver(e) {
    e.preventDefault();
    setArrastrando(true);
  }

  function onDragLeave() {
    setArrastrando(false);
  }

  function onDrop(e) {
    e.preventDefault();
    setArrastrando(false);
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
  }

  function onInputChange(e) {
    const file = e.target.files[0];
    if (file) procesarArchivo(file);
  }

  // ── upload ─────────────────────────────────────────────────────────────────
  async function importar() {
    if (!archivo) { toast.warning('Selecciona un archivo primero'); return; }
    setCargando(true);
    setProgreso(0);

    // Simulate progress bar while real request runs
    intervaloRef.current = setInterval(() => {
      setProgreso(prev => prev < 85 ? prev + 5 : prev);
    }, 200);

    try {
      const formData = new FormData();
      formData.append('file', archivo);

      const tkn = localStorage.getItem('token');
      const res = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/importar/excel`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${tkn}` },
          body: formData,
        }
      );

      clearInterval(intervaloRef.current);
      setProgreso(100);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error HTTP ${res.status}`);
      }

      const data = await res.json();
      setResultado({
        importados: data.importados ?? data.count ?? 0,
        errores:    data.errores   ?? data.errors ?? 0,
        mensaje:    data.mensaje   ?? data.message ?? 'Importación completada',
      });
      toast.success(`${data.importados ?? data.count ?? 0} accidentes importados`);
      cargarHistorial();
    } catch (err) {
      clearInterval(intervaloRef.current);
      setProgreso(0);
      toast.error(err.message || 'Error al importar el archivo');
      setResultado({ importados: 0, errores: 1, mensaje: err.message });
    } finally {
      setCargando(false);
    }
  }

  function limpiar() {
    setArchivo(null);
    setPrevisualizacion([]);
    setResultado(null);
    setProgreso(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  // ── derive preview headers ─────────────────────────────────────────────────
  const previewHeaders = previsualizacion.length > 0
    ? Object.keys(previsualizacion[0])
    : [];

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Page header */}
      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.2rem' }}>
          Importar Datos de Accidentes
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
          Carga masiva de registros desde archivos Excel o CSV
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' }}>

        {/* ══ Upload section ══════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Drop zone */}
          <div className="stats-card">
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => !archivo && inputRef.current?.click()}
              style={{
                border: `2px dashed ${arrastrando ? '#667eea' : archivo ? '#22c55e' : '#d1d5db'}`,
                borderRadius: '12px',
                padding: '3rem 2rem',
                textAlign: 'center',
                cursor: archivo ? 'default' : 'pointer',
                background: arrastrando ? '#eef2ff' : archivo ? '#f0fdf4' : '#fafafa',
                transition: 'all 0.25s',
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: 'none' }}
                onChange={onInputChange}
              />
              {!archivo ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
                  <p style={{ fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                    {arrastrando ? 'Suelta el archivo aquí' : 'Arrastra tu archivo aquí'}
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.2rem' }}>
                    o haz clic para seleccionar
                  </p>
                  <span style={{ padding: '0.4rem 1rem', background: '#e5e7eb', borderRadius: '20px', fontSize: '0.85rem', color: '#374151' }}>
                    .xlsx · .xls · .csv
                  </span>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '0.8rem' }}>
                    {archivo.name.endsWith('.csv') ? '📄' : '📊'}
                  </div>
                  <p style={{ fontWeight: 700, color: '#1f2937', marginBottom: '0.3rem' }}>
                    {archivo.name}
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                    {formatBytes(archivo.size)}
                  </p>
                </>
              )}
            </div>

            {/* Progress bar */}
            {cargando && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.4rem' }}>
                  <span>Importando…</span>
                  <span>{progreso}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progreso}%`, background: 'linear-gradient(90deg,#667eea,#764ba2)', borderRadius: '4px', transition: 'width 0.3s' }} />
                </div>
              </div>
            )}

            {/* Result */}
            {resultado && !cargando && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                borderRadius: '8px',
                background: resultado.errores > 0 ? '#fffbeb' : '#f0fdf4',
                border: `1px solid ${resultado.errores > 0 ? '#fde68a' : '#bbf7d0'}`,
              }}>
                <p style={{ fontWeight: 700, color: resultado.errores > 0 ? '#92400e' : '#065f46', marginBottom: '0.3rem' }}>
                  {resultado.errores > 0 ? '⚠️' : '✅'} {resultado.mensaje}
                </p>
                <p style={{ fontSize: '0.88rem', color: '#4b5563' }}>
                  {resultado.importados} accidentes importados
                  {resultado.errores > 0 ? ` · ${resultado.errores} error${resultado.errores !== 1 ? 'es' : ''}` : ''}
                </p>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.5rem' }}>
              {archivo && (
                <>
                  <button
                    className="btn-enviar-crashmap"
                    style={{ flex: 2 }}
                    onClick={importar}
                    disabled={cargando}
                  >
                    {cargando ? '⏳ Importando…' : '📤 Importar Archivo'}
                  </button>
                  <button
                    className="btn-cancelar-crashmap"
                    style={{ flex: 1 }}
                    onClick={limpiar}
                    disabled={cargando}
                  >
                    Limpiar
                  </button>
                </>
              )}
              {!archivo && (
                <button
                  className="btn-enviar-crashmap"
                  style={{ width: '100%' }}
                  onClick={() => inputRef.current?.click()}
                >
                  📁 Seleccionar Archivo
                </button>
              )}
            </div>
          </div>

          {/* Preview table */}
          {previsualizacion.length > 0 && (
            <div className="stats-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.1rem' }}>👁️</span>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                  Vista Previa (primeras {previsualizacion.length} filas)
                </h3>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {previewHeaders.map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.8rem', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previsualizacion.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        {previewHeaders.map(h => (
                          <td key={h} style={{ padding: '0.6rem 0.8rem', color: '#1f2937', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row[h] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload history */}
          {historial.length > 0 && (
            <div className="stats-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span>📜</span>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937' }}>
                  Historial de Importaciones
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                {historial.slice(0, 8).map((n, i) => (
                  <div key={n.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem', background: '#f9fafb', borderRadius: '8px' }}>
                    <span style={{ fontSize: '1.3rem' }}>📊</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1f2937', marginBottom: '0.2rem' }}>
                        {n.titulo || n.title || 'Importación'}
                      </p>
                      <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        {n.mensaje || n.message || ''}
                      </p>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                      {n.created_at ? new Date(n.created_at).toLocaleDateString('es-CO') : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ══ Instructions panel ══════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Template download */}
          <div className="stats-card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.8rem' }}>
              Plantilla de Ejemplo
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#6b7280', marginBottom: '1rem', lineHeight: 1.5 }}>
              Descarga la plantilla CSV con el formato correcto y 2 filas de ejemplo.
            </p>
            <button
              className="btn-enviar-crashmap"
              style={{ width: '100%' }}
              onClick={descargarPlantillaCSV}
            >
              📥 Descargar Plantilla Excel
            </button>
          </div>

          {/* Column reference */}
          <div className="stats-card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
              Formato Requerido
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={thStyle}>Columna</th>
                    <th style={thStyle}>Tipo</th>
                    <th style={thStyle}>Req.</th>
                    <th style={thStyle}>Ejemplo</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMNAS_INFO.map(col => (
                    <tr key={col.nombre} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={tdStyle}>
                        <code style={{ background: '#f3f4f6', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', color: '#4f46e5' }}>
                          {col.nombre}
                        </code>
                      </td>
                      <td style={tdStyle}>{col.tipo}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {col.requerido
                          ? <span style={{ color: '#22c55e', fontWeight: 700 }}>✅</span>
                          : <span style={{ color: '#9ca3af' }}>—</span>
                        }
                      </td>
                      <td style={{ ...tdStyle, color: '#6b7280', fontSize: '0.78rem' }}>{col.ejemplo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tips */}
          <div className="stats-card" style={{ background: '#eef2ff', border: '1px solid #c7d2fe' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#3730a3', marginBottom: '0.8rem' }}>
              💡 Consejos
            </h3>
            <ul style={{ paddingLeft: '1.2rem', color: '#4338ca', fontSize: '0.85rem', lineHeight: 1.8 }}>
              <li>Las coordenadas deben estar en formato decimal (WGS84).</li>
              <li>La fecha debe ser <code>YYYY-MM-DD HH:MM</code>.</li>
              <li>Los valores de <em>gravedad</em> solo pueden ser: leve, grave o fatal.</li>
              <li>El archivo puede tener hasta 10 000 filas por carga.</li>
              <li>Las columnas sin valor dejarán el campo en blanco.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── style helpers ─────────────────────────────────────────────────────────────
const thStyle = {
  padding: '0.6rem 0.5rem',
  textAlign: 'left',
  fontWeight: 700,
  color: '#374151',
  borderBottom: '2px solid #e5e7eb',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '0.55rem 0.5rem',
  color: '#1f2937',
  verticalAlign: 'top',
};
