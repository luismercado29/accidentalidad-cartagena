import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';
import { useToast } from '../hooks/useToast';
import Toast from './Toast';

const CARTAGENA_CENTER = [10.3910, -75.4794];

// Quick-select points split by role
const PUNTOS_ORIGEN = [
  { nombre: 'Centro Histórico', lat: 10.4236, lng: -75.5478 },
  { nombre: 'Bocagrande', lat: 10.3977, lng: -75.5515 },
  { nombre: 'Castillo San Felipe', lat: 10.4232, lng: -75.5412 },
];

const PUNTOS_DESTINO = [
  { nombre: 'Terminal de Buses', lat: 10.3978, lng: -75.5097 },
  { nombre: 'Aeropuerto', lat: 10.4424, lng: -75.5131 },
  { nombre: 'Mercado de Bazurto', lat: 10.4110, lng: -75.5260 },
];

const colorRiesgo = (nivel) => {
  if (!nivel) return '#6366f1';
  const n = nivel.toLowerCase();
  if (n === 'alto') return '#ef4444';
  if (n === 'medio') return '#f59e0b';
  return '#22c55e';
};

const RutaSegura = ({ token }) => {
  // ─── Map refs ──────────────────────────────────────────────────────────────
  const mapRef = useRef(null);
  const mapaRef = useRef(null);
  const routeLayerRef = useRef(null);
  const markersRef = useRef([]);

  // ─── Selection mode ref (avoids stale closure in map click handler) ────────
  const seleccionandoRef = useRef(null); // 'origen' | 'destino' | null

  // ─── State ─────────────────────────────────────────────────────────────────
  const [origen, setOrigen] = useState(null);        // {lat, lng, nombre}
  const [destino, setDestino] = useState(null);      // {lat, lng, nombre}
  const [busquedaOrigen, setBusquedaOrigen] = useState('');
  const [busquedaDestino, setBusquedaDestino] = useState('');
  const [sugerenciasOrigen, setSugerenciasOrigen] = useState([]);
  const [sugerenciasDestino, setSugerenciasDestino] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [seleccionando, setSeleccionando] = useState(null); // 'origen'|'destino'|null

  const { toasts, removeToast, toast } = useToast();

  // Sync state → ref so the map click handler always sees current value
  useEffect(() => {
    seleccionandoRef.current = seleccionando;
    if (mapaRef.current) {
      mapaRef.current.getContainer().style.cursor =
        seleccionando ? 'crosshair' : '';
    }
  }, [seleccionando]);

  // ─── Map init ──────────────────────────────────────────────────────────────
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

    mapaRef.current.on('click', (e) => {
      const modo = seleccionandoRef.current;
      if (!modo) return;

      const lat = parseFloat(e.latlng.lat.toFixed(6));
      const lng = parseFloat(e.latlng.lng.toFixed(6));
      const nombre = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      if (modo === 'origen') {
        setOrigen({ lat, lng, nombre });
        setBusquedaOrigen(nombre);
        colocarMarcadorPunto({ lat, lng }, 'origen', nombre);
      } else {
        setDestino({ lat, lng, nombre });
        setBusquedaDestino(nombre);
        colocarMarcadorPunto({ lat, lng }, 'destino', nombre);
      }
      setSeleccionando(null);
      seleccionandoRef.current = null;
    });

    return () => {
      if (mapaRef.current) {
        mapaRef.current.remove();
        mapaRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Geocoding ─────────────────────────────────────────────────────────────
  const buscarLugar = useCallback(async (query, tipo) => {
    if (!query || query.length < 2) {
      tipo === 'origen' ? setSugerenciasOrigen([]) : setSugerenciasDestino([]);
      return;
    }
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query + ' Cartagena Colombia'
        )}&limit=5&countrycodes=co`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await response.json();
      tipo === 'origen' ? setSugerenciasOrigen(data) : setSugerenciasDestino(data);
    } catch (e) {
      // silently fail
    }
  }, []);

  const seleccionarSugerencia = useCallback((sug, tipo) => {
    const lat = parseFloat(parseFloat(sug.lat).toFixed(6));
    const lng = parseFloat(parseFloat(sug.lon).toFixed(6));
    const nombre = sug.display_name.split(',')[0];
    const punto = { lat, lng, nombre };

    if (tipo === 'origen') {
      setOrigen(punto);
      setBusquedaOrigen(nombre);
      setSugerenciasOrigen([]);
      colocarMarcadorPunto(punto, 'origen', nombre);
    } else {
      setDestino(punto);
      setBusquedaDestino(nombre);
      setSugerenciasDestino([]);
      colocarMarcadorPunto(punto, 'destino', nombre);
    }
  }, []);

  // ─── Marker helpers ────────────────────────────────────────────────────────
  const colocarMarcadorPunto = useCallback((punto, tipo, label) => {
    if (!mapaRef.current) return;
    // Remove existing marker of same type
    markersRef.current = markersRef.current.filter((m) => {
      if (m.tipo === tipo) {
        m.marker.remove();
        return false;
      }
      return true;
    });

    const fillColor = tipo === 'origen' ? '#22c55e' : '#ef4444';
    const marker = L.circleMarker([punto.lat, punto.lng], {
      radius: 11,
      fillColor,
      color: '#fff',
      weight: 3,
      fillOpacity: 1,
    })
      .bindPopup(
        `<b>${tipo === 'origen' ? 'Origen' : 'Destino'}</b><br/>${label}`
      )
      .addTo(mapaRef.current);

    markersRef.current.push({ marker, tipo });
    mapaRef.current.setView([punto.lat, punto.lng], 14, { animate: true });
  }, []);

  // ─── Quick point selection ─────────────────────────────────────────────────
  const seleccionarPuntoRapido = useCallback(
    (punto, tipo) => {
      const p = { lat: punto.lat, lng: punto.lng, nombre: punto.nombre };
      if (tipo === 'origen') {
        setOrigen(p);
        setBusquedaOrigen(punto.nombre);
        setSugerenciasOrigen([]);
      } else {
        setDestino(p);
        setBusquedaDestino(punto.nombre);
        setSugerenciasDestino([]);
      }
      colocarMarcadorPunto(p, tipo, punto.nombre);
    },
    [colocarMarcadorPunto]
  );

  // ─── OSRM real street routing ──────────────────────────────────────────────
  const obtenerRutaOSRM = async (oLat, oLng, dLat, dLng) => {
    const url = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson&steps=true`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo conectar con OSRM');
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
      throw new Error('No se pudo calcular la ruta por las calles');
    }
    const route = data.routes[0];
    // OSRM coordinates are [lng, lat] — convert to {lat, lng}
    const waypoints = route.geometry.coordinates.map(([lng, lat]) => ({
      lat,
      lng,
    }));
    return {
      waypoints,
      distancia_km: parseFloat((route.legs[0].distance / 1000).toFixed(2)),
      tiempo_min: parseFloat((route.legs[0].duration / 60).toFixed(1)),
    };
  };

  // ─── Draw route on map ─────────────────────────────────────────────────────
  const dibujarRutaEnMapa = useCallback(
    (waypoints, nivelRiesgo, puntosCriticos) => {
      if (!mapaRef.current) return;

      // Clear existing route layer
      if (routeLayerRef.current) {
        routeLayerRef.current.remove();
        routeLayerRef.current = null;
      }
      // Clear previous critical/route markers (keep origen/destino)
      markersRef.current = markersRef.current.filter((m) => {
        if (m.tipo === 'critico') {
          m.marker.remove();
          return false;
        }
        return true;
      });

      const color = colorRiesgo(nivelRiesgo);
      const latlngs = waypoints.map((p) => [p.lat, p.lng]);

      routeLayerRef.current = L.polyline(latlngs, {
        color,
        weight: 5,
        opacity: 0.85,
      }).addTo(mapaRef.current);

      // Fit map to route bounds with padding
      mapaRef.current.fitBounds(routeLayerRef.current.getBounds(), {
        padding: [50, 50],
      });

      // Re-draw origin/destination circle markers on top of the polyline
      // (they were already placed, just bring to front via z-index)

      // Critical accident markers
      if (puntosCriticos && puntosCriticos.length > 0) {
        puntosCriticos.forEach((p, i) => {
          const rieskoVal =
            p.riesgo_predicho !== undefined
              ? p.riesgo_predicho
              : p.nivel_riesgo !== undefined
              ? p.nivel_riesgo
              : p.riesgo !== undefined
              ? p.riesgo
              : 0.5;
          const rColor =
            rieskoVal > 0.7 ? '#ef4444' : rieskoVal > 0.4 ? '#f59e0b' : '#f59e0b';
          const m = L.circleMarker(
            [parseFloat(p.latitud), parseFloat(p.longitud)],
            {
              radius: 8,
              fillColor: rColor,
              color: '#fff',
              weight: 2,
              fillOpacity: 0.9,
            }
          )
            .bindPopup(
              `<div style="min-width:160px">
                <b style="color:#1e293b">Punto Crítico #${i + 1}</b><br/>
                <span style="color:#64748b;font-size:0.85rem">Gravedad: ${
                  p.tipo || p.gravedad || 'desconocido'
                }</span><br/>
                <div style="margin-top:6px;background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden">
                  <div style="width:${Math.round(rieskoVal * 100)}%;height:100%;background:${rColor};border-radius:4px"></div>
                </div>
                <span style="font-weight:700;color:${rColor}">${Math.round(
                  rieskoVal * 100
                )}% riesgo</span>
              </div>`
            )
            .addTo(mapaRef.current);
          markersRef.current.push({ marker: m, tipo: 'critico' });
        });
      }
    },
    []
  );

  // ─── Analyze route ─────────────────────────────────────────────────────────
  const analizarRuta = async () => {
    if (!origen || !destino) {
      toast.warning('Selecciona un origen y un destino primero');
      return;
    }

    setCargando(true);
    setResultado(null);

    try {
      // 1. Get real street route from OSRM
      let osrmData;
      try {
        osrmData = await obtenerRutaOSRM(
          origen.lat,
          origen.lng,
          destino.lat,
          destino.lng
        );
      } catch (osrmErr) {
        toast.warning(
          'OSRM no disponible — usando ruta directa. ' + osrmErr.message
        );
        // Fallback: straight line with a few interpolated points
        osrmData = {
          waypoints: [
            { lat: origen.lat, lng: origen.lng },
            {
              lat: (origen.lat + destino.lat) / 2,
              lng: (origen.lng + destino.lng) / 2,
            },
            { lat: destino.lat, lng: destino.lng },
          ],
          distancia_km: parseFloat(
            (
              Math.sqrt(
                Math.pow((destino.lat - origen.lat) * 111, 2) +
                  Math.pow(
                    (destino.lng - origen.lng) *
                      111 *
                      Math.cos((origen.lat * Math.PI) / 180),
                    2
                  )
              ) * 1.3
            ).toFixed(2)
          ),
          tiempo_min: 0,
        };
      }

      // 2. Analyze risk via backend
      let backendData = null;
      try {
        backendData = await api.post('/api/rutas/analizar', {
          origen_lat: origen.lat,
          origen_lng: origen.lng,
          destino_lat: destino.lat,
          destino_lng: destino.lng,
          waypoints: osrmData.waypoints,
        });
      } catch (apiErr) {
        // Backend might not support waypoints param — retry without
        try {
          backendData = await api.post('/api/rutas/analizar', {
            origen_lat: origen.lat,
            origen_lng: origen.lng,
            destino_lat: destino.lat,
            destino_lng: destino.lng,
          });
        } catch (retryErr) {
          toast.error('Error al analizar riesgo: ' + retryErr.message);
          setCargando(false);
          return;
        }
      }

      // Merge OSRM geometry with backend risk data
      const merged = {
        ...backendData,
        waypoints: osrmData.waypoints,
        distancia_total_km:
          osrmData.distancia_km ||
          backendData.distancia_total_km ||
          0,
        tiempo_estimado_min:
          osrmData.tiempo_min > 0
            ? osrmData.tiempo_min
            : backendData.tiempo_estimado_min || 0,
      };

      setResultado(merged);

      // 3. Draw on map
      dibujarRutaEnMapa(
        osrmData.waypoints,
        merged.nivel_riesgo_general || merged.nivel_riesgo || 'bajo',
        merged.puntos_criticos || []
      );

      const nivelTexto =
        merged.nivel_riesgo_general || merged.nivel_riesgo || 'desconocido';
      toast.success(`Ruta analizada — riesgo: ${nivelTexto}`);
    } catch (error) {
      toast.error('Error inesperado: ' + error.message);
    } finally {
      setCargando(false);
    }
  };

  // ─── Clear all ─────────────────────────────────────────────────────────────
  const limpiarRuta = useCallback(() => {
    setOrigen(null);
    setDestino(null);
    setBusquedaOrigen('');
    setBusquedaDestino('');
    setSugerenciasOrigen([]);
    setSugerenciasDestino([]);
    setResultado(null);
    setSeleccionando(null);
    seleccionandoRef.current = null;

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }
    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current = [];

    if (mapaRef.current) {
      mapaRef.current.setView(CARTAGENA_CENTER, 13);
      mapaRef.current.getContainer().style.cursor = '';
    }
  }, []);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const nivelRiesgoDisplay = resultado
    ? resultado.nivel_riesgo_general || resultado.nivel_riesgo || 'Bajo'
    : null;
  const puntosCriticos = resultado
    ? resultado.puntos_criticos || []
    : [];

  const getPorcentajeRiesgo = (p) => {
    const v =
      p.riesgo_predicho !== undefined
        ? p.riesgo_predicho
        : p.nivel_riesgo !== undefined
        ? p.nivel_riesgo
        : p.riesgo !== undefined
        ? p.riesgo
        : 0.5;
    return Math.round(v * 100);
  };

  // ─── Render helpers ────────────────────────────────────────────────────────
  const renderSearchBox = (tipo) => {
    const isOrigen = tipo === 'origen';
    const busqueda = isOrigen ? busquedaOrigen : busquedaDestino;
    const setBusqueda = isOrigen ? setBusquedaOrigen : setBusquedaDestino;
    const sugerencias = isOrigen ? sugerenciasOrigen : sugerenciasDestino;
    const puntoActual = isOrigen ? origen : destino;
    const iconoColor = isOrigen ? '#22c55e' : '#ef4444';
    const label = isOrigen ? 'Origen' : 'Destino';
    const placeholder = isOrigen
      ? 'Buscar origen en Cartagena...'
      : 'Buscar destino en Cartagena...';
    const puntosRapidos = isOrigen ? PUNTOS_ORIGEN : PUNTOS_DESTINO;
    const modoActivo = seleccionando === tipo;

    return (
      <div
        style={{
          marginBottom: '1.2rem',
          paddingBottom: '1.2rem',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '0.7rem',
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: iconoColor,
              border: '2px solid #fff',
              boxShadow: `0 0 0 2px ${iconoColor}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.9rem' }}>
            {label}
          </span>
          {puntoActual && (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.72rem',
                color: '#6b7280',
                fontStyle: 'italic',
                maxWidth: 140,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {puntoActual.nombre}
            </span>
          )}
        </div>

        {/* Text search with suggestions */}
        <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              buscarLugar(e.target.value, tipo);
            }}
            placeholder={placeholder}
            autoComplete="off"
            style={{
              width: '100%',
              padding: '0.65rem 0.9rem',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.85rem',
              transition: 'border-color 0.2s',
              outline: 'none',
              fontFamily: 'inherit',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
            onBlur={(e) => (e.target.style.borderColor = '#e5e7eb')}
          />
          {sugerencias.length > 0 && (
            <ul
              style={{
                position: 'absolute',
                top: 'calc(100% + 2px)',
                left: 0,
                right: 0,
                background: 'white',
                border: '2px solid #6366f1',
                borderRadius: '8px',
                zIndex: 2000,
                maxHeight: '180px',
                overflowY: 'auto',
                listStyle: 'none',
                margin: 0,
                padding: 0,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              }}
            >
              {sugerencias.map((sug, idx) => (
                <li
                  key={idx}
                  onMouseDown={() => seleccionarSugerencia(sug, tipo)}
                  style={{
                    padding: '0.6rem 0.9rem',
                    cursor: 'pointer',
                    borderBottom:
                      idx < sugerencias.length - 1
                        ? '1px solid #f3f4f6'
                        : 'none',
                    fontSize: '0.82rem',
                    color: '#374151',
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = '#eef2ff')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = 'white')
                  }
                >
                  {isOrigen ? '🟢' : '🔴'} {sug.display_name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Select on map button */}
        <button
          onClick={() => {
            if (modoActivo) {
              setSeleccionando(null);
              seleccionandoRef.current = null;
            } else {
              setSeleccionando(tipo);
              seleccionandoRef.current = tipo;
              toast.info(
                `Haz clic en el mapa para seleccionar el ${label.toLowerCase()}`
              );
            }
          }}
          style={{
            width: '100%',
            padding: '0.55rem',
            border: `2px ${modoActivo ? 'solid' : 'dashed'} ${
              modoActivo ? iconoColor : '#6366f1'
            }`,
            borderRadius: '7px',
            background: modoActivo ? iconoColor : '#eef2ff',
            color: modoActivo ? 'white' : '#4338ca',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: '0.6rem',
          }}
        >
          {modoActivo ? '✋ Cancelar selección' : '📍 Seleccionar en el mapa'}
        </button>

        {/* Quick location chips */}
        <div>
          <div
            style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.4rem' }}
          >
            Ubicaciones rápidas:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
            {puntosRapidos.map((p, idx) => (
              <button
                key={idx}
                onClick={() => seleccionarPuntoRapido(p, tipo)}
                style={{
                  padding: '0.3rem 0.7rem',
                  background:
                    puntoActual && puntoActual.nombre === p.nombre
                      ? iconoColor
                      : '#f3f4f6',
                  color:
                    puntoActual && puntoActual.nombre === p.nombre
                      ? 'white'
                      : '#374151',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (
                    !(puntoActual && puntoActual.nombre === p.nombre)
                  ) {
                    e.currentTarget.style.background = '#e0e7ff';
                    e.currentTarget.style.color = '#4338ca';
                  }
                }}
                onMouseLeave={(e) => {
                  if (
                    !(puntoActual && puntoActual.nombre === p.nombre)
                  ) {
                    e.currentTarget.style.background = '#f3f4f6';
                    e.currentTarget.style.color = '#374151';
                  }
                }}
              >
                {p.nombre}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ruta-segura-container">
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* ── Left panel ── */}
      <div
        className="panel-ruta"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          padding: '1.2rem',
          overflowY: 'auto',
        }}
      >
        {/* Title */}
        <div style={{ marginBottom: '1.2rem' }}>
          <h2
            style={{
              color: '#1f2937',
              fontSize: '1.2rem',
              fontWeight: 700,
              marginBottom: '0.2rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            🛣️ Planificador de Rutas
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Análisis de riesgo con rutas reales por calles
          </p>
        </div>

        {/* Origin search */}
        {renderSearchBox('origen')}

        {/* Destination search */}
        {renderSearchBox('destino')}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.7rem', marginBottom: '1.2rem' }}>
          <button
            onClick={analizarRuta}
            disabled={!origen || !destino || cargando}
            style={{
              flex: 2,
              padding: '0.8rem',
              background:
                !origen || !destino || cargando
                  ? '#c7d2fe'
                  : 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '9px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: !origen || !destino || cargando ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              boxShadow:
                !origen || !destino || cargando
                  ? 'none'
                  : '0 4px 12px rgba(79,70,229,0.35)',
            }}
          >
            {cargando ? '⏳ Analizando...' : '🔍 Analizar Ruta'}
          </button>
          <button
            onClick={limpiarRuta}
            style={{
              flex: 1,
              padding: '0.8rem',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '9px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = '#e5e7eb')
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = '#f3f4f6')
            }
          >
            🗑️ Limpiar
          </button>
        </div>

        {/* Results */}
        {resultado && (
          <div
            style={{
              background: '#f9fafb',
              borderRadius: '12px',
              padding: '1rem',
              border: '1px solid #e5e7eb',
            }}
          >
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#1f2937',
                marginBottom: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              📊 Análisis de Ruta
            </h3>

            {/* Stats row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.5rem',
                marginBottom: '0.8rem',
              }}
            >
              {[
                {
                  label: 'Distancia',
                  value: `${resultado.distancia_total_km || '—'} km`,
                  icon: '📏',
                },
                {
                  label: 'Tiempo',
                  value:
                    resultado.tiempo_estimado_min > 0
                      ? `${Math.round(resultado.tiempo_estimado_min)} min`
                      : '—',
                  icon: '⏱️',
                },
                {
                  label: 'Riesgo',
                  value: nivelRiesgoDisplay,
                  icon: '⚠️',
                  color: colorRiesgo(nivelRiesgoDisplay),
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: 'white',
                    borderRadius: '8px',
                    padding: '0.6rem',
                    textAlign: 'center',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>
                    {item.icon}
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: item.color || '#1f2937',
                    }}
                  >
                    {item.value}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Risk bar */}
            <div style={{ marginBottom: '0.8rem' }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  color: '#6b7280',
                  marginBottom: '0.3rem',
                  fontWeight: 600,
                }}
              >
                Nivel de Riesgo General
              </div>
              <div
                style={{
                  background: '#e5e7eb',
                  borderRadius: '6px',
                  height: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width:
                      nivelRiesgoDisplay?.toLowerCase() === 'alto'
                        ? '90%'
                        : nivelRiesgoDisplay?.toLowerCase() === 'medio'
                        ? '55%'
                        : '20%',
                    height: '100%',
                    background: colorRiesgo(nivelRiesgoDisplay),
                    borderRadius: '6px',
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>
            </div>

            {/* Critical points */}
            {puntosCriticos.length > 0 && (
              <div style={{ marginBottom: '0.8rem' }}>
                <h4
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#374151',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  ⚠️ Puntos Críticos ({puntosCriticos.length})
                </h4>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}
                >
                  {puntosCriticos.map((p, idx) => {
                    const pct = getPorcentajeRiesgo(p);
                    const rColor = pct > 70 ? '#ef4444' : '#f59e0b';
                    return (
                      <div
                        key={idx}
                        style={{
                          background: 'white',
                          borderRadius: '7px',
                          padding: '0.55rem 0.7rem',
                          borderLeft: `3px solid ${rColor}`,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.boxShadow =
                            '0 2px 8px rgba(0,0,0,0.1)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.boxShadow = 'none')
                        }
                        onClick={() => {
                          if (mapaRef.current)
                            mapaRef.current.setView(
                              [parseFloat(p.latitud), parseFloat(p.longitud)],
                              16,
                              { animate: true }
                            );
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.25rem',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              color: '#374151',
                            }}
                          >
                            #{idx + 1}{' '}
                            {p.tipo || p.gravedad || 'Accidente'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: rColor,
                            }}
                          >
                            {pct}%
                          </span>
                        </div>
                        <div
                          style={{
                            background: '#e5e7eb',
                            borderRadius: '3px',
                            height: 5,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              background: rColor,
                              borderRadius: '3px',
                              transition: 'width 0.4s',
                            }}
                          />
                        </div>
                        {p.distancia_metros !== undefined && (
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: '#9ca3af',
                              marginTop: '0.2rem',
                            }}
                          >
                            {Math.round(p.distancia_metros)}m de la ruta
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {puntosCriticos.length === 0 && (
              <div
                style={{
                  background: '#f0fdf4',
                  borderRadius: '8px',
                  padding: '0.8rem',
                  textAlign: 'center',
                  marginBottom: '0.8rem',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>✅</span>
                <p
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: '#16a34a',
                    marginTop: '0.3rem',
                  }}
                >
                  Sin puntos críticos en esta ruta
                </p>
              </div>
            )}

            {/* Recommendations */}
            <div
              style={{
                background: 'white',
                borderRadius: '8px',
                padding: '0.8rem',
                border: '1px solid #e5e7eb',
              }}
            >
              <h4
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#374151',
                  marginBottom: '0.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                💡 Recomendaciones
              </h4>
              <ul
                style={{ listStyle: 'none', padding: 0, margin: 0 }}
              >
                {nivelRiesgoDisplay?.toLowerCase() === 'alto' && (
                  <>
                    <RecomItem>
                      ⚠️ Mantenga velocidad reducida en todo el trayecto
                    </RecomItem>
                    <RecomItem>
                      👀 Extreme precauciones en los puntos marcados en rojo
                    </RecomItem>
                    <RecomItem>
                      🌧️ Considere esperar si hay lluvia o neblina
                    </RecomItem>
                    <RecomItem>
                      🚨 Evite usar el teléfono mientras conduce
                    </RecomItem>
                  </>
                )}
                {nivelRiesgoDisplay?.toLowerCase() === 'medio' && (
                  <>
                    <RecomItem>
                      ⚡ Conduzca con precaución en zonas señaladas
                    </RecomItem>
                    <RecomItem>
                      🚦 Respete todas las señales de tránsito
                    </RecomItem>
                    <RecomItem>
                      👁️ Esté atento a los puntos críticos en naranja
                    </RecomItem>
                  </>
                )}
                {(!nivelRiesgoDisplay ||
                  nivelRiesgoDisplay.toLowerCase() === 'bajo') && (
                  <>
                    <RecomItem>
                      ✅ Ruta relativamente segura — mantenga velocidad prudente
                    </RecomItem>
                    <RecomItem>
                      🚗 Respete los límites de velocidad en todo momento
                    </RecomItem>
                    <RecomItem>
                      😊 Disfrute su viaje con responsabilidad vial
                    </RecomItem>
                  </>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* ── Map ── */}
      <div className="mapa-wrapper-ruta" style={{ position: 'relative' }}>
        <div
          ref={mapRef}
          style={{ height: '100%', width: '100%' }}
        />

        {/* Selection mode instruction banner */}
        {seleccionando && (
          <div
            style={{
              position: 'absolute',
              top: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background:
                seleccionando === 'origen'
                  ? 'rgba(34,197,94,0.95)'
                  : 'rgba(239,68,68,0.95)',
              color: 'white',
              padding: '0.75rem 1.8rem',
              borderRadius: '25px',
              zIndex: 1000,
              fontWeight: 600,
              fontSize: '0.9rem',
              boxShadow: '0 4px 15px rgba(0,0,0,0.4)',
              whiteSpace: 'nowrap',
              animation: 'fadeIn 0.3s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <span>📍</span>
            <span>
              Haz clic en el mapa para seleccionar el{' '}
              {seleccionando === 'origen' ? 'ORIGEN' : 'DESTINO'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Small helper component for recommendation list items
const RecomItem = ({ children }) => (
  <li
    style={{
      padding: '0.4rem 0.6rem',
      marginBottom: '0.3rem',
      background: '#f9fafb',
      borderRadius: '6px',
      borderLeft: '3px solid #6366f1',
      fontSize: '0.78rem',
      color: '#374151',
      lineHeight: 1.4,
    }}
  >
    {children}
  </li>
);

export default RutaSegura;
