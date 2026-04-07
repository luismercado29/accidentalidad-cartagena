# DOCUMENTACIÓN TÉCNICA
## CrashMap Cartagena — Especificación del Sistema
### Versión 4.0 · Marzo 2026

---

## 1. DESCRIPCIÓN GENERAL DEL SISTEMA

CrashMap Cartagena es una aplicación web de tipo SPA (Single Page Application) con arquitectura cliente-servidor. El backend expone una API REST y un endpoint WebSocket. El frontend consume esta API y presenta la información al usuario mediante componentes React con visualizaciones de mapa (Leaflet) y gráficos (Chart.js).

---

## 2. REQUISITOS DEL SISTEMA

### 2.1 Requisitos funcionales

| ID | Requisito |
|----|-----------|
| RF-01 | El sistema debe permitir el registro de accidentes con georreferenciación |
| RF-02 | Los usuarios de campo deben poder reportar accidentes desde dispositivos móviles sin instalación nativa |
| RF-03 | Los administradores deben poder aprobar, editar o rechazar reportes ciudadanos |
| RF-04 | El sistema debe visualizar los accidentes en un mapa de calor ponderado por gravedad |
| RF-05 | El sistema debe identificar automáticamente puntos negros mediante clustering |
| RF-06 | Los administradores deben gestionar incidentes activos con control de SLA |
| RF-07 | El sistema debe enviar notificaciones automáticas por WhatsApp y email |
| RF-08 | El sistema debe generar informes PDF con formato oficial |
| RF-09 | El sistema debe ofrecer predicciones de riesgo por hora y día usando ML |
| RF-10 | El sistema debe permitir comparar la accidentalidad entre dos años |
| RF-11 | El sistema debe visualizar feeds de cámaras de tránsito MJPEG |
| RF-12 | El panel de turno debe funcionar sin autenticación para uso en sala de control |

### 2.2 Requisitos no funcionales

| ID | Requisito |
|----|-----------|
| RNF-01 | El backend debe responder en menos de 500ms para el 95% de las peticiones |
| RNF-02 | La autenticación debe implementarse mediante JWT con expiración configurable |
| RNF-03 | El registro público nunca debe crear usuarios administradores |
| RNF-04 | La aplicación debe ser funcional en Chrome, Firefox y Edge modernos |
| RNF-05 | La aplicación debe ser instalable como PWA en dispositivos móviles |
| RNF-06 | Los datos sensibles (contraseñas) deben almacenarse con hash bcrypt |
| RNF-07 | El sistema debe mantener funcionamiento básico sin conexión (PWA offline) |
| RNF-08 | Las credenciales de servicios externos deben configurarse por variables de entorno |

---

## 3. DIAGRAMA DE COMPONENTES

