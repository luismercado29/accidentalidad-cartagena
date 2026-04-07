# MANUAL DEL PROGRAMADOR
## CrashMap Cartagena — Documentación Técnica de Desarrollo
### Versión 4.0 · Marzo 2026

---

## CONTENIDO

1. Arquitectura general
2. Configuración del entorno de desarrollo
3. Estructura del proyecto
4. Backend — FastAPI
5. Frontend — React 18
6. Base de datos — Modelos SQLAlchemy
7. Autenticación y seguridad
8. Machine Learning — PyTorch
9. Integraciones externas
10. PWA y Service Worker
11. Convenciones de código
12. Despliegue en producción

---

## 1. ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────────────────┐
│                    NAVEGADOR / PWA                          │
│  React 18 · Leaflet · Chart.js · Service Worker            │
│  Puerto: 3000                                               │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP REST + WebSocket
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  FASTAPI BACKEND                            │
│  Python 3.x · SQLAlchemy · JWT · PyTorch                   │
│  Puerto: 8000                                               │
└─────────────────────┬───────────────────────────────────────┘
                      │ SQLAlchemy ORM
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              BASE DE DATOS                                  │
│  SQLite (desarrollo) / PostgreSQL (producción)              │
│  Archivo: backend/accidentes.db                             │
└─────────────────────────────────────────────────────────────┘
```

**Integraciones externas:**
- Twilio → Notificaciones WhatsApp
- SMTP → Notificaciones Email
- OpenStreetMap → Tiles de mapa (Leaflet)
- OpenWeatherMap → Datos climáticos (opcional)

---

## 2. CONFIGURACIÓN DEL ENTORNO DE DESARROLLO

### 2.1 Requisitos previos

```bash
Python 3.9+
Node.js 16+
Git
```

### 2.2 Clonar y configurar el backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Crear archivo de variables de entorno
cp .env.example .env
# Editar .env con los valores correctos
```

### 2.3 Variables de entorno (.env)

```env
# Base de datos
DATABASE_URL=sqlite:///./accidentes.db
# Para PostgreSQL:
# DATABASE_URL=postgresql+psycopg2://postgres:1234@localhost/accidentalidad_ctg

# Seguridad JWT
SECRET_KEY=tu_clave_secreta_aqui_minimo_32_caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+573001234567

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=tu_contraseña_de_aplicacion

# OpenWeather (opcional)
OPENWEATHER_API_KEY=tu_api_key
```

### 2.4 Arrancar el backend

```bash
cd backend
python main.py
# El servidor arranca en http://localhost:8000
# Documentación API: http://localhost:8000/docs
```

### 2.5 Configurar y arrancar el frontend

```bash
cd frontend
npm install

# Variables de entorno del frontend
# Crear archivo .env en la carpeta frontend/
echo "REACT_APP_API_URL=http://localhost:8000" > .env

npm start
# El frontend arranca en http://localhost:3000
```

---

## 3. ESTRUCTURA DEL PROYECTO

```
accidentalidad-cartagena/
│
├── backend/
│   ├── main.py                 # Toda la aplicación FastAPI (3429 líneas)
│   ├── requirements.txt        # Dependencias Python
│   ├── .env                    # Variables de entorno (no subir a git)
│   ├── .env.example            # Plantilla de variables
│   ├── accidentes.db           # Base de datos SQLite
│   └── uploads/                # Fotos subidas (puntos negros)
│
├── frontend/
│   ├── public/
│   │   ├── index.html          # HTML base con meta PWA
│   │   ├── manifest.json       # Manifest PWA
│   │   └── service-worker.js   # Service Worker offline
│   │
│   └── src/
│       ├── App.jsx             # Shell principal, routing, sidebar
│       ├── App.css             # Estilos base
│       ├── crashmap-styles.css # Estilos del tema dark
│       ├── api.js              # Cliente HTTP centralizado
│       │
│       ├── hooks/
│       │   └── useToast.js     # Hook de notificaciones toast
│       │
│       └── components/
│           ├── Login.jsx
│           ├── Dashboard.jsx
│           ├── MapaCalor.jsx
│           ├── RutaSegura.jsx
│           ├── ReporteAccidente.jsx
│           ├── GestorIncidentes.jsx
│           ├── PanelTurno.jsx
│           ├── AlertasZona.jsx
│           ├── PuntosNegros.jsx
│           ├── ComparativoInteranual.jsx
│           ├── PrediccionRiesgo.jsx
│           ├── CamarasPanel.jsx
│           ├── Toast.jsx
│           └── PerfilPanel.jsx
│
└── docs/                       # Esta documentación
```

