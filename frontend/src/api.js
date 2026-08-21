// Base de la API.
//
// Create React App incrusta las variables REACT_APP_* en tiempo de COMPILACION.
// Antes el valor por defecto era 'http://localhost:8000', asi que si la variable
// no estaba definida al construir, el bundle publicado terminaba apuntando a la
// maquina de quien abria la pagina y ninguna peticion llegaba a la API.
//
// Ahora el valor por defecto es una cadena vacia: las peticiones salen como
// rutas relativas (/api/...) y las resuelve el mismo dominio que sirve la web,
// que es como esta desplegado en Vercel.
//
// En desarrollo, el proxy declarado en package.json redirige /api al backend
// local. Definir REACT_APP_API_URL sigue funcionando si se necesita apuntar a
// un backend en otro dominio.
export const API_BASE = process.env.REACT_APP_API_URL || '';

const apiFetch = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Error desconocido' }));
    const detail = errorData.detail;
    const message = Array.isArray(detail)
      ? detail.map(e => e.msg || JSON.stringify(e)).join('; ')
      : typeof detail === 'string'
        ? detail
        : `Error HTTP ${response.status}`;
    throw new Error(message);
  }

  return response.json();
};

export const api = {
  get: (endpoint) => apiFetch(endpoint),
  post: (endpoint, data) => apiFetch(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  put: (endpoint, data) => apiFetch(endpoint, { method: 'PUT', ...(data && { body: JSON.stringify(data) }) }),
  delete: (endpoint) => apiFetch(endpoint, { method: 'DELETE' }),
};

export default api;
