import React, { useState } from 'react';
import { api } from '../api';

const Login = ({ onLogin }) => {
  const [esRegistro, setEsRegistro] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body = esRegistro
        ? { username: formData.username, email: formData.email, password: formData.password }
        : { username: formData.username, password: formData.password };

      const endpoint = esRegistro ? '/api/registro' : '/api/login';
      const data = await api.post(endpoint, body);
      onLogin(data);
    } catch (err) {
      setError(err.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">🚦</div>
          <h1>Accidentalidad Cartagena</h1>
          <p>Sistema de Análisis y Prevención de Accidentes</p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab${!esRegistro ? ' active' : ''}`}
            onClick={() => setEsRegistro(false)}
          >
            Iniciar Sesión
          </button>
          <button
            className={`login-tab${esRegistro ? ' active' : ''}`}
            onClick={() => setEsRegistro(true)}
          >
            Registrarse
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">⚠️ {error}</div>
          )}

          <div className="form-group">
            <label className="form-label">Usuario</label>
            <input
              className="form-input"
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              placeholder="Ingresa tu usuario"
              autoComplete="username"
            />
          </div>

          {esRegistro && (
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                placeholder="correo@ejemplo.com"
                autoComplete="email"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              className="form-input"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              placeholder="Ingresa tu contraseña"
              autoComplete={esRegistro ? 'new-password' : 'current-password'}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '🔄 Procesando...' : esRegistro ? '📝 Registrarse' : '🚀 Iniciar Sesión'}
          </button>
        </form>

        <div className="login-info">
          <h3>Acerca del Sistema</h3>
          <ul>
            <li>🗺️ Mapa de calor de accidentalidad</li>
            <li>🛣️ Planificador de rutas seguras</li>
            <li>📊 Métricas en tiempo real (Admin)</li>
            <li>🔮 Predicciones con IA</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Login;