---

## 4. BACKEND — FASTAPI

### 4.1 Estructura de main.py

El archivo `main.py` está organizado en secciones:

```
1. Imports y configuración
2. Modelos SQLAlchemy (ORM)
3. Schemas Pydantic (validación)
4. Helpers (JWT, email, WhatsApp)
5. Endpoints de autenticación
6. Endpoints de accidentes
7. Endpoints de métricas
8. Endpoints de incidentes
9. Endpoints de panel de turno
10. Endpoints de alertas
11. Endpoints de informes PDF
12. Endpoints de puntos negros
13. Endpoints de comparativo
14. Endpoints de cámaras
15. Endpoints de predicción ML
16. WebSocket
17. Inicialización de la app
```

### 4.2 Configuración de la base de datos

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./accidentes.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency injection para endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 4.3 Patrón de endpoint típico

```python
@app.get("/api/ejemplo", response_model=List[EjemploSchema])
def listar_ejemplos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)  # requiere auth
):
    return db.query(Ejemplo).filter(Ejemplo.activo == True).all()
```

### 4.4 Middleware de alertas automáticas

```python
@app.middleware("http")
async def verificar_alertas_middleware(request: Request, call_next):
    global _ultima_verificacion_alertas
    ahora = datetime.utcnow()
    if (ahora - _ultima_verificacion_alertas).total_seconds() > 300:  # 5 min
        _ultima_verificacion_alertas = ahora
        threading.Thread(target=_verificar_alertas_background, daemon=True).start()
    return await call_next(request)
```

### 4.5 Agregar un nuevo endpoint

1. Definir el modelo SQLAlchemy si se necesita tabla nueva
2. Crear el schema Pydantic para validación
3. Agregar las tablas al `create_all()` al inicio
4. Escribir la función del endpoint con decorador `@app.get/post/put/delete`
5. Probar en `http://localhost:8000/docs`

---

## 5. FRONTEND — REACT 18

### 5.1 Cliente HTTP centralizado (api.js)

```javascript
// src/api.js
const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = {
  get: async (path) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  post: async (path, body) => { /* similar */ },
  put:  async (path, body) => { /* similar */ },
  delete: async (path) => { /* similar */ },
};

export default api;
```

**Siempre usar `api.get/post/put/delete` en los componentes, nunca `fetch` directo** (excepto para subir archivos con FormData).

### 5.2 Sistema de toasts

```javascript
// En cualquier componente que recibe props { toast }
toast.success('Operación exitosa');
toast.error('Ocurrió un error');
toast.info('Información');
toast.warning('Advertencia');
```

### 5.3 Patrón de componente con Leaflet

**IMPORTANTE:** Leaflet debe importarse como módulo ES6, NUNCA como `window.L`.

```javascript
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function MiMapa() {
  const mapRef = useRef(null);      // ref al div DOM
  const mapInstRef = useRef(null);  // ref a la instancia Leaflet

  // Inicializar mapa — solo una vez
  useEffect(() => {
    if (!mapRef.current || mapInstRef.current) return;
    const map = L.map(mapRef.current, { center: [10.391, -75.4794], zoom: 12 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    mapInstRef.current = map;
    return () => { map.remove(); mapInstRef.current = null; };
  }, []); // <- deps vacío, solo monta/desmonta

  // CRÍTICO: el div del mapa debe estar SIEMPRE en el DOM,
  // nunca dentro de un bloque condicional {condicion && <div ref={mapRef} />}
  return <div ref={mapRef} style={{ width: '100%', height: 500 }} />;
}
```

