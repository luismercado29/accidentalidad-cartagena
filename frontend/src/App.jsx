import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import './crashmap-styles.css';

import Login from './components/Login';
import Dashboard from './components/Dashboard';
import MapaCalor from './components/MapaCalor';
import RutaSegura from './components/RutaSegura';
import Toast from './components/Toast';
import PerfilPanel from './components/PerfilPanel';
import { useToast } from './hooks/useToast';
import api from './api';

// Lazy-load optional components that may not exist yet
let ImportarDatos   = null;
let FuentesExternas = null;
let ChatIA          = null;
let PanelPublico    = null;
let QRReporte       = null;
let Geocercas       = null;
try { ImportarDatos   = require('./components/ImportarDatos').default;   } catch {}
try { FuentesExternas = require('./components/FuentesExternas').default; } catch {}
try { ChatIA          = require('./components/ChatIA').default;          } catch {}
try { PanelPublico    = require('./components/PanelPublico').default;    } catch {}
try { QRReporte       = require('./components/QRReporte').default;       } catch {}
try { Geocercas       = require('./components/Geocercas').default;       } catch {}
let ReporteAccidente    = null;
let GestorIncidentes    = null;
let PanelTurno          = null;
let AlertasZona         = null;
let PuntosNegros        = null;
let ComparativoInteranual = null;
let CamarasPanel        = null;
let PrediccionRiesgo    = null;
try { ReporteAccidente    = require('./components/ReporteAccidente').default;    } catch {}
try { GestorIncidentes    = require('./components/GestorIncidentes').default;    } catch {}
try { PanelTurno          = require('./components/PanelTurno').default;          } catch {}
try { AlertasZona         = require('./components/AlertasZona').default;         } catch {}
try { PuntosNegros        = require('./components/PuntosNegros').default;        } catch {}
try { ComparativoInteranual = require('./components/ComparativoInteranual').default; } catch {}
try { CamarasPanel        = require('./components/CamarasPanel').default;        } catch {}
try { PrediccionRiesgo    = require('./components/PrediccionRiesgo').default;    } catch {}

// ─── Placeholder for missing admin components ────────────────────────────────
function Placeholder({ nombre }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚧</div>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{nombre}</h2>
      <p style={{ color: 'var(--text-secondary)' }}>Este módulo está en desarrollo.</p>
    </div>
  );
}

// ─── Navigation items definition ────────────────────────────────────────────
const NAV_ITEMS = [
  // General (todos los usuarios autenticados)
  { id: 'mapa',        label: 'Mapa de Calor',       icon: '🔥', adminOnly: false },
  { id: 'ruta',        label: 'Ruta Segura',         icon: '🗺️', adminOnly: false },
  { id: 'chat',        label: 'Asistente IA',        icon: '🤖', adminOnly: false },
  { id: 'publico',     label: 'Panel Público',       icon: '📢', adminOnly: false },
  { id: 'reportar',    label: 'Reportar Accidente',  icon: '📝', adminOnly: false, userOnly: true },
  // Operaciones (admin)
  { id: 'dashboard',   label: 'Dashboard',           icon: '🏠', adminOnly: true  },
  { id: 'incidentes',  label: 'Gestión Incidentes',  icon: '🚨', adminOnly: true  },
  { id: 'turno',       label: 'Panel de Turno',      icon: '📺', adminOnly: true  },
  { id: 'alertas',     label: 'Alertas por Zona',    icon: '⚡', adminOnly: true  },
  // Análisis (admin)
  { id: 'puntos',      label: 'Puntos Negros',       icon: '🔴', adminOnly: true  },
  { id: 'comparativo', label: 'Comparativo Anual',   icon: '📊', adminOnly: true  },
  { id: 'prediccion',  label: 'Predicción Riesgo',   icon: '🔮', adminOnly: true  },
  // Configuración (admin)
  { id: 'camaras',     label: 'Cámaras',             icon: '📹', adminOnly: true  },
  { id: 'importar',    label: 'Importar Datos',      icon: '⬆', adminOnly: true  },
  { id: 'fuentes',     label: 'Fuentes Externas',    icon: '📡', adminOnly: true  },
  { id: 'geocercas',   label: 'Geocercas',           icon: '🔶', adminOnly: true  },
  { id: 'qr',          label: 'Códigos QR',          icon: '📱', adminOnly: true  },
];

// ─── Time-ago helper ─────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  const now    = new Date();
  const then   = new Date(dateStr);
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'ahora mismo';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  return `hace ${diffD} d`;
}

// ─── Notification helpers ────────────────────────────────────────────────────
function notifDotColor(tipo) {
  switch (tipo) {
    case 'error':   return 'var(--danger)';
    case 'warning': return 'var(--warning)';
    case 'success': return 'var(--success)';
    default:        return 'var(--accent)';
  }
}