```
┌──────────────────────────────────────────────────────────────────┐
│  FRONTEND (React 18)                                             │
│                                                                  │
│  App.jsx ──┬── Login.jsx                                        │
│             ├── Dashboard.jsx ─── Chart.js (6 gráficos)         │
│             ├── MapaCalor.jsx ─── Leaflet (heatmap)             │
│             ├── RutaSegura.jsx ── Leaflet (routing)             │
│             ├── ReporteAccidente.jsx (GPS + mapa)               │
│             ├── GestorIncidentes.jsx (SLA timer)                │
│             ├── PanelTurno.jsx ─── Leaflet (live map)           │
│             ├── AlertasZona.jsx                                  │
│             ├── PuntosNegros.jsx ─ Leaflet + clustering          │
│             ├── ComparativoInteranual.jsx ── Chart.js            │
│             ├── PrediccionRiesgo.jsx ─── Leaflet + ML            │
│             ├── CamarasPanel.jsx (MJPEG/iframe)                  │
│             └── PerfilPanel.jsx                                  │
│                                                                  │
│  api.js (cliente HTTP centralizado)                             │
│  useToast.js (notificaciones UI)                                │
│  service-worker.js (PWA offline + background sync)              │
└─────────────────────────┬────────────────────────────────────────┘
                           │ HTTP REST / WebSocket
┌─────────────────────────▼────────────────────────────────────────┐
│  BACKEND (FastAPI + Python 3.x)                                  │
│                                                                  │
│  main.py                                                         │
│  ├── Modelos ORM: Accidente, Usuario, IncidenteActivo,          │
│  │                PuntoNegro, CamaraTransito, ConfigAlertaZona  │
│  ├── Autenticación JWT (python-jose)                            │
│  ├── Endpoints REST (~45 endpoints)                             │
│  ├── WebSocket /ws/notificaciones                               │
│  ├── Middleware alertas automáticas (cada 5 min)                │
│  ├── Motor ML PyTorch (AccidenteRiskModel)                      │
│  ├── Clustering KMeans (scikit-learn)                           │
│  ├── Generador PDF (ReportLab)                                  │
│  ├── Notificaciones WhatsApp (Twilio)                           │
│  └── Notificaciones Email (SMTP)                                │
└─────────────────────────┬────────────────────────────────────────┘
                           │ SQLAlchemy ORM
┌─────────────────────────▼────────────────────────────────────────┐
│  BASE DE DATOS                                                   │
│  SQLite: backend/accidentes.db                                  │
│  (Producción: PostgreSQL)                                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. MODELOS DE DATOS

### Diagrama Entidad-Relación (simplificado)

```
USUARIO ──────────────────── ACCIDENTE
(id, username,               (id, latitud, longitud,
 hashed_password,             barrio, fecha_hora,
 es_admin)                    gravedad, tipo_vehiculo,
                              clima, estado_via,
                              dia_festivo, hora_pico,
                              descripcion, estado,
                              fuente, reportado_por→USUARIO)

INCIDENTE_ACTIVO             PUNTO_NEGRO
(id, tipo, descripcion,      (id, nombre, lat, lng,
 estado, sla_minutos,         barrio, total_accidentes,
 operario, notas_cierre,      fatales, score_peligro,
 created_at, closed_at)       ranking, estado_intervencion,
                              notas, foto_url)

CAMARA_TRANSITO              CONFIG_ALERTA_ZONA
(id, nombre, lat, lng,       (id, nombre, lat, lng,
 url_stream, descripcion,     radio_km, max_accidentes,
 activa)                      ventana_minutos,
                              email_alerta, activa)

NOTIFICACION
(id, usuario_id→USUARIO,
 mensaje, tipo, leida,
 created_at)
```

### Estados del accidente

```
pendiente ──► aprobado
pendiente ──► rechazado
```

### Estados del incidente

```
pendiente ──► en_atencion ──► cerrado
```

### Estados del punto negro

```
sin_intervenir ──► en_proceso ──► intervenido
```

---

## 5. FLUJOS PRINCIPALES

### 5.1 Flujo de reporte ciudadano

```
1. Usuario abre la app en su celular
2. Completa el formulario de accidente
3. Usa GPS o selecciona ubicación en mapa
4. Envía el reporte → POST /api/reportes/ciudadano
5. El accidente queda estado="pendiente"
6. El sistema envía notificación al admin (WebSocket)
7. Admin revisa en Dashboard → Reportes → Pendientes
8. Admin aprueba → estado="aprobado"
   - El accidente aparece en mapas y estadísticas
   ó rechaza → estado="rechazado"
```

### 5.2 Flujo de gestión de incidentes

```
1. Admin crea incidente → POST /api/incidentes
   - Estado inicial: "pendiente"
   - Cronómetro SLA inicia
2. Operario asigna atención → PUT /api/incidentes/{id}/en-atencion
   - Estado: "en_atencion"
3. Sistema monitorea SLA en tiempo real (frontend)
   - Verde < 50% del tiempo
   - Amarillo 50-100%
   - Rojo = vencido
