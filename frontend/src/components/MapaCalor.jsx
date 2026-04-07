import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';
import { useToast } from '../hooks/useToast';
import Toast from './Toast';
// leaflet.heat MUST be loaded with require() after all ES imports
// eslint-disable-next-line import/first
require('leaflet.heat');

const CARTAGENA_CENTER = [10.3910, -75.4794];

// Polígono simplificado de tierra de Cartagena (lng, lat) — igual al del backend
const CARTAGENA_POLIGONO_TIERRA = [
  [-75.5510, 10.3820], [-75.5510, 10.3870], [-75.5480, 10.3920],
  [-75.5430, 10.3960], [-75.5400, 10.4020], [-75.5350, 10.4050],
  [-75.5280, 10.4080], [-75.5200, 10.4050], [-75.5150, 10.4000],
  [-75.5100, 10.3950], [-75.5050, 10.3900], [-75.4980, 10.3850],
  [-75.4900, 10.3800], [-75.4820, 10.3750], [-75.4750, 10.3720],
  [-75.4680, 10.3700], [-75.4600, 10.3690], [-75.4550, 10.3710],
  [-75.4500, 10.3750], [-75.4450, 10.3800], [-75.4400, 10.3860],
  [-75.4350, 10.3920], [-75.4300, 10.4000], [-75.4280, 10.4100],
  [-75.4350, 10.4200], [-75.4400, 10.4280], [-75.4500, 10.4350],
  [-75.4600, 10.4420], [-75.4700, 10.4480], [-75.4800, 10.4550],
  [-75.4900, 10.4600], [-75.5000, 10.4580], [-75.5100, 10.4550],
  [-75.5150, 10.4480], [-75.5200, 10.4380], [-75.5300, 10.4300],
  [-75.5400, 10.4260], [-75.5480, 10.4200], [-75.5510, 10.4100],
  [-75.5500, 10.4000], [-75.5480, 10.3920], [-75.5510, 10.3820],
];

/**
 * Ray-casting point-in-polygon. Polígono en formato [[lng, lat], ...]
 * Prueba el punto original más 8 desplazamientos de ~600m para buffer costero.
 */
function coordEnTierra(lat, lng) {
  const BUF = 0.006;
  const poly = CARTAGENA_POLIGONO_TIERRA;

  function dentroDePoligono(plat, plng) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const lngi = poly[i][0], lati = poly[i][1];
      const lngj = poly[j][0], latj = poly[j][1];
      const intersect =
        ((lati > plat) !== (latj > plat)) &&
        plng < ((lngj - lngi) * (plat - lati)) / (latj - lati) + lngi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Probar punto + 8 desplazamientos para simular buffer costero
  const offsets = [
    [0, 0], [BUF, 0], [-BUF, 0], [0, BUF], [0, -BUF],
    [BUF, BUF], [-BUF, BUF], [BUF, -BUF], [-BUF, -BUF],
  ];
  return offsets.some(([dlat, dlng]) => dentroDePoligono(lat + dlat, lng + dlng));
}

const FORM_INICIAL = {
  latitud: 10.3910,
  longitud: -75.4794,
  barrio: '',
  fecha_hora: new Date().toISOString().slice(0, 16),
  gravedad: 'leve',
  tipo_vehiculo: 'automovil',
  clima: 'soleado',
  estado_via: 'bueno',
  dia_festivo: false,
  hora_pico: false,
  descripcion: '',
};

const meses = [
  { nombre: 'Feb', valor: 2, barras: 1 },
  { nombre: 'Mar', valor: 3, barras: 2 },
  { nombre: 'Abr', valor: 4, barras: 3 },
  { nombre: 'May', valor: 5, barras: 4 },
  { nombre: 'Jun', valor: 6, barras: 5 },
  { nombre: 'Jul', valor: 7, barras: 2 },
  { nombre: 'Ago', valor: 8, barras: 4 },
  { nombre: 'Sep', valor: 9, barras: 2 },
];

const causas = [
  { nombre: 'Exceso velocidad', valor: 38, color: '#ef4444' },
  { nombre: 'Imprudencia', valor: 28, color: '#f59e0b' },
  { nombre: 'Alcohol', valor: 19, color: '#eab308' },
  { nombre: 'Otros', valor: 13, color: '#3b82f6' },
];