function notifEmoji(tipo) {
  switch (tipo) {
    case 'error':   return '🔴';
    case 'warning': return '🟡';
    case 'success': return '🟢';
    default:        return '🔵';
  }
}

function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded;
  } catch {
    return null;
  }
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') {
    return { es_admin: false, username: 'Usuario' };
  }
  return {
    es_admin: typeof user.es_admin === 'boolean' ? user.es_admin : false,
    username: typeof user.username === 'string' && user.username.length > 0 ? user.username : 'Usuario',
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Main App
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [usuario,        setUsuario]        = useState(null);
  const [token,          setToken]          = useState(null);
  const [vistaActiva,    setVistaActiva]    = useState('mapa');
  const [notificaciones, setNotificaciones] = useState([]);
  const [notifNoLeidas,  setNotifNoLeidas]  = useState(0);
  const [mostrarNotif,   setMostrarNotif]   = useState(false);
  const [mostrarPerfil,  setMostrarPerfil]  = useState(false);

  const { toasts, toast, removeToast } = useToast();
  const notifRef     = useRef(null);
  const pollInterval = useRef(null);
  const wsRef        = useRef(null);

  // ── Restore auth from localStorage ────────────────────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser  = localStorage.getItem('usuario');
    if (storedToken && storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        const usuarioNormalizado = normalizeUser(parsed);
        setToken(storedToken);
        setUsuario(usuarioNormalizado);
        setVistaActiva(usuarioNormalizado.es_admin ? 'dashboard' : 'mapa');
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
      }
    }
  }, []);

  // Navigate to 'reportar' if URL hash is #reportar
  useEffect(() => {
    if (window.location.hash === '#reportar') {
      setVistaActiva('reportar');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // ── Notification polling ───────────────────────────────────────────────────
  const fetchNotificaciones = useCallback(async () => {
    if (!token) return;
    try {
      const [dataNotif, dataCount] = await Promise.all([
        api.get('/api/notificaciones'),
        api.get('/api/notificaciones/no-leidas'),
      ]);
      setNotificaciones(Array.isArray(dataNotif) ? dataNotif : []);
      setNotifNoLeidas(
        typeof dataCount === 'number' ? dataCount : (dataCount?.count ?? 0)
      );
    } catch {
      // silently ignore background poll errors
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchNotificaciones();
    pollInterval.current = setInterval(fetchNotificaciones, 30000);

    // WebSocket real-time updates
    try {
      const wsBase = (process.env.REACT_APP_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');
      const ws = new WebSocket(`${wsBase}/ws/notificaciones`);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.tipo === 'nuevo_accidente') {
            toast.info(`Nuevo accidente: ${data.barrio || 'sin barrio'}`);
            fetchNotificaciones();
          } else if (data.tipo === 'reporte_aprobado') {
            toast.success('Reporte ciudadano aprobado');
            fetchNotificaciones();
          }
        } catch {}
      };
      ws.onerror = () => {}; // silent — WS may not be available
    } catch {}

    return () => {
      clearInterval(pollInterval.current);
      wsRef.current?.close();
    };
  }, [token, fetchNotificaciones]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close notif dropdown on outside click ─────────────────────────────────
  useEffect(() => {
    function handleOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setMostrarNotif(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // ── Login ──────────────────────────────────────────────────────────────────
  function handleLogin(newToken, newUser) {
    let tok;
    let usr;

    if (typeof newToken === 'object' && newToken !== null && newToken.access_token) {
      tok = newToken.access_token;
      const decoded = parseJwt(tok);
      usr = normalizeUser({
        es_admin: newToken.es_admin ?? decoded?.es_admin,
        username: newToken.username ?? decoded?.sub,
      });
    } else {
      tok = newToken;
      usr = normalizeUser(newUser);
    }

    setToken(tok);
    setUsuario(usr);
    localStorage.setItem('token', tok);
    localStorage.setItem('usuario', JSON.stringify(usr));
    setVistaActiva(usr.es_admin ? 'dashboard' : 'mapa');
    toast.success(`Bienvenido, ${usr.username}`);
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  function handleLogout() {
    clearInterval(pollInterval.current);
    wsRef.current?.close();
    setToken(null);
    setUsuario(null);
    setNotificaciones([]);
    setNotifNoLeidas(0);
    setMostrarNotif(false);
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    toast.info('Sesión cerrada correctamente');
  }

  // ── Mark all notifications read ────────────────────────────────────────────
  async function marcarTodasLeidas() {
    try {
      await api.post('/api/notificaciones/marcar-leidas', {});
      setNotifNoLeidas(0);
      setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
    } catch {
      // ignore
    }
  }

  // ── Nav click ──────────────────────────────────────────────────────────────
  function handleNavClick(id) {
    setVistaActiva(id);
    setMostrarNotif(false);
  }

  // ── Visible nav items (filter by role) ────────────────────────────────────
  const navVisibles = NAV_ITEMS.filter(item => {
    if (item.adminOnly && !(usuario && usuario.es_admin)) return false;
    if (item.userOnly  &&  (usuario && usuario.es_admin)) return false;
    return true;
  });

  // ── Unauthenticated: render Login ──────────────────────────────────────────
  if (!usuario || !token) {
    return (
      <>
        <Login onLogin={handleLogin} toast={toast} />
        <Toast toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  // ── Common props for content components ───────────────────────────────────
  const commonProps = { usuario, token, toast };

  // ── Render active page ─────────────────────────────────────────────────────
  function renderContent() {
    switch (vistaActiva) {
      case 'dashboard':
        return <Dashboard {...commonProps} />;
      case 'mapa':
        return <MapaCalor {...commonProps} />;
      case 'ruta':
        return <RutaSegura {...commonProps} />;
      case 'importar':
        return ImportarDatos
          ? <ImportarDatos {...commonProps} />
          : <Placeholder nombre="Importar Datos" />;
      case 'fuentes':
        return FuentesExternas
          ? <FuentesExternas {...commonProps} />
          : <Placeholder nombre="Fuentes Externas" />;
      case 'chat':
        return ChatIA
          ? <ChatIA {...commonProps} />
          : <Placeholder nombre="Asistente IA" />;
      case 'publico':
        return PanelPublico
          ? <PanelPublico {...commonProps} />
          : <Placeholder nombre="Panel Público" />;
      case 'qr':
        return QRReporte
          ? <QRReporte {...commonProps} />
          : <Placeholder nombre="Códigos QR" />;
      case 'geocercas':
        return Geocercas
          ? <Geocercas {...commonProps} />
          : <Placeholder nombre="Geocercas" />;
      case 'reportar':
        return ReporteAccidente
          ? <ReporteAccidente usuario={usuario} token={token} toast={toast} />
          : <Placeholder nombre="Reportar Accidente" />;
      // ── Nuevas vistas v4.0 ──────────────────────────────────────────────
      case 'incidentes':
        return GestorIncidentes
          ? <GestorIncidentes {...commonProps} />
          : <Placeholder nombre="Gestión de Incidentes" />;
      case 'turno':
        return PanelTurno
          ? <PanelTurno />
          : <Placeholder nombre="Panel de Turno" />;
      case 'alertas':
        return AlertasZona
          ? <AlertasZona {...commonProps} />
          : <Placeholder nombre="Alertas por Zona" />;
      case 'puntos':
        return PuntosNegros
          ? <PuntosNegros {...commonProps} />
          : <Placeholder nombre="Puntos Negros" />;
      case 'comparativo':
        return ComparativoInteranual
          ? <ComparativoInteranual {...commonProps} />
          : <Placeholder nombre="Comparativo Interanual" />;
      case 'prediccion':
        return PrediccionRiesgo
          ? <PrediccionRiesgo {...commonProps} />
          : <Placeholder nombre="Predicción de Riesgo" />;
      case 'camaras':
        return CamarasPanel
          ? <CamarasPanel {...commonProps} />
          : <Placeholder nombre="Cámaras de Tránsito" />;
      default:
        return <MapaCalor {...commonProps} />;
    }
  }

  const userInitial = (usuario.username || 'U')[0].toUpperCase();
  const userRole    = usuario.es_admin ? 'Admin' : 'Usuario';
  const activeItem  = navVisibles.find(n => n.id === vistaActiva);

  return (
    <div className="app-layout">

      {/* ════════════════════════════════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════════════════════════════════ */}
      <aside className="sidebar">

        {/* Branding */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🗺️</div>
          <div className="sidebar-logo-text">
            <span className="sidebar-logo-name">CrashMap</span>
            <span className="sidebar-logo-sub">Cartagena</span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {navVisibles.map((item, idx) => {
            const prevItem = navVisibles[idx - 1];
            // Section labels based on id transitions
            const showGeneralLabel = !item.adminOnly && (!prevItem || prevItem.adminOnly);
            const showOperacionesLabel = item.id === 'dashboard' && (!prevItem || !prevItem.adminOnly);
            const showAnalisisLabel = item.id === 'puntos';
            const showConfigLabel = item.id === 'camaras';
            return (
              <React.Fragment key={item.id}>
                {showGeneralLabel && <div className="nav-section-label">General</div>}
                {showOperacionesLabel && <div className="nav-section-label">Operaciones</div>}
                {showAnalisisLabel && <div className="nav-section-label">Análisis</div>}
                {showConfigLabel && <div className="nav-section-label">Configuración</div>}
                <button
                  className={`nav-item${vistaActiva === item.id ? ' nav-item--active' : ''}`}
                  onClick={() => handleNavClick(item.id)}
                  title={item.label}
                  aria-current={vistaActiva === item.id ? 'page' : undefined}
                >
                  <span className="nav-item-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-item-label">{item.label}</span>
                  {vistaActiva === item.id && (
                    <span className="nav-item-indicator" aria-hidden="true" />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* User card at bottom */}
        <div className="sidebar-user">
          <div className="sidebar-user-avatar" aria-hidden="true">
            {userInitial}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{usuario.username}</div>
            <span className={`badge badge-${usuario.es_admin ? 'admin' : 'usuario'}`}>
              {userRole}
            </span>
          </div>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════════════════
          MAIN AREA
      ════════════════════════════════════════════════════════════════════ */}
      <div className="main-area">

        {/* ── Top header ─────────────────────────────────────────────────── */}
        <header className="top-header" role="banner">

          {/* Current page title */}
          <div className="header-title">
            <span className="header-page-icon" aria-hidden="true">
              {activeItem?.icon ?? '📋'}
            </span>
            <span className="header-page-name">
              {activeItem?.label ?? 'Panel'}
            </span>
          </div>

          {/* Right-side actions */}
          <div className="header-actions">

            {/* ── Notifications ── */}
            <div className="notif-wrapper" ref={notifRef}>
              <button
                className="notif-btn"
                onClick={() => setMostrarNotif(prev => !prev)}
                title="Notificaciones"
                aria-label={`Notificaciones${notifNoLeidas > 0 ? `, ${notifNoLeidas} sin leer` : ''}`}
                aria-expanded={mostrarNotif}
              >
                🔔
                {notifNoLeidas > 0 && (
                  <span className="notif-badge" aria-hidden="true">
                    {notifNoLeidas > 99 ? '99+' : notifNoLeidas}
                  </span>
                )}
              </button>

              {mostrarNotif && (
                <div className="notif-dropdown" role="dialog" aria-label="Panel de notificaciones">
                  <div className="notif-dropdown-header">
                    <span className="notif-dropdown-title">Notificaciones</span>
                    {notifNoLeidas > 0 && (
                      <button
                        className="notif-mark-read-btn"
                        onClick={marcarTodasLeidas}
                      >
                        Marcar todas leídas
                      </button>
                    )}
                  </div>

                  <div className="notif-list">
                    {notificaciones.length === 0 ? (
                      <div className="notif-empty">
                        <span className="notif-empty-icon" aria-hidden="true">🔕</span>
                        <span>Sin notificaciones nuevas</span>
                      </div>
                    ) : (
                      notificaciones.slice(0, 15).map((n, idx) => (
                        <div
                          key={n.id ?? idx}
                          className={`notif-item${!n.leida ? ' notif-item--unread' : ''}`}
                        >
                          <div
                            className="notif-icon"
                            style={{ color: notifDotColor(n.tipo) }}
                            aria-hidden="true"
                          >
                            {notifEmoji(n.tipo)}
                          </div>
                          <div className="notif-body">
                            <div className="notif-text">
                              {n.mensaje ?? n.message ?? 'Notificación'}
                            </div>
                            {n.created_at && (
                              <div className="notif-time">{timeAgo(n.created_at)}</div>
                            )}
                          </div>
                          {!n.leida && (
                            <div className="notif-unread-dot" aria-label="No leída" />
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {notificaciones.length > 15 && (
                    <div className="notif-dropdown-footer">
                      +{notificaciones.length - 15} notificaciones más
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── User info (click to open profile panel) ── */}
            <div
              className="user-info-group"
              onClick={() => setMostrarPerfil(true)}
              style={{ cursor: 'pointer' }}
              title="Configuración y perfil"
            >
              <div className="user-avatar" aria-hidden="true" title={usuario.username}>
                {userInitial}
              </div>
              <div className="user-info">
                <span className="user-name">{usuario.username}</span>
                <span className={`badge badge-${usuario.es_admin ? 'admin' : 'usuario'}`}>
                  {userRole}
                </span>
              </div>
            </div>

            {/* ── Logout ── */}
            <button
              className="btn btn-danger btn-sm logout-btn"
              onClick={handleLogout}
              title="Cerrar sesión"
            >
              ⏏ Salir
            </button>
          </div>
        </header>

        {/* ── Page content ──────────────────────────────────────────────── */}
        <main className="page-content" role="main">
          {renderContent()}
        </main>
      </div>

      {/* ── Toast container ─────────────────────────────────────────────── */}
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* ── Profile / settings panel ─────────────────────────────────────── */}
      {mostrarPerfil && (
        <PerfilPanel
          usuario={usuario}
          onClose={() => setMostrarPerfil(false)}
          toast={(tipo, msg) => toast[tipo]?.(msg) || toast.info?.(msg)}
        />
      )}
    </div>
  );
}
