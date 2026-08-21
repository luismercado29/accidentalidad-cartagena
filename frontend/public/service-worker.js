/* CrashMap Cartagena — Service Worker v5
 *
 * Estrategia:
 *   - Navegaciones (HTML): network-first. NUNCA cache-first.
 *   - Assets con hash en el nombre (/static/...): cache-first, son inmutables.
 *   - API: network-first.
 *
 * Por qué cambió: antes el HTML se servía cache-first, así que tras cada
 * despliegue el index.html cacheado seguía pidiendo el bundle anterior, que ya
 * no existe en el servidor, y la página salía en blanco. Solo se arreglaba con
 * Ctrl+Shift+R, que salta el service worker.
 *
 * Además el nombre de la caché era fijo, y como el handler de activate solo
 * borra las cachés con nombre distinto, la vieja no se limpiaba nunca. Al subir
 * la versión aquí, la caché anterior se elimina al activarse esta.
 */

const CACHE_NAME = 'crashmap-v5';

// Solo recursos que existen de verdad en el build. La lista anterior incluía
// rutas del servidor de desarrollo (main.chunk.js, bundle.js) que no existen en
// producción y, como cache.addAll es atómico, hacían fallar el precacheo entero.
const STATIC_ASSETS = [
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

  // Navegaciones (el HTML de la página): network-first.
  //
  // Esto es lo que impide quedarse pegado en una versión vieja: el index.html
  // referencia bundles con hash en el nombre, así que servirlo desde caché tras
  // un despliegue apunta a archivos que ya no existen. Solo se recurre a la
  // caché si no hay red.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copia = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copia));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Resto de assets: cache-first.
  //
  // Es seguro porque los archivos bajo /static/ llevan un hash en el nombre: si
  // el contenido cambia, cambia la URL, así que nunca se sirve una versión
  // obsoleta bajo el mismo nombre.
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
      }).catch(() => undefined);
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
