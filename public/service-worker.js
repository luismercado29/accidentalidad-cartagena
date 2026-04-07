/* CrashMap Cartagena — Service Worker v4.0
 * Estrategia: Cache-first para assets estáticos, Network-first para API
 */

const CACHE_NAME = 'crashmap-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/static/css/main.chunk.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

// Instalación: pre-cachear assets clave
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Si falla alguno, continuar de todas formas
      });
    })
  );
  self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch: estrategia mixta
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: Network-first (siempre frescos, fallback a cache)
  if (url.pathname.startsWith('/api/') || url.port === '8000') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cachear respuestas GET exitosas de la API
          if (request.method === 'GET' && response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Sin red: intentar desde cache
          return caches.match(request).then(
            (cached) => cached || new Response(
              JSON.stringify({ error: 'Sin conexión', offline: true }),
              { headers: { 'Content-Type': 'application/json' } }
            )
          );
        })
    );
    return;
  }

  // Assets estáticos: Cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Fallback para navegación offline
        if (request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Background Sync para reportes offline
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reportes') {
    event.waitUntil(sincronizarReportesOffline());
  }
});

async function sincronizarReportesOffline() {
  try {
    const db = await abrirDB();
    const reportes = await obtenerReportesPendientes(db);
    for (const reporte of reportes) {
      try {
        await fetch('/api/accidentes/reportar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${reporte.token}` },
          body: JSON.stringify(reporte.datos),
        });
        await eliminarReporte(db, reporte.id);
      } catch {
        // Si falla, dejar para el próximo sync
      }
    }
  } catch {
    // IndexedDB no disponible
  }
}

// IndexedDB helpers para reportes offline
function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('crashmap-offline', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('reportes', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = reject;
  });
}

function obtenerReportesPendientes(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reportes', 'readonly');
    const req = tx.objectStore('reportes').getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = reject;
  });
}

function eliminarReporte(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('reportes', 'readwrite');
    tx.objectStore('reportes').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

// Push Notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'Nuevo evento de accidentalidad',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
    actions: [
      { action: 'ver', title: 'Ver en mapa' },
      { action: 'ignorar', title: 'Ignorar' },
    ],
  };
  event.waitUntil(
    self.registration.showNotification(
      data.title || 'CrashMap Cartagena',
      options
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'ver') {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  }
});