const MapaCalor = ({ token }) => {
  const mapRef = useRef(null);
  const mapaRef = useRef(null);
  const heatLayerRef = useRef(null);
  const seleccionandoRef = useRef(false);
  const markerSeleccionRef = useRef(null);

  const [accidentes, setAccidentes] = useState([]);
  const [estadisticas, setEstadisticas] = useState({ total: 0, fatales: 0, graves: 0, leves: 0 });
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [seleccionandoEnMapa, setSeleccionandoEnMapa] = useState(false);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [busquedaDireccion, setBusquedaDireccion] = useState('');
  const [sugerenciasDireccion, setSugerenciasDireccion] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mesSeleccionado, setMesSeleccionado] = useState(null);
  const [tabStats, setTabStats] = useState('estadisticas');
  const [mostrarClusters, setMostrarClusters] = useState(false);
  const [puntosNegros, setPuntosNegros] = useState([]);
  const clusterLayersRef = useRef([]);

  const { toasts, removeToast, toast } = useToast();

  // ─── Geocoding ─────────────────────────────────────────────────────────────
  const buscarDireccion = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setSugerenciasDireccion([]);
      return;
    }
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query + ' Cartagena Colombia'
        )}&limit=5&countrycodes=co&viewbox=-75.60,10.30,-75.40,10.50&bounded=1`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await response.json();
      setSugerenciasDireccion(data);
    } catch (e) {
      // silently fail — no internet geocoding is non-critical
    }
  }, []);

  const seleccionarSugerencia = useCallback((sug) => {
    const lat = parseFloat(parseFloat(sug.lat).toFixed(6));
    const lng = parseFloat(parseFloat(sug.lon).toFixed(6));
    setFormData((prev) => ({
      ...prev,
      latitud: lat,
      longitud: lng,
      barrio: sug.display_name,
    }));
    setBusquedaDireccion(sug.display_name.split(',')[0]);
    setSugerenciasDireccion([]);

    // Pan map to selected location and show a temporary marker
    if (mapaRef.current) {
      mapaRef.current.setView([lat, lng], 16);
      colocarMarkerSeleccion([lat, lng]);
    }
  }, []);

  // ─── Temporary selection marker ────────────────────────────────────────────
  const colocarMarkerSeleccion = useCallback((latlng) => {
    if (markerSeleccionRef.current) {
      markerSeleccionRef.current.remove();
      markerSeleccionRef.current = null;
    }
    if (!mapaRef.current) return;
    markerSeleccionRef.current = L.circleMarker(latlng, {
      radius: 10,
      fillColor: '#6366f1',
      color: '#fff',
      weight: 3,
      fillOpacity: 1,
    })
      .bindPopup('Ubicación seleccionada')
      .addTo(mapaRef.current)
      .openPopup();
  }, []);

  // ─── Map initialisation ────────────────────────────────────────────────────
  useEffect(() => {
    if (mapaRef.current || !mapRef.current) return;

    mapaRef.current = L.map(mapRef.current, { zoomControl: false }).setView(
      CARTAGENA_CENTER,
      13
    );

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(mapaRef.current);

    L.control.zoom({ position: 'topright' }).addTo(mapaRef.current);

    // Map click handler — uses ref to avoid stale closure
    mapaRef.current.on('click', (e) => {
      if (!seleccionandoRef.current) return;
      const lat = parseFloat(e.latlng.lat.toFixed(6));
      const lng = parseFloat(e.latlng.lng.toFixed(6));
      setFormData((prev) => ({ ...prev, latitud: lat, longitud: lng }));
      setSeleccionandoEnMapa(false);
      seleccionandoRef.current = false;
      colocarMarkerSeleccion([lat, lng]);
      mapaRef.current.getContainer().style.cursor = '';
      // Re-open the report modal after the point was selected
      setMostrarFormulario(true);
    });

    cargarDatos();

    return () => {
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync seleccionandoEnMapa state → ref and cursor
  useEffect(() => {
    seleccionandoRef.current = seleccionandoEnMapa;
    if (mapaRef.current) {
      mapaRef.current.getContainer().style.cursor = seleccionandoEnMapa
        ? 'crosshair'
        : '';
    }
  }, [seleccionandoEnMapa]);

  // ─── Data loading ──────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const data = await api.get('/api/accidentes');
      setAccidentes(data);
      calcularEstadisticas(data);
      actualizarHeatmap(data);
    } catch (error) {
      toast.error('Error cargando accidentes: ' + error.message);
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calcularEstadisticas = (data) => {
    setEstadisticas({
      total: data.length,
      fatales: data.filter((a) => a.gravedad === 'fatal').length,
      graves: data.filter((a) => a.gravedad === 'grave').length,
      leves: data.filter((a) => a.gravedad === 'leve').length,
    });
  };

  const actualizarHeatmap = (data) => {
    if (!mapaRef.current) return;

    if (heatLayerRef.current) {
      mapaRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    const pesoGravedad = { fatal: 1.0, grave: 0.7, leve: 0.4 };
    const puntos = data
      .filter((a) => a.latitud && a.longitud)
      .map((a) => [
        parseFloat(a.latitud),
        parseFloat(a.longitud),
        pesoGravedad[a.gravedad] || 0.5,
      ]);

    if (puntos.length === 0) return;

    // Retry until the map container has non-zero height, then add the heat layer.
    // The canvas height-0 error happens when CSS layout hasn't settled yet.
    const addLayer = () => {
      if (!mapaRef.current) return;
      const container = mapaRef.current.getContainer();
      if (!container || container.clientHeight === 0 || container.clientWidth === 0) {
        setTimeout(addLayer, 150);
        return;
      }
      try {
        mapaRef.current.invalidateSize({ animate: false, pan: false });
        heatLayerRef.current = L.heatLayer(puntos, {
          radius: 30,
          blur: 20,
          maxZoom: 17,
          max: 1.0,
          gradient: {
            0.4: '#1e40af',
            0.6: '#f59e0b',
            0.8: '#ef4444',
            1.0: '#dc2626',
          },
        }).addTo(mapaRef.current);
      } catch (e) {
        // Leaflet canvas not ready yet — retry
        setTimeout(addLayer, 150);
      }
    };

    requestAnimationFrame(addLayer);
  };

  // ─── Clustering / Puntos Negros ────────────────────────────────────────────
  const toggleClusters = useCallback(async () => {
    if (mostrarClusters) {
      // Remove cluster layers
      clusterLayersRef.current.forEach(l => l.remove());
      clusterLayersRef.current = [];
      setMostrarClusters(false);
      return;
    }
    try {
      const data = await api.get('/api/analisis/puntos-negros');
      const clusters = Array.isArray(data) ? data : (data?.clusters || []);
      setPuntosNegros(clusters);
      const layers = clusters.map(c => {
        const lat = c.lat ?? c.latitud ?? c.centroid?.[0];
        const lng = c.lng ?? c.longitud ?? c.centroid?.[1];
        if (!lat || !lng || !mapaRef.current) return null;
        const nivel = c.nivel_peligro || c.peligrosidad || 'medio';
        const color = nivel === 'critico' || nivel === 'alto' ? '#ef4444' : nivel === 'medio' ? '#f59e0b' : '#3b82f6';
        const circle = L.circle([lat, lng], {
          radius: (c.radio_metros || c.radio || 200),
          color,
          fillColor: color,
          fillOpacity: 0.18,
          weight: 2,
        });
        const marker = L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: color,
          color: 'white',
          weight: 2,
          fillOpacity: 1,
        }).bindPopup(`
          <div style="min-width:160px">
            <b>Punto Negro</b><br/>
            Accidentes: <b>${c.total || 0}</b><br/>
            Fatales: <b style="color:#ef4444">${c.fatales || 0}</b> | Graves: <b style="color:#f59e0b">${c.graves || 0}</b><br/>
            Nivel: <b style="text-transform:capitalize">${nivel}</b>
          </div>
        `);
        circle.addTo(mapaRef.current);
        marker.addTo(mapaRef.current);
        return [circle, marker];
      }).flat().filter(Boolean);
      clusterLayersRef.current = layers;
      setMostrarClusters(true);
      toast.info(`${clusters.length} puntos negros identificados`);
    } catch {
      toast.error('No se pudieron cargar los puntos negros');
    }
  }, [mostrarClusters, toast]);

  // ─── PDF Export ────────────────────────────────────────────────────────────
  const exportarPDF = async () => {
    const mapContainer = document.getElementById('mapa-calor-principal');
    if (!mapContainer) {
      toast.error('No se encontró el contenedor del mapa');
      return;
    }
    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(mapContainer, {
        useCORS: true,
        allowTaint: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      pdf.setFontSize(16);
      pdf.text('Mapa de Calor - Accidentalidad Cartagena', 15, 15);
      pdf.setFontSize(10);
      pdf.text(`Generado el ${new Date().toLocaleDateString('es-CO')}`, 15, 22);
      pdf.setFontSize(9);
      pdf.text(
        `Total: ${estadisticas.total} | Fatales: ${estadisticas.fatales} | Graves: ${estadisticas.graves} | Leves: ${estadisticas.leves}`,
        15,
        27
      );
      const imgWidth = 270;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 15, 32, imgWidth, Math.min(imgHeight, 150));
      pdf.save('mapa-calor-cartagena.pdf');
      toast.success('PDF exportado exitosamente');
    } catch (e) {
      toast.error('Error al exportar PDF: ' + e.message);
    }
  };

  // ─── Form submit ───────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    const latVal = parseFloat(formData.latitud);
    const lngVal = parseFloat(formData.longitud);

    if (!coordEnTierra(latVal, lngVal)) {
      toast.error('Las coordenadas están en el mar o fuera de Cartagena. Por favor selecciona una ubicación en tierra.');
      return;
    }

    // Normalise datetime: datetime-local gives "YYYY-MM-DDTHH:MM" (no seconds).
    // Pydantic V2 requires at least seconds, so append ":00" when missing.
    const fechaHoraNorm =
      formData.fecha_hora && formData.fecha_hora.length === 16
        ? formData.fecha_hora + ':00'
        : formData.fecha_hora;

    const payload = {
      ...formData,
      latitud: latVal,
      longitud: lngVal,
      fecha_hora: fechaHoraNorm,
    };

    try {
      // Admins use /api/accidentes, regular users use /api/accidentes/reportar
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
      const endpoint = usuario.es_admin
        ? '/api/accidentes'
        : '/api/accidentes/reportar';
      await api.post(endpoint, payload);
      toast.success(
        usuario.es_admin
          ? 'Accidente registrado correctamente.'
          : 'Reporte enviado. Será revisado por un administrador.'
      );
      cerrarFormulario();
      cargarDatos();
    } catch (error) {
      toast.error('Error al enviar reporte: ' + error.message);
    }
  };

  const cerrarFormulario = () => {
    setMostrarFormulario(false);
    setFormData(FORM_INICIAL);
    setBusquedaDireccion('');
    setSugerenciasDireccion([]);
    setSeleccionandoEnMapa(false);
    seleccionandoRef.current = false;
    if (markerSeleccionRef.current) {
      markerSeleccionRef.current.remove();
      markerSeleccionRef.current = null;
    }
    if (mapaRef.current) {
      mapaRef.current.getContainer().style.cursor = '';
    }
  };

  const activarSeleccionEnMapa = () => {
    setSeleccionandoEnMapa(true);
    seleccionandoRef.current = true;
    // Hide modal temporarily so the map is fully accessible
    setMostrarFormulario(false);
  };

  const mesActual = new Date().getMonth() + 1;
  const accidentesMesActual = accidentes.filter((a) => {
    if (!a.fecha_hora) return false;
    const mes = new Date(a.fecha_hora).getMonth() + 1;
    return mes === mesActual;
  }).length;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="crashmap-layout" id="mapa-calor-principal">
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* ── Left sidebar: month timeline ── */}
      <div className="crashmap-sidebar-left">
        <div className="crashmap-logo">
          <div className="logo-icon">🚗</div>
          <div className="logo-text">CRASHMAP</div>
        </div>

        <div className="timeline-meses">
          {meses.map((mes, idx) => (
            <div
              key={idx}
              className={`mes-item ${mesSeleccionado === mes.valor ? 'active' : ''}`}
              onClick={() =>
                setMesSeleccionado(mesSeleccionado === mes.valor ? null : mes.valor)
              }
              title={`Filtrar por ${mes.nombre}`}
            >
              <div className="mes-barras">
                {[...Array(mes.barras)].map((_, i) => (
                  <div key={i} className={`barra barra-${i}`}></div>
                ))}
              </div>
              <span className="mes-nombre">{mes.nombre}</span>
            </div>
          ))}
        </div>

        <button
          className={`btn-export-pdf${mostrarClusters ? ' active' : ''}`}
          onClick={toggleClusters}
          title="Mostrar/ocultar puntos negros (clusters)"
          style={{ background: mostrarClusters ? 'linear-gradient(135deg,#ef4444,#dc2626)' : undefined, color: mostrarClusters ? 'white' : undefined }}
        >
          <span>🚨</span>
          <span>Puntos Negros</span>
        </button>
        <button className="btn-export-pdf" onClick={exportarPDF} title="Exportar mapa como PDF">
          <span>📥</span>
          <span>PDF</span>
        </button>
      </div>

      {/* ── Central map area ── */}
      <div className="crashmap-main" style={{ position: 'relative' }}>
        {/* Loading overlay */}
        {cargando && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,23,42,0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
              color: '#e2e8f0',
              gap: '1rem',
            }}
          >
            <div className="spinner" style={{ borderTopColor: '#6366f1' }}></div>
            <p style={{ fontWeight: 600 }}>Cargando mapa de calor...</p>
          </div>
        )}

        {/* Selection mode overlay banner */}
        {seleccionandoEnMapa && (
          <div
            style={{
              position: 'absolute',
              top: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(99,102,241,0.95)',
              color: 'white',
              padding: '0.8rem 2rem',
              borderRadius: '25px',
              zIndex: 1500,
              fontWeight: 600,
              boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.8rem',
            }}
          >
            <span>📍</span>
            <span>Haz clic en el mapa para seleccionar la ubicación</span>
            <button
              onClick={() => {
                setSeleccionandoEnMapa(false);
                seleccionandoRef.current = false;
                if (mapaRef.current)
                  mapaRef.current.getContainer().style.cursor = '';
                // Re-open the report modal when cancelling selection
                setMostrarFormulario(true);
              }}
              style={{
                marginLeft: '0.5rem',
                background: 'rgba(255,255,255,0.25)',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                padding: '0.2rem 0.6rem',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Leaflet map */}
        <div ref={mapRef} className="mapa-crashmap"></div>

        {/* Heatmap legend */}
        <div
          style={{
            position: 'absolute',
            bottom: '2.5rem',
            left: '1rem',
            zIndex: 1000,
            background: 'rgba(15,23,42,0.85)',
            borderRadius: '10px',
            padding: '0.8rem 1rem',
            color: '#e2e8f0',
            fontSize: '0.75rem',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#a5b4fc' }}>
            Intensidad
          </div>
          {[
            { label: 'Baja', color: '#1e40af' },
            { label: 'Media', color: '#f59e0b' },
            { label: 'Alta', color: '#ef4444' },
            { label: 'Crítica', color: '#dc2626' },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.3rem',
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: item.color,
                  flexShrink: 0,
                }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Attribution bar */}
        <div className="map-header" style={{ zIndex: 900 }}>
          <span className="map-location">
            © OpenStreetMap contributors © CARTO
          </span>
        </div>

        {/* Report button */}
        <button
          className="btn-reportar-flotante"
          onClick={() => setMostrarFormulario(true)}
          style={{ zIndex: 1000 }}
        >
          <span>➕</span>
          <span>Reportar Accidente</span>
        </button>
      </div>

      {/* ── Right sidebar: stats ── */}
      <div className="crashmap-sidebar-right">
       <div className="crashmap-sidebar-right-inner">
        <div className="stats-tabs-container">
          <button
            className={`stat-tab${tabStats === 'estadisticas' ? ' active' : ''}`}
            onClick={() => setTabStats('estadisticas')}
          >
            <span>🚗</span> Estadísticas
          </button>
          <button
            className={`stat-tab${tabStats === 'causas' ? ' active' : ''}`}
            onClick={() => setTabStats('causas')}
          >
            <span>📊</span> Causas
          </button>
        </div>

        {tabStats === 'estadisticas' && (
          <>
            {/* Main stats card */}
            <div className="stats-card">
              <div className="stats-header">
                <div className="stats-icon-circle">🚗</div>
                <span className="stats-title">Accidentes registrados</span>
              </div>
              <div className="stats-grid-main">
                <div className="stat-box">
                  <div className="stat-number" style={{ color: '#1f2937' }}>{estadisticas.total}</div>
                  <div className="stat-label">Total</div>
                </div>
                <div className="stat-box" style={{ background: '#fef2f2' }}>
                  <div className="stat-number" style={{ color: '#dc2626' }}>{estadisticas.fatales}</div>
                  <div className="stat-label">Fatales</div>
                </div>
                <div className="stat-box" style={{ background: '#fffbeb' }}>
                  <div className="stat-number" style={{ color: '#d97706' }}>{estadisticas.graves}</div>
                  <div className="stat-label">Graves</div>
                </div>
                <div className="stat-box" style={{ background: '#f0fdf4' }}>
                  <div className="stat-number" style={{ color: '#16a34a' }}>{estadisticas.leves}</div>
                  <div className="stat-label">Leves</div>
                </div>
              </div>
            </div>

            {/* Este mes */}
            <div className="stats-card">
              <div className="stats-header">
                <div className="stats-icon-circle" style={{ background: '#0ea5e9' }}>📅</div>
                <span className="stats-title">Este mes</span>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem', background: '#f0f9ff', borderRadius: '8px' }}>
                <div className="stat-number" style={{ fontSize: '2.5rem', color: '#0369a1' }}>
                  {accidentesMesActual}
                </div>
                <div className="stat-label">accidentes este mes</div>
              </div>
            </div>

            {/* Tasa de gravedad */}
            {estadisticas.total > 0 && (
              <div className="stats-card">
                <div className="stats-header">
                  <div className="stats-icon-circle" style={{ background: '#7c3aed' }}>📈</div>
                  <span className="stats-title">Tasa de gravedad</span>
                </div>
                {[
                  { label: 'Leve', val: estadisticas.leves, color: '#22c55e' },
                  { label: 'Grave', val: estadisticas.graves, color: '#f59e0b' },
                  { label: 'Fatal', val: estadisticas.fatales, color: '#ef4444' },
                ].map(item => {
                  const pct = estadisticas.total > 0 ? Math.round((item.val / estadisticas.total) * 100) : 0;
                  return (
                    <div key={item.label} style={{ marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: '#374151', fontWeight: 600 }}>{item.label}</span>
                        <span style={{ color: '#6b7280' }}>{item.val} ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: item.color, borderRadius: 3, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tabStats === 'causas' && (
          <>
            {/* Causas derivadas de los datos reales */}
            <div className="stats-card">
              <div className="stats-header">
                <div className="stats-icon-circle" style={{ background: '#10b981' }}>✓</div>
                <span className="stats-title">Causas frecuentes</span>
              </div>
              <div className="causas-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                <div className="causas-lista-crashmap">
                  {causas.map((causa, idx) => (
                    <div key={idx} className="causa-item-crashmap">
                      <div className="causa-barra-container">
                        <div className="causa-barra-fill" style={{ width: `${causa.valor}%`, background: causa.color }} />
                      </div>
                      <div className="causa-info-row">
                        <span className="causa-nombre-crashmap">{causa.nombre}</span>
                        <span className="causa-valor">{causa.valor}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Por tipo de vehículo (de los datos reales) */}
            <div className="stats-card">
              <div className="stats-header">
                <div className="stats-icon-circle" style={{ background: '#f59e0b' }}>🏍️</div>
                <span className="stats-title">Por vehículo</span>
              </div>
              {(() => {
                const vehiculos = accidentes.reduce((acc, a) => {
                  const v = a.tipo_vehiculo || 'otro';
                  acc[v] = (acc[v] || 0) + 1;
                  return acc;
                }, {});
                const sorted = Object.entries(vehiculos).sort((a, b) => b[1] - a[1]).slice(0, 5);
                const maxV = sorted[0]?.[1] || 1;
                const colores = ['#667eea', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4'];
                return sorted.map(([v, count], i) => (
                  <div key={v} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                      <span style={{ color: '#374151', fontWeight: 600, textTransform: 'capitalize' }}>{v}</span>
                      <span style={{ color: '#6b7280' }}>{count}</span>
                    </div>
                    <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${(count / maxV) * 100}%`, background: colores[i] || '#94a3b8', borderRadius: 3 }} />
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Por condición climática */}
            <div className="stats-card">
              <div className="stats-header">
                <div className="stats-icon-circle" style={{ background: '#0ea5e9' }}>🌦️</div>
                <span className="stats-title">Por clima</span>
              </div>
              {(() => {
                const climas = accidentes.reduce((acc, a) => {
                  const c = a.clima || 'desconocido';
                  acc[c] = (acc[c] || 0) + 1;
                  return acc;
                }, {});
                const sorted = Object.entries(climas).sort((a, b) => b[1] - a[1]);
                const maxC = sorted[0]?.[1] || 1;
                const emojiClima = { soleado: '☀️', nublado: '☁️', lluvia: '🌧️', desconocido: '❓' };
                return sorted.map(([c, count]) => (
                  <div key={c} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                      <span style={{ color: '#374151', fontWeight: 600 }}>{emojiClima[c] || '🌡️'} {c}</span>
                      <span style={{ color: '#6b7280' }}>{count}</span>
                    </div>
                    <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${(count / maxC) * 100}%`, background: '#60a5fa', borderRadius: 3 }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </>
        )}
       </div>{/* crashmap-sidebar-right-inner */}
      </div>

      {/* ── Report form modal ── */}
      {mostrarFormulario && (
        <div
          className="modal-overlay-crashmap"
          onClick={cerrarFormulario}
        >
          <div
            className="modal-crashmap"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-crashmap">
              <h2>📝 Reportar Nuevo Accidente</h2>
              <button
                className="btn-cerrar-crashmap"
                onClick={cerrarFormulario}
                aria-label="Cerrar formulario"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="form-crashmap">
              {/* Location section */}
              <div className="form-section">
                <h3>📍 Ubicación</h3>

                {/* Geocoding search */}
                <div
                  className="form-group-crashmap"
                  style={{ position: 'relative', marginBottom: '0.8rem' }}
                >
                  <label>Buscar lugar</label>
                  <input
                    type="text"
                    value={busquedaDireccion}
                    onChange={(e) => {
                      setBusquedaDireccion(e.target.value);
                      buscarDireccion(e.target.value);
                    }}
                    placeholder="Escribe una dirección o barrio en Cartagena..."
                    autoComplete="off"
                  />
                  {sugerenciasDireccion.length > 0 && (
                    <ul
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '2px solid #6366f1',
                        borderRadius: '8px',
                        zIndex: 3000,
                        maxHeight: '200px',
                        overflowY: 'auto',
                        listStyle: 'none',
                        margin: 0,
                        padding: 0,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      }}
                    >
                      {sugerenciasDireccion.map((sug, idx) => (
                        <li
                          key={idx}
                          onClick={() => seleccionarSugerencia(sug)}
                          style={{
                            padding: '0.7rem 1rem',
                            cursor: 'pointer',
                            borderBottom:
                              idx < sugerenciasDireccion.length - 1
                                ? '1px solid #e5e7eb'
                                : 'none',
                            fontSize: '0.85rem',
                            color: '#374151',
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = '#eef2ff')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = 'white')
                          }
                        >
                          📍 {sug.display_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Lat/lng row */}
                <div className="form-row">
                  <div className="form-group-crashmap">
                    <label>Latitud</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.latitud}
                      onChange={(e) =>
                        setFormData({ ...formData, latitud: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group-crashmap">
                    <label>Longitud</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.longitud}
                      onChange={(e) =>
                        setFormData({ ...formData, longitud: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>

                {/* Barrio */}
                <div
                  className="form-group-crashmap"
                  style={{ marginBottom: '0.8rem' }}
                >
                  <label>Barrio / Sector</label>
                  <input
                    type="text"
                    value={formData.barrio}
                    onChange={(e) =>
                      setFormData({ ...formData, barrio: e.target.value })
                    }
                    placeholder="Ej: Bocagrande, Manga, Centro..."
                  />
                </div>

                {/* Click on map toggle */}
                <button
                  type="button"
                  className="btn-seleccionar-mapa"
                  style={
                    seleccionandoEnMapa
                      ? {
                          background: '#6366f1',
                          color: 'white',
                          borderStyle: 'solid',
                        }
                      : {}
                  }
                  onClick={() => {
                    if (seleccionandoEnMapa) {
                      setSeleccionandoEnMapa(false);
                      seleccionandoRef.current = false;
                      if (mapaRef.current)
                        mapaRef.current.getContainer().style.cursor = '';
                    } else {
                      activarSeleccionEnMapa();
                    }
                  }}
                >
                  {seleccionandoEnMapa
                    ? '✋ Cancelar selección en mapa'
                    : '📍 Seleccionar en el mapa'}
                </button>

                {(formData.latitud !== FORM_INICIAL.latitud ||
                  formData.longitud !== FORM_INICIAL.longitud) && (() => {
                  const enTierra = coordEnTierra(
                    parseFloat(formData.latitud),
                    parseFloat(formData.longitud)
                  );
                  return (
                    <div
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem 0.8rem',
                        background: enTierra ? '#f0fdf4' : '#fef2f2',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: enTierra ? '#16a34a' : '#dc2626',
                        fontWeight: 600,
                        border: enTierra ? '1px solid #bbf7d0' : '1px solid #fca5a5',
                      }}
                    >
                      {enTierra
                        ? `✓ Ubicación en tierra: ${parseFloat(formData.latitud).toFixed(5)}, ${parseFloat(formData.longitud).toFixed(5)}`
                        : '⚠️ Coordenadas en el mar o fuera de Cartagena. Selecciona una ubicación en tierra.'}
                    </div>
                  );
                })()}
              </div>

              {/* Incident details section */}
              <div className="form-section">
                <h3>📅 Detalles del Incidente</h3>
                <div className="form-row">
                  <div className="form-group-crashmap">
                    <label>Fecha y Hora</label>
                    <input
                      type="datetime-local"
                      value={formData.fecha_hora}
                      onChange={(e) =>
                        setFormData({ ...formData, fecha_hora: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group-crashmap">
                    <label>Gravedad</label>
                    <select
                      value={formData.gravedad}
                      onChange={(e) =>
                        setFormData({ ...formData, gravedad: e.target.value })
                      }
                    >
                      <option value="leve">Leve (solo daños)</option>
                      <option value="grave">Grave (con heridos)</option>
                      <option value="fatal">Fatal</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group-crashmap">
                    <label>Tipo de Vehículo</label>
                    <select
                      value={formData.tipo_vehiculo}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tipo_vehiculo: e.target.value,
                        })
                      }
                    >
                      <option value="automovil">Automóvil</option>
                      <option value="moto">Motocicleta</option>
                      <option value="bus">Bus</option>
                      <option value="camion">Camión</option>
                      <option value="bicicleta">Bicicleta</option>
                      <option value="peatón">Peatón</option>
                    </select>
                  </div>
                  <div className="form-group-crashmap">
                    <label>Condiciones Climáticas</label>
                    <select
                      value={formData.clima}
                      onChange={(e) =>
                        setFormData({ ...formData, clima: e.target.value })
                      }
                    >
                      <option value="soleado">Soleado</option>
                      <option value="nublado">Nublado</option>
                      <option value="lluvia">Lluvia</option>
                      <option value="niebla">Niebla</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group-crashmap">
                    <label>Estado de la Vía</label>
                    <select
                      value={formData.estado_via}
                      onChange={(e) =>
                        setFormData({ ...formData, estado_via: e.target.value })
                      }
                    >
                      <option value="bueno">Bueno</option>
                      <option value="regular">Regular</option>
                      <option value="malo">Malo</option>
                    </select>
                  </div>
                  <div className="form-group-crashmap checkboxes">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.dia_festivo}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            dia_festivo: e.target.checked,
                          })
                        }
                      />
                      <span>Día festivo</span>
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.hora_pico}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            hora_pico: e.target.checked,
                          })
                        }
                      />
                      <span>Hora pico</span>
                    </label>
                  </div>
                </div>

                <div className="form-group-crashmap">
                  <label>Descripción</label>
                  <textarea
                    value={formData.descripcion}
                    onChange={(e) =>
                      setFormData({ ...formData, descripcion: e.target.value })
                    }
                    rows={4}
                    placeholder="Describe lo que sucedió, vehículos involucrados, circunstancias..."
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-cancelar-crashmap"
                  onClick={cerrarFormulario}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-enviar-crashmap">
                  📤 Enviar Reporte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapaCalor;