### 5.4 Patrón de componente con Chart.js

```javascript
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);  // <- al inicio del archivo, fuera del componente

export default function MiGrafico({ datos }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!datos || !canvasRef.current) return;
    // Destruir instancia anterior
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    const ctx = canvasRef.current.getContext('2d');
    chartRef.current = new Chart(ctx, { type: 'bar', data: { ... }, options: { ... } });
  }, [datos]);

  return <canvas ref={canvasRef} />;
}
```

### 5.5 Variables CSS del tema (crashmap-styles.css)

```css
/* Variables DISPONIBLES */
--bg-main: #0f172a
--bg-card: #1e293b
--text-primary: #f1f5f9
--text-secondary: #94a3b8
--border: #334155
--accent: (color de acento)

/* Variables NO definidas — usar valores directos */
/* --bg-secondary → usar #253347           */
/* --input-bg     → usar #0f172a           */
/* --input-color  → usar #f1f5f9           */
```

### 5.6 Agregar un nuevo módulo

1. Crear `frontend/src/components/NuevoModulo.jsx`
2. En `App.jsx`, importar con try/catch (patrón lazy):
   ```javascript
   let NuevoModulo = null;
   try { NuevoModulo = require('./components/NuevoModulo').default; } catch {}
   ```
3. Agregar a `NAV_ITEMS`:
   ```javascript
   { id: 'nuevo', label: 'Nuevo Módulo', icon: '🆕', adminOnly: true }
   ```
4. Agregar case en `renderContent()`:
   ```javascript
   case 'nuevo':
     return NuevoModulo ? <NuevoModulo {...commonProps} /> : <Placeholder nombre="Nuevo Módulo" />;
   ```

---

## 6. BASE DE DATOS — MODELOS SQLALCHEMY

### Modelos principales

```python
class Accidente(Base):
    __tablename__ = "accidentes"
    id               = Column(Integer, primary_key=True)
    latitud          = Column(Float, nullable=False)
    longitud         = Column(Float, nullable=False)
    barrio           = Column(String(100))
    fecha_hora       = Column(DateTime)
    gravedad         = Column(String(20))     # fatal / grave / leve
    tipo_vehiculo    = Column(String(50))
    clima            = Column(String(50))
    estado_via       = Column(String(50))
    dia_festivo      = Column(Boolean, default=False)
    hora_pico        = Column(Boolean, default=False)
    descripcion      = Column(Text)
    estado           = Column(String(20), default="aprobado")  # pendiente/aprobado/rechazado
    fuente           = Column(String(20), default="manual")    # manual/excel/externo
    reportado_por    = Column(Integer, ForeignKey("usuarios.id"))
    created_at       = Column(DateTime, default=datetime.utcnow)

class Usuario(Base):
    __tablename__ = "usuarios"
    id             = Column(Integer, primary_key=True)
    username       = Column(String(50), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    es_admin       = Column(Boolean, default=False)
    created_at     = Column(DateTime, default=datetime.utcnow)

class IncidenteActivo(Base):
    __tablename__ = "incidentes_activos"
    id           = Column(Integer, primary_key=True)
    tipo         = Column(String(100))
    descripcion  = Column(Text)
    estado       = Column(String(20), default="pendiente")
    sla_minutos  = Column(Integer, default=30)
    operario     = Column(String(100))
    notas_cierre = Column(Text)
    created_at   = Column(DateTime, default=datetime.utcnow)
    closed_at    = Column(DateTime)

class PuntoNegro(Base):
    __tablename__ = "puntos_negros"
    id                   = Column(Integer, primary_key=True)
    nombre               = Column(String(200))
    lat                  = Column(Float)
    lng                  = Column(Float)
    barrio               = Column(String(100))
    total_accidentes     = Column(Integer, default=0)
    fatales              = Column(Integer, default=0)
    score_peligro        = Column(Float, default=0)
    ranking              = Column(Integer)
    estado_intervencion  = Column(String(30), default="sin_intervenir")
    notas                = Column(Text)
    foto_url             = Column(String(300))

class CamaraTransito(Base):
    __tablename__ = "camaras_transito"
    id          = Column(Integer, primary_key=True)
    nombre      = Column(String(100))
    lat         = Column(Float)
    lng         = Column(Float)
    url_stream  = Column(String(300))
    descripcion = Column(Text)
    activa      = Column(Boolean, default=True)

class ConfigAlertaZona(Base):
    __tablename__ = "config_alertas_zona"
    id              = Column(Integer, primary_key=True)
    nombre          = Column(String(100))
    lat             = Column(Float)
    lng             = Column(Float)
    radio_km        = Column(Float, default=1.0)
    max_accidentes  = Column(Integer, default=3)
    ventana_minutos = Column(Integer, default=60)
    email_alerta    = Column(String(100))
    activa          = Column(Boolean, default=True)
```

