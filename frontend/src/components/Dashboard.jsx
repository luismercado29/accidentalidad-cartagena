import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';
Chart.register(...registerables);

// ─── helpers ─────────────────────────────────────────────────────────────────
function gravedadClass(g) {
  const v = (g || '').toLowerCase();
  if (v === 'fatal') return 'gravedad-fatal';
  if (v === 'grave') return 'gravedad-grave';
  return 'gravedad-leve';
}

function estadoBadgeStyle(estado) {
  switch ((estado || '').toLowerCase()) {
    case 'aprobado':  return { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' };
    case 'rechazado': return { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' };
    default:          return { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' };
  }
}

function fuenteBadgeStyle(fuente) {
  switch ((fuente || '').toLowerCase()) {
    case 'excel':   return { background: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' };
    case 'externo': return { background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' };
    default:        return { background: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.3)' };
  }
}

const CARTAGENA_CENTER = [10.3910, -75.4794];

const FORM_VACIO = {
  latitud: 10.3910, longitud: -75.4794,
  barrio: '', fecha_hora: '', gravedad: 'leve', tipo_vehiculo: 'moto',
  clima: 'soleado', estado_via: 'bueno', dia_festivo: false,
  hora_pico: false, descripcion: '', estado: 'pendiente',
};

// ═════════════════════════════════════════════════════════════════════════════
export default function Dashboard({ usuario, token, toast }) {
  // ── state ──────────────────────────────────────────────────────────────────
  const [metricas,          setMetricas]          = useState({});
  const [tendencia,         setTendencia]         = useState([]);
  const [porHora,           setPorHora]           = useState([]);
  const [porBarrio,         setPorBarrio]         = useState([]);
  const [estadisticas,      setEstadisticas]      = useState({});
  const [accidentes,        setAccidentes]        = useState([]);
  const [pendientes,        setPendientes]        = useState([]);
  const [vistaActual,       setVistaActual]       = useState('metricas');
  const [tabReportes,       setTabReportes]       = useState('pendientes');
  const [formAccidente,        setFormAccidente]        = useState(null);
  const [mostrarFormulario,    setMostrarFormulario]    = useState(false);
  const [mostrarMapaSeleccion, setMostrarMapaSeleccion] = useState(false);
  const mapSelDomRef  = useRef(null);   // DOM node for the Leaflet container
  const mapSelInstRef = useRef(null);   // Leaflet map instance
  const mapSelMarker  = useRef(null);   // selection circle marker
  const formAccidenteRef = useRef(null); // always-current copy of formAccidente
  const [filtros, setFiltros] = useState({ busqueda: '', gravedad: '', estado: '', fuente: '', tipo_vehiculo: '', fecha_desde: '', fecha_hasta: '' });
  const [cargando,          setCargando]          = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(new Date());
  const [clima,               setClima]               = useState({ temperatura: 31, descripcion: 'Cielo despejado', humedad: 78, viento_kmh: 15, ciudad: 'Cartagena', simulado: true });
  const [mlEstado,            setMlEstado]             = useState(null);
  const [mlEntrenando,        setMlEntrenando]         = useState(false);
  const [correlaciones,       setCorrelaciones]        = useState(null);
  const [exportando,          setExportando]           = useState(false);

  // ── chart instance refs ────────────────────────────────────────────────────
  const graficoGravedadRef  = useRef(null);
  const graficoClimaRef     = useRef(null);
  const graficoTendenciaRef = useRef(null);
  const graficoHoraRef      = useRef(null);
  const graficoVehiculoRef  = useRef(null);
  const graficoBarrioRef    = useRef(null);

  // ── canvas DOM refs ────────────────────────────────────────────────────────
  const canvasGravedadRef   = useRef(null);
  const canvasClimaRef      = useRef(null);
  const canvasTendenciaRef  = useRef(null);
  const canvasHoraRef       = useRef(null);
  const canvasVehiculoRef   = useRef(null);
  const canvasBarrioRef     = useRef(null);

  // ── data loading ───────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    try {
      const [
        resMetricas, resTendencia, resHora,
        resBarrio,   resAcc,       resPend,
      ] = await Promise.allSettled([
        api.get('/api/metricas/dashboard'),
        api.get('/api/metricas/tendencia-mensual'),
        api.get('/api/metricas/por-hora'),
        api.get('/api/metricas/por-barrio'),
        api.get('/api/accidentes'),
        api.get('/api/reportes/pendientes'),
      ]);

      if (resMetricas.status   === 'fulfilled') setMetricas(resMetricas.value   || {});
      if (resTendencia.status  === 'fulfilled') {
        const v = resTendencia.value;
        setTendencia(Array.isArray(v) ? v : (v?.datos || []));
      }
      if (resHora.status       === 'fulfilled') {
        const v = resHora.value;
        setPorHora(Array.isArray(v) ? v : (v?.datos || []));
      }
      if (resBarrio.status     === 'fulfilled') {
        const v = resBarrio.value;
        setPorBarrio(Array.isArray(v) ? v : (v?.datos || []));
      }
      if (resAcc.status        === 'fulfilled') setAccidentes(Array.isArray(resAcc.value)         ? resAcc.value        : []);
      if (resPend.status       === 'fulfilled') setPendientes(Array.isArray(resPend.value)        ? resPend.value       : []);

      try {
        const ext = await api.get('/api/metricas/estadisticas-completas');
        setEstadisticas(ext || {});
      } catch { /* optional endpoint */ }

      // Load optional extras silently
      Promise.allSettled([
        api.get('/api/clima/actual'),
        api.get('/api/ml/estado'),
        api.get('/api/metricas/correlaciones'),
      ]).then(([rClima, rMl, rCorr]) => {
        if (rClima.status  === 'fulfilled') setClima(rClima.value);
        if (rMl.status     === 'fulfilled') setMlEstado(rMl.value);
        if (rCorr.status   === 'fulfilled') setCorrelaciones(rCorr.value);
      });

      setUltimaActualizacion(new Date());
    } catch {
      toast.error('Error al cargar el dashboard');
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => {
    cargarDatos();
    const iv = setInterval(cargarDatos, 30000);
    return () => clearInterval(iv);
  }, [cargarDatos]);

  // Keep a ref in sync with formAccidente so the map useEffect can read latest coords
  useEffect(() => { formAccidenteRef.current = formAccidente; }, [formAccidente]);

  // ── Leaflet map for coordinate selection ────────────────────────────────────
  useEffect(() => {
    if (!mostrarMapaSeleccion) {
      if (mapSelInstRef.current) {
        mapSelInstRef.current.remove();
        mapSelInstRef.current = null;
        mapSelMarker.current  = null;
      }
      return;
    }
    // Small timeout so the overlay DOM node is painted before Leaflet tries to measure it
    const timer = setTimeout(() => {
      if (!mapSelDomRef.current || mapSelInstRef.current) return;

      const acc   = formAccidenteRef.current;
      const lat   = parseFloat(acc?.latitud)  || CARTAGENA_CENTER[0];
      const lng   = parseFloat(acc?.longitud) || CARTAGENA_CENTER[1];

      mapSelInstRef.current = L.map(mapSelDomRef.current).setView([lat, lng], 14);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(mapSelInstRef.current);

      // Show existing coordinates as initial marker
      mapSelMarker.current = L.circleMarker([lat, lng], {
        radius: 10, fillColor: '#6366f1', color: '#fff', weight: 3, fillOpacity: 1,
      }).bindPopup('Ubicación actual').addTo(mapSelInstRef.current);

      mapSelInstRef.current.on('click', (e) => {
        const clat = parseFloat(e.latlng.lat.toFixed(6));
        const clng = parseFloat(e.latlng.lng.toFixed(6));
        if (mapSelMarker.current) mapSelMarker.current.remove();
        mapSelMarker.current = L.circleMarker([clat, clng], {
          radius: 10, fillColor: '#22c55e', color: '#fff', weight: 3, fillOpacity: 1,
        }).bindPopup('Ubicación seleccionada').addTo(mapSelInstRef.current).openPopup();
        setFormAccidente(prev => ({ ...prev, latitud: clat, longitud: clng }));
      });
    }, 80);

    return () => clearTimeout(timer);
  }, [mostrarMapaSeleccion]);

  // ── charts ─────────────────────────────────────────────────────────────────

  // Gravedad – doughnut
  useEffect(() => {
    if (!canvasGravedadRef.current) return;
    if (graficoGravedadRef.current) graficoGravedadRef.current.destroy();
    const leve  = metricas.por_gravedad?.leve  || 0;
    const grave = metricas.por_gravedad?.grave || 0;
    const fatal = metricas.por_gravedad?.fatal || 0;
    if (leve + grave + fatal === 0) return;
    graficoGravedadRef.current = new Chart(canvasGravedadRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Leve', 'Grave', 'Fatal'],
        datasets: [{
          data: [leve, grave, fatal],
          backgroundColor: ['#22c55e', '#f59e0b', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 10,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 18, font: { size: 13 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } },
        },
      },
    });
    return () => { graficoGravedadRef.current?.destroy(); };
  }, [metricas, vistaActual]);

  // Clima – horizontal bar
  useEffect(() => {
    if (!canvasClimaRef.current) return;
    if (graficoClimaRef.current) graficoClimaRef.current.destroy();
    const climaData = metricas.por_clima || {};
    const labels = Object.keys(climaData);
    if (!labels.length) return;
    graficoClimaRef.current = new Chart(canvasClimaRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Accidentes',
          data: Object.values(climaData),
          backgroundColor: ['#60a5fa', '#94a3b8', '#a78bfa'],
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 12 } } },
          y: { grid: { display: false }, ticks: { font: { size: 13 } } },
        },
      },
    });
    return () => { graficoClimaRef.current?.destroy(); };
  }, [metricas, vistaActual]);

  // Tendencia mensual – area line
  useEffect(() => {
    if (!canvasTendenciaRef.current || !tendencia.length) return;
    if (graficoTendenciaRef.current) graficoTendenciaRef.current.destroy();
    const ctx = canvasTendenciaRef.current.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 260);
    grad.addColorStop(0, 'rgba(102,126,234,0.35)');
    grad.addColorStop(1, 'rgba(102,126,234,0.0)');
    graficoTendenciaRef.current = new Chart(canvasTendenciaRef.current, {
      type: 'line',
      data: {
        labels: tendencia.map(d => d.etiqueta || d.mes || d.label || ''),
        datasets: [{
          label: 'Accidentes',
          data: tendencia.map(d => d.total || d.count || d.value || 0),
          borderColor: '#667eea',
          backgroundColor: grad,
          borderWidth: 2.5,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#667eea',
          pointRadius: 4,
          pointHoverRadius: 7,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 12 } } },
          y: { grid: { color: '#f1f5f9' }, beginAtZero: true, ticks: { font: { size: 12 } } },
        },
      },
    });
    return () => { graficoTendenciaRef.current?.destroy(); };
  }, [tendencia, vistaActual]);

  // Por hora – bar coloured by intensity
  useEffect(() => {
    if (!canvasHoraRef.current || !porHora.length) return;
    if (graficoHoraRef.current) graficoHoraRef.current.destroy();
    const values = porHora.map(d => d.total || d.count || 0);
    const max = Math.max(...values, 1);
    graficoHoraRef.current = new Chart(canvasHoraRef.current, {
      type: 'bar',
      data: {
        labels: porHora.map(d => `${String(d.hora ?? d.hour ?? 0).padStart(2, '0')}h`),
        datasets: [{
          label: 'Accidentes',
          data: values,
          backgroundColor: values.map(v => {
            const r = v / max;
            if (r > 0.7) return '#ef4444';
            if (r > 0.4) return '#f59e0b';
            return '#667eea';
          }),
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 0 } },
          y: { grid: { color: '#f1f5f9' }, beginAtZero: true, ticks: { font: { size: 11 } } },
        },
      },
    });
    return () => { graficoHoraRef.current?.destroy(); };
  }, [porHora, vistaActual]);

  // Por vehículo
  useEffect(() => {
    if (!canvasVehiculoRef.current) return;
    if (graficoVehiculoRef.current) graficoVehiculoRef.current.destroy();
    const vd = metricas.por_vehiculo || estadisticas.por_vehiculo || {};
    const labels = Object.keys(vd);
    if (!labels.length) return;
    graficoVehiculoRef.current = new Chart(canvasVehiculoRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Accidentes',
          data: Object.values(vd),
          backgroundColor: ['#667eea', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4'],
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 12 } } },
          y: { grid: { color: '#f1f5f9' }, beginAtZero: true, ticks: { font: { size: 11 } } },
        },
      },
    });
    return () => { graficoVehiculoRef.current?.destroy(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricas, estadisticas, vistaActual]);

  // Top 5 barrios más peligrosos – horizontal bar
  useEffect(() => {
    if (!canvasBarrioRef.current || !porBarrio.length) return;
    if (graficoBarrioRef.current) graficoBarrioRef.current.destroy();
    const top5 = [...porBarrio]
      .sort((a, b) => (b.total || b.count || 0) - (a.total || a.count || 0))
      .slice(0, 5);
    graficoBarrioRef.current = new Chart(canvasBarrioRef.current, {
      type: 'bar',
      data: {
        labels: top5.map(d => d.barrio || d.nombre || 'Sin nombre'),
        datasets: [{
          label: 'Accidentes',
          data: top5.map(d => d.total || d.count || 0),
          backgroundColor: ['#ef4444', '#f59e0b', '#f97316', '#eab308', '#84cc16'],
          borderRadius: 6,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#f1f5f9' }, beginAtZero: true, ticks: { font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 12 } } },
        },
      },
    });
    return () => { graficoBarrioRef.current?.destroy(); };
  }, [porBarrio, vistaActual]);

  // ── actions ────────────────────────────────────────────────────────────────
  async function aprobarReporte(id) {
    try {
      await api.put(`/api/reportes/${id}/aprobar`);
      toast.success('Reporte aprobado correctamente');
      cargarDatos();
    } catch (err) { toast.error(err.message || 'Error al aprobar'); }
  }

  async function rechazarReporte(id) {
    if (!window.confirm('¿Confirmar rechazo de este reporte?')) return;
    try {
      await api.put(`/api/reportes/${id}/rechazar`);
      toast.warning('Reporte rechazado');
      cargarDatos();
    } catch (err) { toast.error(err.message || 'Error al rechazar'); }
  }

  async function eliminarAccidente(id) {
    if (!window.confirm('¿Eliminar este accidente permanentemente?')) return;
    try {
      await api.delete(`/api/accidentes/${id}`);
      toast.warning('Accidente eliminado');
      cargarDatos();
    } catch (err) { toast.error(err.message || 'Error al eliminar'); }
  }

  function abrirFormEditar(acc) {
    setFormAccidente({
      ...acc,
      fecha_hora: acc.fecha_hora ? acc.fecha_hora.slice(0, 16) : '',
    });
    setMostrarFormulario(true);
  }

  function abrirFormNuevo() {
    setFormAccidente({ ...FORM_VACIO });
    setMostrarFormulario(true);
  }

  async function guardarFormulario() {
    if (!formAccidente.latitud || !formAccidente.longitud) {
      toast.error('Selecciona una ubicación en el mapa o ingresa las coordenadas manualmente.');
      return;
    }
    if (!formAccidente.fecha_hora) {
      toast.error('La fecha y hora son obligatorias.');
      return;
    }
    // Pydantic V2 requires seconds in datetime: append ":00" if only HH:MM
    const fechaNorm = formAccidente.fecha_hora.length === 16
      ? formAccidente.fecha_hora + ':00'
      : formAccidente.fecha_hora;
    const payload = {
      ...formAccidente,
      latitud:    parseFloat(formAccidente.latitud),
      longitud:   parseFloat(formAccidente.longitud),
      fecha_hora: fechaNorm,
    };
    try {
      if (payload.id) {
        await api.put(`/api/accidentes/${payload.id}`, payload);
        toast.success('Accidente actualizado');
      } else {
        await api.post('/api/accidentes', payload);
        toast.success('Accidente registrado');
      }
      setMostrarFormulario(false);
      setFormAccidente(null);
      cargarDatos();
    } catch (err) { toast.error(err.message || 'Error al guardar'); }
  }

  // ── ML & export actions ────────────────────────────────────────────────────
  async function entrenarModelo() {
    setMlEntrenando(true);
    try {
      const res = await api.post('/api/ml/entrenar', {});
      toast.success(res.mensaje || 'Modelo entrenado correctamente');
      const estado = await api.get('/api/ml/estado');
      setMlEstado(estado);
    } catch (err) {
      const msg = err.message || '';
      const is404 = msg.toLowerCase().includes('not found') || msg.includes('404');
      toast.error(is404
        ? 'Backend desactualizado — reinicia iniciar_backend.bat y vuelve a intentarlo.'
        : msg || 'Error al entrenar el modelo');
    } finally {
      setMlEntrenando(false);
    }
  }

  async function exportarPDF() {
    setExportando(true);
    try {
      const datos = await api.get('/api/exportar/resumen-pdf');
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const fecha = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
      const W = 210;

      // Header
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, W, 35, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('CrashMap Cartagena', 15, 14);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Reporte de Accidentalidad Vial', 15, 22);
      doc.setFontSize(9);
      doc.text(`Generado: ${fecha}`, 15, 30);

      // KPIs
      doc.setTextColor(31, 41, 55);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumen General', 15, 47);
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.5);
      doc.line(15, 49, W - 15, 49);

      const res = datos.resumen || {};
      const grav = datos.por_gravedad || {};
      const kpis = [
        { label: 'Total Accidentes', value: String(res.total || 0) },
        { label: 'Este Mes', value: String(res.este_mes || 0) },
        { label: 'Fatales', value: String(grav.fatal || 0) },
        { label: 'Graves', value: String(grav.grave || 0) },
        { label: 'Leves', value: String(grav.leve || 0) },
      ];
      doc.setFontSize(10);
      kpis.forEach((k, i) => {
        const x = 15 + (i % 3) * 62;
        const y = 55 + Math.floor(i / 3) * 22;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, y, 58, 16, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(79, 70, 229);
        doc.text(k.value, x + 4, y + 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.text(k.label, x + 4, y + 14);
      });

      // Top barrios
      let y = 103;
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 41, 55);
      doc.text('Top 10 Barrios con Más Accidentes', 15, y);
      doc.line(15, y + 2, W - 15, y + 2);
      y += 7;
      const top10 = datos.top10_barrios || [];
      const maxVal = top10[0]?.total || 1;
      top10.forEach((b, i) => {
        const barW = ((b.total / maxVal) * (W - 80));
        doc.setFillColor(i === 0 ? 239 : i < 3 ? 245 : 102, i === 0 ? 68 : i < 3 ? 158 : 126, i === 0 ? 68 : i < 3 ? 11 : 234);
        doc.rect(50, y, barW, 5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(55, 65, 81);
        doc.text(`${i + 1}. ${b.barrio}`, 15, y + 4);
        doc.text(String(b.total), W - 20, y + 4);
        y += 8;
        if (y > 270) { doc.addPage(); y = 20; }
      });

      // Tendencia
      if (datos.tendencia_mensual?.length) {
        y += 5;
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text('Tendencia Mensual', 15, y);
        doc.line(15, y + 2, W - 15, y + 2);
        y += 7;
        const trend = datos.tendencia_mensual;
        const tMax = Math.max(...trend.map(t => t.total), 1);
        const bW = Math.min(12, (W - 30) / trend.length - 2);
        trend.forEach((t, i) => {
          const bH = (t.total / tMax) * 30;
          const bX = 15 + i * (bW + 2);
          const bY = y + 30 - bH;
          doc.setFillColor(79, 70, 229);
          doc.rect(bX, bY, bW, bH, 'F');
          doc.setFontSize(6);
          doc.setTextColor(107, 114, 128);
          doc.text(t.etiqueta?.slice(0, 3) || '', bX, y + 34);
        });
      }

      doc.save(`crashmap-reporte-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF exportado correctamente');
    } catch (err) {
      const msg = err.message || '';
      const is404 = msg.toLowerCase().includes('not found') || msg.includes('404');
      toast.error(is404
        ? 'Backend desactualizado — reinicia iniciar_backend.bat primero.'
        : msg || 'Error al exportar PDF');
    } finally {
      setExportando(false);
    }
  }

  // ── derived ────────────────────────────────────────────────────────────────
  const total   = metricas.total    || 0;
  const esMes   = metricas.este_mes || 0;
  const tasaMes = total > 0 ? ((esMes / total) * 100).toFixed(1) : '0.0';
  const criticos = (metricas.por_gravedad?.grave || 0) + (metricas.por_gravedad?.fatal || 0);

  const horaPico = porHora.length
    ? porHora.reduce((mx, d) => (d.total || d.count || 0) > (mx.total || mx.count || 0) ? d : mx, porHora[0])
    : null;

  const vehiculoPrincipal = (() => {
    const vd = metricas.por_vehiculo || estadisticas.por_vehiculo || {};
    const entries = Object.entries(vd);
    if (!entries.length) return null;
    return entries.reduce((mx, e) => e[1] > mx[1] ? e : mx, entries[0]);
  })();

  // ── guard ──────────────────────────────────────────────────────────────────
  if (!usuario?.es_admin) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2 style={{ color: '#374151', marginBottom: '0.5rem' }}>Acceso restringido</h2>
        <p style={{ color: '#6b7280' }}>Solo administradores pueden ver el dashboard.</p>
      </div>
    );
  }

  if (cargando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', background: 'white', borderRadius: '12px' }}>
        <div className="spinner" />
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>Cargando dashboard…</p>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.2rem' }}>
            Panel de Administración
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.88rem' }}>
            Última actualización: {ultimaActualizacion.toLocaleTimeString('es-CO')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            className={`btn-tab${vistaActual === 'metricas' ? ' active' : ''}`}
            onClick={() => setVistaActual('metricas')}
          >📊 Métricas</button>
          <button
            className={`btn-tab${vistaActual === 'reportes' ? ' active' : ''}`}
            onClick={() => setVistaActual('reportes')}
          >
            📋 Reportes{pendientes.length > 0 ? ` (${pendientes.length})` : ''}
          </button>
          <button
            className={`btn-tab${vistaActual === 'herramientas' ? ' active' : ''}`}
            onClick={() => setVistaActual('herramientas')}
          >
            🛠️ Herramientas
          </button>
          <button className="btn-nuevo-reporte" onClick={abrirFormNuevo}>
            + Nuevo Reporte
          </button>
        </div>
      </div>

      {/* ══ MÉTRICAS ══════════════════════════════════════════════════════════ */}
      {vistaActual === 'metricas' && (
        <>
          {/* Stat cards */}
          <div className="metricas-cards">
            <div className="metric-card" style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)' }}>
              <div className="metric-icon">🚗</div>
              <div className="metric-content">
                <h3>Total Accidentes</h3>
                <div className="metric-value">{total.toLocaleString('es-CO')}</div>
              </div>
            </div>
            <div className="metric-card" style={{ background: 'linear-gradient(135deg,#06b6d4,#0891b2)' }}>
              <div className="metric-icon">📅</div>
              <div className="metric-content">
                <h3>Este Mes</h3>
                <div className="metric-value">{esMes.toLocaleString('es-CO')}</div>
              </div>
            </div>
            <div className="metric-card" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
              <div className="metric-icon">📈</div>
              <div className="metric-content">
                <h3>Tasa Mensual</h3>
                <div className="metric-value">{tasaMes}%</div>
              </div>
            </div>
            <div className="metric-card" style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
              <div className="metric-icon">⚠️</div>
              <div className="metric-content">
                <h3>Críticos (grave+fatal)</h3>
                <div className="metric-value">{criticos.toLocaleString('es-CO')}</div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="graficos-container">

            {/* Gravedad */}
            <div className="grafico-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
                Distribución por Gravedad
              </h3>
              <div style={{ height: '260px', position: 'relative' }}>
                <canvas ref={canvasGravedadRef} />
              </div>
            </div>

            {/* Clima */}
            <div className="grafico-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
                Accidentes por Condición Climática
              </h3>
              <div style={{ height: '260px', position: 'relative' }}>
                <canvas ref={canvasClimaRef} />
              </div>
            </div>

            {/* Tendencia mensual */}
            <div className="grafico-card full-width">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
                Tendencia Mensual — últimos 12 meses
              </h3>
              <div style={{ height: '240px', position: 'relative' }}>
                {tendencia.length > 0
                  ? <canvas ref={canvasTendenciaRef} />
                  : <div className="sin-datos-tendencia">Sin datos de tendencia disponibles</div>
                }
              </div>
            </div>

            {/* Por hora */}
            <div className="grafico-card full-width">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
                Distribución por Hora del Día
              </h3>
              <div style={{ height: '220px', position: 'relative' }}>
                {porHora.length > 0
                  ? <canvas ref={canvasHoraRef} />
                  : <div className="sin-datos-tendencia">Sin datos de horas disponibles</div>
                }
              </div>
            </div>

            {/* Por vehículo */}
            <div className="grafico-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
                Por Tipo de Vehículo
              </h3>
              <div style={{ height: '260px', position: 'relative' }}>
                <canvas ref={canvasVehiculoRef} />
              </div>
            </div>

            {/* Top barrios */}
            <div className="grafico-card">
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
                Top 5 Barrios Más Peligrosos
              </h3>
              <div style={{ height: '260px', position: 'relative' }}>
                {porBarrio.length > 0
                  ? <canvas ref={canvasBarrioRef} />
                  : <div className="sin-datos-tendencia">Sin datos de barrios disponibles</div>
                }
              </div>
            </div>
          </div>

          {/* Alertas */}
          <div className="predicciones-section">
            <h3>Alertas del Sistema</h3>
            <div className="alertas-grid">
              {(metricas.por_gravedad?.fatal || metricas.criticos || 0) > 5 && (
                <div className="alerta warning">
                  <div className="alerta-icon">⚠️</div>
                  <div>
                    <h4>Accidentes Fatales Elevados</h4>
                    <p>{metricas.por_gravedad?.fatal || metricas.criticos} accidentes fatales registrados. Se recomienda reforzar operativos viales.</p>
                  </div>
                </div>
              )}
              {pendientes.length > 0 && (
                <div className="alerta info">
                  <div className="alerta-icon">📋</div>
                  <div>
                    <h4>Reportes Pendientes de Revisión</h4>
                    <p>{pendientes.length} reporte{pendientes.length !== 1 ? 's' : ''} en espera de aprobación o rechazo.</p>
                  </div>
                </div>
              )}
              <div className="alerta success">
                <div className="alerta-icon">✅</div>
                <div>
                  <h4>Sistema Operativo</h4>
                  <p>Última actualización: {ultimaActualizacion.toLocaleTimeString('es-CO')}. Todos los módulos funcionan correctamente.</p>
                </div>
              </div>
              {vehiculoPrincipal && (
                <div className="alerta info">
                  <div className="alerta-icon">🏍️</div>
                  <div>
                    <h4>Vehículo Más Frecuente</h4>
                    <p>El tipo más involucrado es <strong>{vehiculoPrincipal[0]}</strong> con {vehiculoPrincipal[1]} casos.</p>
                  </div>
                </div>
              )}
              {horaPico && (
                <div className="alerta warning">
                  <div className="alerta-icon">🕐</div>
                  <div>
                    <h4>Hora de Mayor Riesgo</h4>
                    <p>
                      La hora con más accidentes es las{' '}
                      <strong>{String(horaPico.hora ?? horaPico.hour ?? 0).padStart(2, '0')}:00</strong>{' '}
                      con {horaPico.total || horaPico.count || 0} accidentes.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══ REPORTES ══════════════════════════════════════════════════════════ */}
      {vistaActual === 'reportes' && (
        <div className="gestion-reportes">
          <div className="reportes-tabs">
            <button
              className={`reporte-tab${tabReportes === 'pendientes' ? ' active' : ''}`}
              onClick={() => setTabReportes('pendientes')}
            >
              Pendientes{pendientes.length > 0 ? ` (${pendientes.length})` : ''}
            </button>
            <button
              className={`reporte-tab${tabReportes === 'todos' ? ' active' : ''}`}
              onClick={() => setTabReportes('todos')}
            >
              Todos los Registros ({accidentes.length})
            </button>
          </div>

          {/* Pendientes */}
          {tabReportes === 'pendientes' && (
            pendientes.length === 0 ? (
              <div className="sin-reportes">
                <span>✅</span>
                <h3>Sin reportes pendientes</h3>
                <p>Todos los reportes han sido revisados.</p>
              </div>
            ) : (
              <div className="reportes-grid">
                {pendientes.map(rep => (
                  <div key={rep.id} className="reporte-card-admin">
                    <div className="reporte-header-admin">
                      <div className="reporte-badge pendiente">🕐 Pendiente</div>
                      <span className="reporte-fecha">
                        {rep.fecha_hora ? new Date(rep.fecha_hora).toLocaleString('es-CO') : '—'}
                      </span>
                    </div>
                    <div className="reporte-body-admin">
                      <div className="reporte-info-grid">
                        <div className="info-item-admin">
                          <span className="info-label">Barrio</span>
                          <span className="info-value">{rep.barrio || '—'}</span>
                        </div>
                        <div className="info-item-admin">
                          <span className="info-label">Gravedad</span>
                          <span className={`info-value ${gravedadClass(rep.gravedad)}`}>
                            {(rep.gravedad || '—').toUpperCase()}
                          </span>
                        </div>
                        <div className="info-item-admin">
                          <span className="info-label">Vehículo</span>
                          <span className="info-value">{rep.tipo_vehiculo || '—'}</span>
                        </div>
                        <div className="info-item-admin">
                          <span className="info-label">Clima</span>
                          <span className="info-value">{rep.clima || '—'}</span>
                        </div>
                      </div>
                      {rep.descripcion && (
                        <div className="reporte-descripcion-admin">
                          <strong>Descripción</strong>
                          <p>{rep.descripcion}</p>
                        </div>
                      )}
                    </div>
                    <div className="reporte-acciones-admin">
                      <button className="btn-aprobar-admin" onClick={() => aprobarReporte(rep.id)}>
                        ✅ Aprobar
                      </button>
                      <button className="btn-editar-admin" onClick={() => abrirFormEditar(rep)}>
                        ✏️ Editar
                      </button>
                      <button className="btn-rechazar-admin" onClick={() => rechazarReporte(rep.id)}>
                        ✖ Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Todos */}
          {tabReportes === 'todos' && (() => {
            // Obtener listas únicas para los selects
            const tiposUnicos = [...new Set(accidentes.map(a => a.tipo_vehiculo).filter(Boolean))].sort();

            // Aplicar filtros
            const filtrados = [...accidentes]
              .sort((a, b) => new Date(b.fecha_hora || 0) - new Date(a.fecha_hora || 0))
              .filter(a => {
                const txt = filtros.busqueda.toLowerCase();
                if (txt && !(
                  (a.barrio || '').toLowerCase().includes(txt) ||
                  (a.descripcion || '').toLowerCase().includes(txt) ||
                  String(a.id).includes(txt)
                )) return false;
                if (filtros.gravedad && a.gravedad !== filtros.gravedad) return false;
                if (filtros.estado && a.estado !== filtros.estado) return false;
                if (filtros.fuente && (a.fuente || 'manual') !== filtros.fuente) return false;
                if (filtros.tipo_vehiculo && a.tipo_vehiculo !== filtros.tipo_vehiculo) return false;
                if (filtros.fecha_desde) {
                  const desde = new Date(filtros.fecha_desde);
                  if (new Date(a.fecha_hora) < desde) return false;
                }
                if (filtros.fecha_hasta) {
                  const hasta = new Date(filtros.fecha_hasta);
                  hasta.setHours(23, 59, 59);
                  if (new Date(a.fecha_hora) > hasta) return false;
                }
                return true;
              });

            const inputStyle = {
              padding: '6px 10px', borderRadius: 6,
              border: '1px solid #334155',
              background: '#0f172a', color: '#f1f5f9',
              fontSize: '0.82rem',
            };
            const labelStyle = { fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginBottom: 3 };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* ── Barra de filtros ── */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Filtros
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.75rem' }}>
                    {/* Búsqueda libre */}
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={labelStyle}>Buscar (ID, barrio, descripción)</label>
                      <input
                        type="text"
                        placeholder="Ej: Bocagrande, #12..."
                        value={filtros.busqueda}
                        onChange={e => setFiltros(f => ({ ...f, busqueda: e.target.value }))}
                        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    {/* Gravedad */}
                    <div>
                      <label style={labelStyle}>Gravedad</label>
                      <select value={filtros.gravedad} onChange={e => setFiltros(f => ({ ...f, gravedad: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                        <option value="">Todas</option>
                        <option value="fatal">Fatal</option>
                        <option value="grave">Grave</option>
                        <option value="leve">Leve</option>
                      </select>
                    </div>
                    {/* Estado */}
                    <div>
                      <label style={labelStyle}>Estado</label>
                      <select value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                        <option value="">Todos</option>
                        <option value="aprobado">Aprobado</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="rechazado">Rechazado</option>
                      </select>
                    </div>
                    {/* Fuente */}
                    <div>
                      <label style={labelStyle}>Fuente</label>
                      <select value={filtros.fuente} onChange={e => setFiltros(f => ({ ...f, fuente: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                        <option value="">Todas</option>
                        <option value="manual">Manual</option>
                        <option value="excel">Excel</option>
                        <option value="externo">Externo</option>
                      </select>
                    </div>
                    {/* Tipo vehículo */}
                    <div>
                      <label style={labelStyle}>Tipo vehículo</label>
                      <select value={filtros.tipo_vehiculo} onChange={e => setFiltros(f => ({ ...f, tipo_vehiculo: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                        <option value="">Todos</option>
                        {tiposUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    {/* Fecha desde */}
                    <div>
                      <label style={labelStyle}>Fecha desde</label>
                      <input type="date" value={filtros.fecha_desde} onChange={e => setFiltros(f => ({ ...f, fecha_desde: e.target.value }))} style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                    </div>
                    {/* Fecha hasta */}
                    <div>
                      <label style={labelStyle}>Fecha hasta</label>
                      <input type="date" value={filtros.fecha_hasta} onChange={e => setFiltros(f => ({ ...f, fecha_hasta: e.target.value }))} style={{ ...inputStyle, width: '100%', colorScheme: 'dark' }} />
                    </div>
                  </div>
                  {/* Resumen + limpiar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      Mostrando <strong style={{ color: '#f1f5f9' }}>{filtrados.length}</strong> de {accidentes.length} registros
                    </span>
                    <button
                      onClick={() => setFiltros({ busqueda: '', gravedad: '', estado: '', fuente: '', tipo_vehiculo: '', fecha_desde: '', fecha_hasta: '' })}
                      style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
                    >
                      ✕ Limpiar filtros
                    </button>
                  </div>
                </div>

                {/* ── Tabla ── */}
                <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #334155' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#253347' }}>
                        {['ID','Barrio','Fecha','Gravedad','Tipo vehículo','Estado','Fuente','Acciones'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#cbd5e1', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #334155' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                            Sin resultados para los filtros aplicados
                          </td>
                        </tr>
                      )}
                      {filtrados.map((acc, i) => (
                        <tr key={acc.id} style={{ borderBottom: '1px solid #1e293b', background: i % 2 === 0 ? '#0f172a' : '#131f2e' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: '#7dd3fc' }}>#{acc.id}</td>
                          <td style={{ padding: '9px 12px', color: '#e2e8f0' }}>{acc.barrio || '—'}</td>
                          <td style={{ padding: '9px 12px', color: '#e2e8f0', whiteSpace: 'nowrap' }}>
                            {acc.fecha_hora ? new Date(acc.fecha_hora).toLocaleDateString('es-CO') : '—'}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span className={`badge-gravedad ${(acc.gravedad || '').toLowerCase()}`}>
                              {acc.gravedad || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', color: '#e2e8f0' }}>{acc.tipo_vehiculo || '—'}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span className="badge-gravedad" style={estadoBadgeStyle(acc.estado)}>
                              {acc.estado || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span className="badge-gravedad" style={fuenteBadgeStyle(acc.fuente)}>
                              {acc.fuente || 'manual'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <button className="btn-icon-admin" title="Editar" onClick={() => abrirFormEditar(acc)}>✏️</button>
                            <button className="btn-icon-admin danger" title="Eliminar" onClick={() => eliminarAccidente(acc.id)}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ══ HERRAMIENTAS ══════════════════════════════════════════════════════ */}
      {vistaActual === 'herramientas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Clima widget */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            <div style={{ background: clima ? 'linear-gradient(135deg, #0ea5e9, #0284c7)' : '#f8fafc', borderRadius: '12px', padding: '1.5rem', color: clima ? 'white' : '#6b7280', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🌤️ Clima Actual — Cartagena
              </div>
              {clima ? (
                <div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>{Math.round(clima.temperatura || 0)}°C</div>
                  <div style={{ opacity: 0.9, marginTop: '0.4rem', textTransform: 'capitalize' }}>{clima.descripcion || ''}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '1rem' }}>
                    {[
                      { label: 'Humedad', value: `${clima.humedad || '—'}%` },
                      { label: 'Viento', value: `${clima.viento_kmh || '—'} km/h` },
                      { label: 'Ciudad', value: clima.ciudad || 'Cartagena' },
                      { label: 'Fuente', value: clima.simulado ? 'Simulado' : 'OpenWeather' },
                    ].map((item, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '0.5rem 0.7rem' }}>
                        <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>{item.label}</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div className="spinner" style={{ margin: '0 auto' }} />
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem' }}>Cargando clima…</p>
                </div>
              )}
            </div>

            {/* ML Estado */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.8rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🧠 Modelo de IA — Estado
              </div>
              {mlEstado ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {[
                    { label: 'Estado', value: mlEstado.entrenado ? '✅ Entrenado' : '⏳ Sin entrenar', color: mlEstado.entrenado ? '#22c55e' : '#f59e0b' },
                    { label: 'Archivo modelo', value: mlEstado.ruta || 'modelo_riesgo.pt' },
                    { label: 'Último entrenamiento', value: mlEstado.fecha_entrenamiento ? new Date(mlEstado.fecha_entrenamiento).toLocaleDateString('es-CO') : 'Nunca' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>{item.label}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: item.color || '#1f2937' }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Cargando estado del modelo…</p>
              )}
              <button
                onClick={entrenarModelo}
                disabled={mlEntrenando}
                style={{
                  width: '100%', marginTop: '1rem', padding: '0.7rem',
                  background: mlEntrenando ? '#e5e7eb' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                  border: 'none', borderRadius: '8px', color: mlEntrenando ? '#9ca3af' : 'white',
                  cursor: mlEntrenando ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: '0.88rem',
                }}
              >
                {mlEntrenando ? '⏳ Entrenando…' : '🚀 Entrenar / Re-entrenar Modelo'}
              </button>
            </div>
          </div>

          {/* Correlaciones */}
          {correlaciones && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>
                📊 Correlaciones de Factores de Riesgo
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {Object.entries(correlaciones).map(([key, val], i) => {
                  const pct = Math.abs(val) * 100;
                  const color = val > 0.5 ? '#ef4444' : val > 0.3 ? '#f59e0b' : '#22c55e';
                  return (
                    <div key={i} style={{ padding: '1rem', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '0.5rem', textTransform: 'capitalize' }}>
                        {key.replace(/_/g, ' ')}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color, minWidth: '40px', textAlign: 'right' }}>
                          {(val * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Export PDF */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>
              📄 Exportar Reporte
            </h3>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.2rem' }}>
              Genera un PDF con el resumen de accidentalidad incluyendo métricas, gráficos y estadísticas del período actual.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={exportarPDF}
                disabled={exportando}
                style={{
                  padding: '0.75rem 2rem',
                  background: exportando ? '#e5e7eb' : 'linear-gradient(135deg,#dc2626,#b91c1c)',
                  border: 'none', borderRadius: '8px',
                  color: exportando ? '#9ca3af' : 'white',
                  cursor: exportando ? 'not-allowed' : 'pointer',
                  fontWeight: 600, fontSize: '0.9rem',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}
              >
                {exportando ? '⏳ Generando PDF…' : '⬇️ Reporte Rápido PDF'}
              </button>
              <button
                onClick={async () => {
                  try {
                    const token = localStorage.getItem('token');
                    const ahora = new Date();
                    const url = `${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/informes/pdf-mensual?anio=${ahora.getFullYear()}&mes=${ahora.getMonth() + 1}`;
                    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                    if (!res.ok) throw new Error('Error al generar');
                    const blob = await res.blob();
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `informe_oficial_${ahora.getFullYear()}_${ahora.getMonth() + 1}.pdf`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  } catch (e) {
                    alert('Error al generar informe oficial: ' + e.message);
                  }
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg,#1a3a5c,#2c5282)',
                  border: 'none', borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 600, fontSize: '0.9rem',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}
              >
                📋 Informe Oficial Mensual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ OVERLAY SELECTOR DE MAPA ══════════════════════════════════════════ */}
      {mostrarMapaSeleccion && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 3000,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.8rem 1.5rem', background: '#1e293b', color: 'white',
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              🗺️ Haz clic en el mapa para colocar el pin de ubicación
            </span>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button
                onClick={() => setMostrarMapaSeleccion(false)}
                style={{
                  background: '#22c55e', border: 'none', color: 'white',
                  padding: '0.4rem 1.2rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 700,
                }}
              >
                ✓ Confirmar ubicación
              </button>
              <button
                onClick={() => {
                  setFormAccidente(p => ({ ...p, latitud: CARTAGENA_CENTER[0], longitud: CARTAGENA_CENTER[1] }));
                  setMostrarMapaSeleccion(false);
                }}
                style={{
                  background: '#475569', border: 'none', color: 'white',
                  padding: '0.4rem 1rem', borderRadius: '6px', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
          {formAccidente && (
            <div style={{ fontSize: '0.82rem', background: '#0f172a', color: '#94a3b8', padding: '0.4rem 1.5rem', flexShrink: 0 }}>
              Coordenadas actuales: {parseFloat(formAccidente.latitud || 0).toFixed(5)}, {parseFloat(formAccidente.longitud || 0).toFixed(5)}
            </div>
          )}
          <div ref={mapSelDomRef} style={{ flex: 1 }} />
        </div>
      )}

      {/* ══ MODAL FORMULARIO ══════════════════════════════════════════════════ */}
      {mostrarFormulario && formAccidente !== null && (
        <div
          className="modal-overlay-crashmap"
          onClick={e => { if (e.target === e.currentTarget) setMostrarFormulario(false); }}
        >
          <div className="modal-crashmap">
            <div className="modal-header-crashmap">
              <h2>{formAccidente.id ? '✏️ Editar Accidente' : '➕ Nuevo Accidente'}</h2>
              <button className="btn-cerrar-crashmap" onClick={() => setMostrarFormulario(false)}>✕</button>
            </div>

            <div className="form-crashmap">
              {/* ── Ubicación ── */}
              <div className="form-section">
                <h3>📍 Ubicación</h3>
                <div className="form-row">
                  <div className="form-group-crashmap">
                    <label>Latitud</label>
                    <input
                      type="number" step="0.000001"
                      value={formAccidente.latitud ?? 10.3910}
                      onChange={e => setFormAccidente(p => ({ ...p, latitud: e.target.value }))}
                    />
                  </div>
                  <div className="form-group-crashmap">
                    <label>Longitud</label>
                    <input
                      type="number" step="0.000001"
                      value={formAccidente.longitud ?? -75.4794}
                      onChange={e => setFormAccidente(p => ({ ...p, longitud: e.target.value }))}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-seleccionar-mapa"
                  onClick={() => setMostrarMapaSeleccion(true)}
                  style={{ marginTop: '0.5rem' }}
                >
                  📍 Seleccionar en el mapa
                </button>
                {formAccidente.latitud && formAccidente.longitud && (
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.4rem' }}>
                    📌 {parseFloat(formAccidente.latitud).toFixed(5)}, {parseFloat(formAccidente.longitud).toFixed(5)}
                  </div>
                )}
              </div>

              <div className="form-section">
                <h3>Datos del Accidente</h3>

                <div className="form-row">
                  <div className="form-group-crashmap">
                    <label>Barrio</label>
                    <input
                      type="text"
                      value={formAccidente.barrio || ''}
                      onChange={e => setFormAccidente(p => ({ ...p, barrio: e.target.value }))}
                      placeholder="Ej. Bocagrande"
                    />
                  </div>
                  <div className="form-group-crashmap">
                    <label>Fecha y Hora</label>
                    <input
                      type="datetime-local"
                      value={formAccidente.fecha_hora || ''}
                      onChange={e => setFormAccidente(p => ({ ...p, fecha_hora: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group-crashmap">
                    <label>Gravedad</label>
                    <select value={formAccidente.gravedad || 'leve'} onChange={e => setFormAccidente(p => ({ ...p, gravedad: e.target.value }))}>
                      <option value="leve">Leve</option>
                      <option value="grave">Grave</option>
                      <option value="fatal">Fatal</option>
                    </select>
                  </div>
                  <div className="form-group-crashmap">
                    <label>Tipo de Vehículo</label>
                    <select value={formAccidente.tipo_vehiculo || 'moto'} onChange={e => setFormAccidente(p => ({ ...p, tipo_vehiculo: e.target.value }))}>
                      <option value="moto">Moto</option>
                      <option value="auto">Auto</option>
                      <option value="bus">Bus</option>
                      <option value="camion">Camión</option>
                      <option value="bicicleta">Bicicleta</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group-crashmap">
                    <label>Clima</label>
                    <select value={formAccidente.clima || 'soleado'} onChange={e => setFormAccidente(p => ({ ...p, clima: e.target.value }))}>
                      <option value="soleado">Soleado</option>
                      <option value="nublado">Nublado</option>
                      <option value="lluvia">Lluvia</option>
                    </select>
                  </div>
                  <div className="form-group-crashmap">
                    <label>Estado de la Vía</label>
                    <select value={formAccidente.estado_via || 'bueno'} onChange={e => setFormAccidente(p => ({ ...p, estado_via: e.target.value }))}>
                      <option value="bueno">Bueno</option>
                      <option value="regular">Regular</option>
                      <option value="malo">Malo</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group-crashmap">
                    <label>Estado del Reporte</label>
                    <select value={formAccidente.estado || 'pendiente'} onChange={e => setFormAccidente(p => ({ ...p, estado: e.target.value }))}>
                      <option value="pendiente">Pendiente</option>
                      <option value="aprobado">Aprobado</option>
                      <option value="rechazado">Rechazado</option>
                    </select>
                  </div>
                  <div className="form-group-crashmap checkboxes">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!formAccidente.dia_festivo}
                        onChange={e => setFormAccidente(p => ({ ...p, dia_festivo: e.target.checked }))}
                      />
                      Día Festivo
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!formAccidente.hora_pico}
                        onChange={e => setFormAccidente(p => ({ ...p, hora_pico: e.target.checked }))}
                      />
                      Hora Pico
                    </label>
                  </div>
                </div>

                <div className="form-group-crashmap">
                  <label>Descripción</label>
                  <textarea
                    rows={3}
                    value={formAccidente.descripcion || ''}
                    onChange={e => setFormAccidente(p => ({ ...p, descripcion: e.target.value }))}
                    placeholder="Descripción del accidente…"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-cancelar-crashmap" onClick={() => setMostrarFormulario(false)}>
                  Cancelar
                </button>
                <button className="btn-enviar-crashmap" onClick={guardarFormulario}>
                  {formAccidente.id ? '💾 Guardar Cambios' : '➕ Registrar Accidente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
