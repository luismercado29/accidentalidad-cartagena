import React, { useState, useRef } from 'react';

// QR generation using a free public API (no npm package needed)
const QR_API = 'https://api.qrserver.com/v1/create-qr-code/';

const TIPOS_QR = [
  {
    id: 'reporte',
    label: 'Enlace de Reporte',
    icon: '📍',
    descripcion: 'QR para que los ciudadanos reporten accidentes',
    getUrl: (base) => `${base}/#reportar`,
  },
  {
    id: 'mapa',
    label: 'Mapa de Calor',
    icon: '🔥',
    descripcion: 'QR para ver el mapa de accidentalidad',
    getUrl: (base) => `${base}/mapa`,
  },
  {
    id: 'estadisticas',
    label: 'Panel Público',
    icon: '📊',
    descripcion: 'QR para ver las estadísticas públicas',
    getUrl: (base) => `${base}/publico`,
  },
  {
    id: 'custom',
    label: 'URL Personalizada',
    icon: '🔗',
    descripcion: 'Genera un QR con cualquier URL',
    getUrl: (base, custom) => custom || base,
  },
];

export default function QRReporte({ usuario, token, toast }) {
  const [tipoSeleccionado, setTipoSeleccionado] = useState('reporte');
  const [urlBase, setUrlBase]   = useState(window.location.origin);
  const [urlCustom, setUrlCustom] = useState('');
  const [tamano, setTamano]     = useState(300);
  const [colorFondo]            = useState('ffffff');
  const [colorFrente, setColorFrente] = useState('1f2937');
  const [, setGenerado] = useState(false);
  const imgRef = useRef(null);

  const tipoActual = TIPOS_QR.find(t => t.id === tipoSeleccionado);
  const urlFinal = tipoActual?.getUrl(urlBase, urlCustom) || urlBase;
  const qrSrc = `${QR_API}?data=${encodeURIComponent(urlFinal)}&size=${tamano}x${tamano}&bgcolor=${colorFondo}&color=${colorFrente}&format=png&margin=10`;

  function copiarUrl() {
    navigator.clipboard.writeText(urlFinal)
      .then(() => toast.success('URL copiada al portapapeles'))
      .catch(() => toast.error('No se pudo copiar'));
  }

  function descargarQR() {
    const link = document.createElement('a');
    link.href = qrSrc;
    link.download = `crashmap-qr-${tipoSeleccionado}.png`;
    link.target = '_blank';
    link.click();
    toast.success('Descargando código QR…');
  }

  function imprimirQR() {
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>CrashMap QR — ${tipoActual?.label}</title>
      <style>
        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 40px; }
        .title { font-size: 24px; font-weight: bold; margin-bottom: 8px; color: #1f2937; }
        .subtitle { color: #6b7280; margin-bottom: 24px; font-size: 14px; text-align: center; }
        img { margin: 0 auto; display: block; }
        .url { margin-top: 16px; font-size: 12px; color: #9ca3af; word-break: break-all; max-width: 320px; text-align: center; }
        .footer { margin-top: 32px; font-size: 11px; color: #d1d5db; }
      </style></head>
      <body>
        <div class="title">CrashMap Cartagena</div>
        <div class="subtitle">${tipoActual?.descripcion || ''}</div>
        <img src="${qrSrc}" width="${tamano}" height="${tamano}" />
        <div class="url">${urlFinal}</div>
        <div class="footer">Tránsito Cartagena — Sistema de Accidentalidad Vial</div>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1e40af)',
        borderRadius: '12px',
        padding: '1.5rem 2rem',
        color: 'white',
        display: 'flex', alignItems: 'center', gap: '1rem',
      }}>
        <div style={{ fontSize: '2.5rem' }}>📱</div>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Generador de Códigos QR</h2>
          <p style={{ opacity: 0.8, fontSize: '0.88rem' }}>
            Crea QR para compartir CrashMap con la ciudadanía
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        {/* Left: config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

          {/* Tipo de QR */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
              Tipo de Código QR
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {TIPOS_QR.map(tipo => (
                <label
                  key={tipo.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.8rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: `2px solid ${tipoSeleccionado === tipo.id ? '#4f46e5' : '#e5e7eb'}`,
                    background: tipoSeleccionado === tipo.id ? '#eef2ff' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="tipo"
                    value={tipo.id}
                    checked={tipoSeleccionado === tipo.id}
                    onChange={() => { setTipoSeleccionado(tipo.id); setGenerado(false); }}
                    style={{ display: 'none' }}
                  />
                  <span style={{ fontSize: '1.3rem' }}>{tipo.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1f2937' }}>{tipo.label}</div>
                    <div style={{ fontSize: '0.77rem', color: '#6b7280' }}>{tipo.descripcion}</div>
                  </div>
                  {tipoSeleccionado === tipo.id && (
                    <div style={{ color: '#4f46e5', fontSize: '1rem' }}>✓</div>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* URL settings */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
              Configuración
            </h3>

            {tipoSeleccionado !== 'custom' ? (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                  URL base del sistema
                </label>
                <input
                  type="text"
                  value={urlBase}
                  onChange={e => setUrlBase(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.9rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.85rem' }}
                  placeholder="http://localhost:3000"
                />
              </div>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                  URL personalizada
                </label>
                <input
                  type="text"
                  value={urlCustom}
                  onChange={e => setUrlCustom(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.9rem', border: '1.5px solid #e5e7eb', borderRadius: '8px', fontSize: '0.85rem' }}
                  placeholder="https://mi-sitio.com/pagina"
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                  Tamaño (px)
                </label>
                <input
                  type="range" min={150} max={500} step={50}
                  value={tamano}
                  onChange={e => setTamano(+e.target.value)}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '0.78rem', color: '#6b7280', textAlign: 'center' }}>{tamano} × {tamano}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>
                  Color oscuro
                </label>
                <input
                  type="color"
                  value={`#${colorFrente}`}
                  onChange={e => setColorFrente(e.target.value.replace('#', ''))}
                  style={{ width: '100%', height: '36px', borderRadius: '8px', border: '1.5px solid #e5e7eb', cursor: 'pointer' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, marginBottom: '0.2rem' }}>URL del QR:</div>
              <div style={{ fontSize: '0.78rem', color: '#374151', wordBreak: 'break-all' }}>{urlFinal}</div>
            </div>
          </div>
        </div>

        {/* Right: preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flex: 1 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
              Vista Previa
            </h3>

            {/* QR preview */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '1.5rem',
              background: '#f9fafb',
              borderRadius: '12px',
              border: '2px dashed #e5e7eb',
              gap: '1rem',
            }}>
              <img
                ref={imgRef}
                src={qrSrc}
                alt="Código QR"
                style={{ maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}
              />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.9rem' }}>
                  {tipoActual?.icon} {tipoActual?.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>CrashMap Cartagena</div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '1.2rem' }}>
              <button
                onClick={copiarUrl}
                style={{
                  width: '100%', padding: '0.7rem',
                  background: '#f3f4f6', border: '1.5px solid #e5e7eb',
                  borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                📋 Copiar URL
              </button>
              <button
                onClick={descargarQR}
                style={{
                  width: '100%', padding: '0.7rem',
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  border: 'none', borderRadius: '8px',
                  color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                ⬇️ Descargar PNG
              </button>
              <button
                onClick={imprimirQR}
                style={{
                  width: '100%', padding: '0.7rem',
                  background: 'white', border: '1.5px solid #4f46e5',
                  borderRadius: '8px', color: '#4f46e5',
                  cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                }}
              >
                🖨️ Imprimir
              </button>
            </div>
          </div>

          {/* Usage tips */}
          <div style={{ background: '#fffbeb', borderRadius: '12px', padding: '1.2rem', border: '1px solid #fde68a' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e', marginBottom: '0.6rem' }}>
              💡 Usos sugeridos
            </h4>
            <ul style={{ fontSize: '0.8rem', color: '#78350f', margin: 0, paddingLeft: '1.2rem', lineHeight: 1.7 }}>
              <li>Pegarlos en vehículos de tránsito y señales viales</li>
              <li>Distribuir en operativos de seguridad vial</li>
              <li>Incluirlos en materiales de educación vial</li>
              <li>Colocarlos en puntos de alta accidentalidad</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