4. Operario cierra → PUT /api/incidentes/{id}/cerrar
   - Estado: "cerrado"
   - Sistema envía WhatsApp automático al supervisor
```

### 5.3 Flujo de alertas automáticas

```
1. Admin configura alerta → POST /api/alertas/config
   (zona, radio, umbral, email)
2. Cada 5 minutos: middleware verifica todas las alertas activas
3. Para cada alerta: consulta accidentes en el radio en la ventana de tiempo
4. Si total >= max_accidentes:
   → envía email al supervisor configurado
   → registra la alerta enviada
```

### 5.4 Flujo de sincronización de puntos negros

```
1. Admin hace clic en "Sincronizar desde DB"
2. POST /api/puntos-negros/sincronizar
3. Backend extrae todos los accidentes aprobados con coordenadas
4. Ejecuta KMeans clustering (n_clusters = min(20, total/5))
5. Para cada cluster:
   - Calcula centroide geográfico
   - Cuenta total de accidentes, fatales
   - Calcula score de peligro (fórmula ponderada)
6. Guarda/actualiza en tabla puntos_negros
7. Devuelve ranking actualizado
```

---

## 6. SEGURIDAD

### 6.1 Autenticación

- Algoritmo: HS256 (HMAC con SHA-256)
- Expiración: configurable por variable de entorno (default: 1440 min = 24h)
- El token se transmite en el header `Authorization: Bearer <token>`
- En el frontend, el token se almacena en `localStorage`

### 6.2 Autorización

Tres niveles de acceso:

| Nivel | Endpoints accesibles |
|-------|---------------------|
| Público (sin auth) | `/api/auth/login`, `/api/auth/register`, `/api/panel-turno/datos` |
| Usuario autenticado | Mapa, estadísticas de lectura, reportar accidente |
| Administrador | Todos los endpoints anteriores + gestión completa |

### 6.3 Hashing de contraseñas

```python
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Guardar contraseña
hashed = pwd_context.hash(password_plano)

# Verificar contraseña
pwd_context.verify(password_plano, hashed)
```

### 6.4 Variables sensibles

Todas las credenciales (SECRET_KEY, Twilio, SMTP, DB) se cargan desde variables de entorno mediante `python-dotenv`. **Nunca se deben hardcodear en el código fuente.**

---

## 7. GESTIÓN DE ARCHIVOS

### 7.1 Subida de fotos (puntos negros)

- Endpoint: `POST /api/puntos-negros/{id}/foto`
- Tipo: `multipart/form-data`
- Almacenamiento: directorio `backend/uploads/`
- Acceso: `GET /uploads/{nombre_archivo}` (servido como archivo estático)
- Formatos aceptados: JPG, PNG, WEBP, GIF
- No hay límite de tamaño configurado (recomendado limitar a 10MB en producción)

### 7.2 Importación de Excel

- Endpoint: `POST /api/importar/excel`
- Biblioteca: `openpyxl` o `pandas`
- El sistema mapea automáticamente las columnas del Excel a los campos del modelo
- Los registros importados tienen `fuente="excel"` y `estado="aprobado"`

### 7.3 Exportación a Excel

- Endpoint: `GET /api/exportar/excel`
- Biblioteca: `openpyxl`
- Incluye todos los campos del accidente
- Respuesta: archivo .xlsx con streaming

### 7.4 Generación de PDF

- Endpoint: `GET /api/informes/pdf-mensual`
- Biblioteca: `reportlab`
- Contenido: portada con logo, resumen ejecutivo, tablas de datos, gráficos estadísticos
- Respuesta: PDF con streaming

---

## 8. WEBSOCKET — PROTOCOLO DE MENSAJES

El servidor mantiene una lista de conexiones WebSocket activas. Los mensajes se transmiten en formato JSON.

### Mensajes del servidor al cliente

```json
// Nuevo accidente registrado
{ "tipo": "nuevo_accidente", "id": 123, "barrio": "Bocagrande", "gravedad": "grave" }