### Migraciones

El sistema usa `create_all(checkfirst=True)` al inicio para crear tablas nuevas automáticamente. No hay sistema de migraciones formal. Para cambios en esquema en producción, usar Alembic.

---

## 7. AUTENTICACIÓN Y SEGURIDAD

### JWT Flow

```
1. POST /api/auth/login  →  { access_token, token_type, es_admin, username }
2. Cliente guarda token en localStorage
3. Cada request: Header: Authorization: Bearer <token>
4. Backend decodifica token con python-jose
5. Token expira en ACCESS_TOKEN_EXPIRE_MINUTES (default 1440 = 24h)
```

### Dependency de autenticación

```python
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Usuario:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        user = db.query(Usuario).filter(Usuario.username == username).first()
        if not user:
            raise HTTPException(status_code=401)
        return user
    except JWTError:
        raise HTTPException(status_code=401)

def require_admin(user: Usuario = Depends(get_current_user)) -> Usuario:
    if not user.es_admin:
        raise HTTPException(status_code=403, detail="Se requiere rol administrador")
    return user
```

### Endpoints públicos (sin auth)

- `GET /api/panel-turno/datos` — Panel de turno
- `POST /api/auth/login`
- `POST /api/auth/register`

---

## 8. MACHINE LEARNING — PYTORCH

### Arquitectura del modelo

```python
class AccidenteRiskModel(nn.Module):
    def __init__(self, input_size=10):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_size, 64),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
    def forward(self, x):
        return self.net(x)
```

### Features del modelo

| Feature | Tipo |
|---------|------|
| hora del día | numérico (0-23) |
| día de la semana | numérico (0-6) |
| es fin de semana | binario |
| es hora pico | binario |
| es día festivo | binario |
| temperatura | numérico |
| latitud normalizada | numérico |
| longitud normalizada | numérico |
| gravedad_encoded | numérico |
| tipo_vehiculo_encoded | numérico |

### Entrenar el modelo

```
POST /api/ml/entrenar
```

El modelo se guarda en memoria y se reutiliza hasta reiniciar el servidor. Para persistencia, agregar guardado con `torch.save(model.state_dict(), 'modelo.pth')`.

### Clustering para Puntos Negros

```python
from sklearn.cluster import KMeans

# Toma coordenadas de todos los accidentes
coords = [[a.latitud, a.longitud] for a in accidentes]

# KMeans con n_clusters según volumen de datos
kmeans = KMeans(n_clusters=min(20, len(coords)//5))
kmeans.fit(coords)

# Los centroides son los puntos negros
centroids = kmeans.cluster_centers_
```

---

