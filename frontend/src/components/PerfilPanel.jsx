import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

// ─── helpers ──────────────────────────────────────────────────────────────────
function Avatar({ name, size = 40, fontSize = '1.1rem' }) {
  const initial = (name || '?')[0].toUpperCase();
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6'];
  const bg = colors[initial.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: 700, flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function PerfilPanel({ usuario, onClose, toast }) {
  const [tab, setTab]               = useState('perfil');
  const [usuarios, setUsuarios]     = useState([]);
  const [cargandoUsers, setCargandoUsers] = useState(false);

  // password form
  const [pwActual,  setPwActual]  = useState('');
  const [pwNueva,   setPwNueva]   = useState('');
  const [pwRepeat,  setPwRepeat]  = useState('');
  const [guardando, setGuardando] = useState(false);

  // ── load users (admin only) ────────────────────────────────────────────────
  const cargarUsuarios = useCallback(async () => {
    if (!usuario?.es_admin) return;
    setCargandoUsers(true);
    try {
      const data = await api.get('/api/admin/usuarios');
      setUsuarios(Array.isArray(data) ? data : []);
    } catch (err) {
      toast('error', err.message || 'Error al cargar usuarios');
    } finally {
      setCargandoUsers(false);
    }
  }, [usuario, toast]);

  useEffect(() => {
    if (tab === 'usuarios') cargarUsuarios();
  }, [tab, cargarUsuarios]);

  // ── change password ────────────────────────────────────────────────────────
  async function handleCambiarPassword(e) {
    e.preventDefault();
    if (pwNueva !== pwRepeat) {
      toast('error', 'Las contraseñas nuevas no coinciden');
      return;
    }
    if (pwNueva.length < 6) {
      toast('error', 'La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    setGuardando(true);
    try {
      await api.put('/api/perfil/password', {
        password_actual: pwActual,
        nueva_password:  pwNueva,
      });
      toast('success', 'Contraseña actualizada correctamente');
      setPwActual(''); setPwNueva(''); setPwRepeat('');
    } catch (err) {
      toast('error', err.message || 'Error al cambiar contraseña');
    } finally {
      setGuardando(false);
    }
  }

  // ── toggle admin role ──────────────────────────────────────────────────────
  async function toggleRol(u) {
    const accion = u.es_admin ? 'quitar el rol de administrador a' : 'hacer administrador a';
    if (!window.confirm(`¿Confirmas ${accion} ${u.username}?`)) return;
    try {
      await api.put(`/api/admin/usuarios/${u.id}/rol`, { es_admin: !u.es_admin });
      toast('success', `Rol de ${u.username} actualizado`);
      cargarUsuarios();
    } catch (err) {
      toast('error', err.message || 'Error al cambiar rol');
    }
  }

  // ── delete user ────────────────────────────────────────────────────────────
  async function eliminarUsuario(u) {
    if (!window.confirm(`¿Eliminar permanentemente la cuenta de ${u.username}?`)) return;
    try {
      await api.delete(`/api/admin/usuarios/${u.id}`);
      toast('warning', `Usuario ${u.username} eliminado`);
      cargarUsuarios();
    } catch (err) {
      toast('error', err.message || 'Error al eliminar usuario');
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 1200, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 420, maxWidth: '95vw',
        background: 'white', zIndex: 1300,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.2)',
        animation: 'slideInRight 0.25s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: 'white',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
              ⚙️ Configuración
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
                width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
                fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Avatar name={usuario?.username} size={52} fontSize="1.4rem" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{usuario?.username}</div>
              <div style={{
                fontSize: '0.8rem', marginTop: '0.2rem',
                background: usuario?.es_admin ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.2)',
                border: `1px solid ${usuario?.es_admin ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.3)'}`,
                borderRadius: '20px', padding: '0.1rem 0.7rem', display: 'inline-block',
              }}>
                {usuario?.es_admin ? '👑 Administrador' : '👤 Usuario'}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: '2px solid #e5e7eb',
          flexShrink: 0,
        }}>
          {[
            { id: 'perfil',   label: '👤 Mi Perfil' },
            ...(usuario?.es_admin ? [{ id: 'usuarios', label: '👥 Usuarios' }] : []),
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '0.85rem',
                background: 'none', border: 'none', cursor: 'pointer',
                fontWeight: tab === t.id ? 700 : 500,
                color: tab === t.id ? '#6366f1' : '#6b7280',
                borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent',
                marginBottom: -2, fontSize: '0.9rem',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>

          {/* ── Tab: Perfil ── */}
          {tab === 'perfil' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Info card */}
              <div style={{
                background: '#f8fafc', borderRadius: '12px', padding: '1.2rem',
                border: '1px solid #e2e8f0',
              }}>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, marginBottom: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Información de cuenta
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#64748b' }}>Usuario</span>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{usuario?.username}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: '#64748b' }}>Rol</span>
                    <span style={{
                      fontWeight: 600,
                      color: usuario?.es_admin ? '#f59e0b' : '#6366f1',
                    }}>
                      {usuario?.es_admin ? 'Administrador' : 'Usuario'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Change password */}
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem' }}>
                  🔒 Cambiar contraseña
                </h3>
                <form onSubmit={handleCambiarPassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  {[
                    { label: 'Contraseña actual', value: pwActual, setter: setPwActual },
                    { label: 'Nueva contraseña',  value: pwNueva,  setter: setPwNueva  },
                    { label: 'Repetir nueva',      value: pwRepeat, setter: setPwRepeat },
                  ].map(({ label, value, setter }) => (
                    <div key={label}>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                        {label}
                      </label>
                      <input
                        type="password" required value={value}
                        onChange={e => setter(e.target.value)}
                        style={{
                          width: '100%', padding: '0.6rem 0.9rem',
                          border: '1.5px solid #e2e8f0', borderRadius: '8px',
                          fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
                          transition: 'border-color 0.15s',
                        }}
                        onFocus={e => e.target.style.borderColor = '#6366f1'}
                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                      />
                    </div>
                  ))}
                  <button
                    type="submit" disabled={guardando}
                    style={{
                      padding: '0.7rem',
                      background: guardando ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                      color: 'white', border: 'none', borderRadius: '8px',
                      fontWeight: 700, cursor: guardando ? 'not-allowed' : 'pointer',
                      fontSize: '0.9rem', marginTop: '0.3rem',
                    }}
                  >
                    {guardando ? 'Guardando…' : '✓ Actualizar contraseña'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ── Tab: Usuarios (admin only) ── */}
          {tab === 'usuarios' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                  Usuarios registrados
                </h3>
                <button
                  onClick={cargarUsuarios}
                  style={{
                    background: '#f1f5f9', border: '1px solid #e2e8f0',
                    borderRadius: '6px', padding: '0.3rem 0.7rem',
                    cursor: 'pointer', fontSize: '0.8rem', color: '#64748b',
                  }}
                >
                  🔄 Actualizar
                </button>
              </div>

              {cargandoUsers ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  Cargando usuarios…
                </div>
              ) : usuarios.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                  No hay usuarios registrados.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {usuarios.map(u => (
                    <div
                      key={u.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.8rem',
                        padding: '0.85rem 1rem',
                        background: u.username === usuario?.username ? '#fafaff' : 'white',
                        border: `1.5px solid ${u.username === usuario?.username ? '#c7d2fe' : '#e5e7eb'}`,
                        borderRadius: '10px',
                      }}
                    >
                      <Avatar name={u.username} size={36} fontSize="0.95rem" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {u.username}
                          {u.username === usuario?.username && (
                            <span style={{ fontSize: '0.72rem', color: '#6366f1', background: '#eef2ff', padding: '0.1rem 0.45rem', borderRadius: '10px' }}>Tú</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.1rem' }}>{u.email}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem', flexShrink: 0 }}>
                        {/* Role badge + toggle */}
                        <button
                          onClick={() => toggleRol(u)}
                          disabled={u.username === usuario?.username}
                          title={u.es_admin ? 'Quitar admin' : 'Hacer admin'}
                          style={{
                            padding: '0.2rem 0.6rem',
                            background: u.es_admin ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.1)',
                            color: u.es_admin ? '#d97706' : '#6366f1',
                            border: `1px solid ${u.es_admin ? 'rgba(245,158,11,0.3)' : 'rgba(99,102,241,0.25)'}`,
                            borderRadius: '20px', cursor: u.username === usuario?.username ? 'not-allowed' : 'pointer',
                            fontSize: '0.75rem', fontWeight: 700,
                            opacity: u.username === usuario?.username ? 0.5 : 1,
                          }}
                        >
                          {u.es_admin ? '👑 Admin' : '👤 Usuario'}
                        </button>
                        {/* Delete button - only for other users */}
                        {u.username !== usuario?.username && (
                          <button
                            onClick={() => eliminarUsuario(u)}
                            title="Eliminar usuario"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#ef4444', fontSize: '0.8rem', padding: '0.1rem 0.3rem',
                            }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{
                marginTop: '0.5rem', padding: '0.8rem 1rem',
                background: '#fefce8', borderRadius: '8px',
                border: '1px solid #fde68a', fontSize: '0.82rem', color: '#92400e',
              }}>
                💡 Haz clic en el badge de rol para cambiar entre <strong>Usuario</strong> y <strong>Admin</strong>.
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