// Reporte ciudadano aprobado
{ "tipo": "reporte_aprobado", "id": 25 }

// Incidente creado
{ "tipo": "incidente_creado", "id": 8, "tipo_incidente": "Colisión" }

// SLA vencido
{ "tipo": "sla_vencido", "incidente_id": 8 }
```

### Manejo en el frontend (App.jsx)

```javascript
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.tipo === 'nuevo_accidente') {
    toast.info(`Nuevo accidente: ${data.barrio}`);
    fetchNotificaciones();
  } else if (data.tipo === 'reporte_aprobado') {
    toast.success('Reporte ciudadano aprobado');
  }
};
```

---

## 9. PWA — ESPECIFICACIÓN

### manifest.json

```json
{
  "name": "CrashMap Cartagena",
  "short_name": "CrashMap",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#1a3a5c",
  "background_color": "#0d1b2a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "shortcuts": [
    { "name": "Reportar Accidente", "url": "/#reportar" },
    { "name": "Mapa de Calor", "url": "/#mapa" }
  ]
}
```

### Estrategias de caché (service-worker.js)

| Tipo de recurso | Estrategia |
|----------------|-----------|
| Assets estáticos (JS, CSS, imágenes) | Cache First |
| Llamadas a la API | Network First con fallback |
| Páginas HTML | Network First con fallback offline |
| Reportes pendientes | IndexedDB → Background Sync |

---

## 10. MODELO DE MACHINE LEARNING

### Arquitectura de la red neuronal

```
Input (10 features)
        │
   Linear(10 → 64)
        │
      ReLU()
        │
   Dropout(0.3)
        │
   Linear(64 → 32)
        │
      ReLU()
        │
   Linear(32 → 1)
        │
    Sigmoid()
        │
Output (0.0 → 1.0, probabilidad de riesgo)
```

### Features de entrada

| # | Feature | Preprocesamiento |
|---|---------|-----------------|
| 1 | hora_del_dia | normalizado 0-1 (/ 23) |
| 2 | dia_semana | normalizado 0-1 (/ 6) |
| 3 | es_fin_semana | binario 0/1 |
| 4 | es_hora_pico | binario 0/1 |
| 5 | es_dia_festivo | binario 0/1 |
| 6 | temperatura | normalizado (Tmín-Tmáx del dataset) |
| 7 | lat_norm | normalizado por bbox de Cartagena |
| 8 | lng_norm | normalizado por bbox de Cartagena |
| 9 | gravedad_encoded | fatal=2, grave=1, leve=0, normalizado |
| 10 | tipo_veh_encoded | encodificación label normalizada |

### Función de riesgo combinado

```python
riesgo_combinado = 0.5 * riesgo_ml + 0.5 * densidad_normalizada
```

Donde `densidad_normalizada` es el conteo histórico de accidentes en ese barrio/horario dividido por el máximo del dataset.

### Algoritmo de clustering (KMeans)

```python
n_clusters = min(20, max(5, len(accidentes) // 5))
kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
labels = kmeans.fit_predict(coords_array)

# Score de peligro por cluster
score = (total_accidentes * 1.0 + fatales * 5.0) / max_total_del_dataset
```

---

## 11. CONFIGURACIÓN DE CORS

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://tu-dominio.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

En producción, limitar `allow_origins` al dominio exacto del frontend.

---

## 12. LOGS Y MONITOREO

El sistema no implementa logging estructurado en la versión actual. Para producción se recomienda:

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('crashmap.log'),
        logging.StreamHandler()
    ]
)
```

Métricas recomendadas para monitoreo:
- Tiempo de respuesta por endpoint
- Tasa de errores 5xx
- Conexiones WebSocket activas
- Alertas disparadas por período
- Uso de disco (uploads, base de datos)

---

*Documentación Técnica — CrashMap Cartagena v4.0 · Marzo 2026*