## 9. INTEGRACIONES EXTERNAS

### Twilio WhatsApp

```python
from twilio.rest import Client

def enviar_whatsapp(mensaje: str):
    if not all([TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM, TWILIO_TO]):
        return  # silencioso si no está configurado
    try:
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        client.messages.create(
            body=mensaje,
            from_=TWILIO_FROM,   # whatsapp:+14155238886
            to=TWILIO_TO         # whatsapp:+573001234567
        )
    except Exception as e:
        print(f"WhatsApp error: {e}")
```

### Email SMTP

```python
import smtplib
from email.mime.text import MIMEText

def enviar_email_alerta(destinatario: str, asunto: str, cuerpo: str):
    if not all([SMTP_HOST, SMTP_USER, SMTP_PASSWORD]):
        return
    msg = MIMEText(cuerpo, 'html')
    msg['Subject'] = asunto
    msg['From'] = SMTP_USER
    msg['To'] = destinatario
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASSWORD)
        s.send_message(msg)
```

### WebSocket (notificaciones tiempo real)

```python
from fastapi import WebSocket

active_connections: List[WebSocket] = []

@app.websocket("/ws/notificaciones")
async def ws_notificaciones(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive
    except:
        active_connections.remove(websocket)

async def broadcast(mensaje: dict):
    for conn in active_connections:
        await conn.send_json(mensaje)
```

---

## 10. PWA Y SERVICE WORKER

### Registrar el Service Worker

```javascript
// En public/index.html o src/index.js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}
```

### Estrategias de caché

```javascript
// service-worker.js
// Cache-first para assets estáticos
// Network-first para llamadas a la API
// Fallback offline para páginas
```

### Background Sync (reportes offline)

Cuando el usuario reporta sin conexión:
1. El reporte se guarda en IndexedDB
2. Se registra un `sync` tag: `background-sync-reports`
3. Cuando vuelve la conexión, el SW envía los reportes pendientes

---

## 11. CONVENCIONES DE CÓDIGO

### Backend (Python)

- Nombres de funciones: `snake_case`
- Nombres de clases: `PascalCase`
- Endpoints agrupados por dominio con comentarios de sección `# ══ NOMBRE ══`
- Siempre usar `try/except` en funciones de notificación externa
- Nunca exponer el stack trace completo en respuestas de error de producción

### Frontend (React/JSX)

- Nombres de componentes: `PascalCase`
- Nombres de funciones/variables: `camelCase`
- Estilos: inline styles con objetos (no clases de módulo CSS salvo crashmap-styles.css)
- No usar variables CSS no definidas (`--bg-secondary`, `--input-bg`)
- Siempre importar Leaflet y Chart.js como módulos ES6
- El div del mapa Leaflet siempre debe estar en el DOM (no dentro de condicionales)

---

## 12. DESPLIEGUE EN PRODUCCIÓN

### Backend

```bash
# Instalar uvicorn + gunicorn
pip install gunicorn uvicorn[standard]

# Ejecutar con múltiples workers
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Frontend

```bash
cd frontend
npm run build
# Los archivos estáticos quedan en frontend/build/
# Servir con nginx, Apache, o cualquier servidor de archivos estáticos
```

### Nginx (ejemplo)

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    # Frontend
    location / {
        root /var/www/crashmap/build;
        try_files $uri /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Variables de entorno en producción

```env
DATABASE_URL=postgresql+psycopg2://user:password@localhost/accidentalidad_ctg
SECRET_KEY=clave_muy_larga_y_aleatoria_para_produccion_minimo_64_caracteres
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

### Backup de la base de datos

```bash
# SQLite
cp backend/accidentes.db backup/accidentes_$(date +%Y%m%d).db

# PostgreSQL
pg_dump accidentalidad_ctg > backup_$(date +%Y%m%d).sql
```

---

*Manual del Programador — CrashMap Cartagena v4.0 · Marzo 2026*
