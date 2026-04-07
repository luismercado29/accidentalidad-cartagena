import os
import io
import json
import asyncio
import random
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2
from typing import List, Optional, Any

import openpyxl
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status, WebSocket, WebSocketDisconnect, UploadFile, File, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, func, extract
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Optional heavy dependencies — backend starts even if these are missing
try:
    import numpy as np
    _numpy_ok = True
except ImportError:
    _numpy_ok = False
    class _NpStub:
        def array(self, *a, **k): return []
        def mean(self, *a, **k): return 0
        def percentile(self, *a, **k): return 200
        def __getattr__(self, name): return lambda *a, **k: None
    np = _NpStub()

try:
    import torch
    import torch.nn as nn
    _torch_ok = True
except ImportError:
    _torch_ok = False
    torch = None
    nn = None

try:
    from shapely.geometry import Point, shape, MultiPolygon, Polygon
    _shapely_ok = True
except ImportError:
    _shapely_ok = False
    Point = None; shape = None; MultiPolygon = None; Polygon = None

try:
    from sklearn.cluster import KMeans, DBSCAN
    from sklearn.preprocessing import StandardScaler
    _sklearn_ok = True
except ImportError:
    _sklearn_ok = False
    KMeans = None; DBSCAN = None; StandardScaler = None

# ---------------------------------------------------------------------------
# Environment & Config
# ---------------------------------------------------------------------------
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "clave_dev_no_usar_produccion")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:1234@localhost/accidentalidad_ctg",
)
MODEL_PATH = os.getenv("MODEL_PATH", "modelo_riesgo.pt")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
CARTAGENA_LAT, CARTAGENA_LNG = 10.3910, -75.4794

# ---------------------------------------------------------------------------
# Database setup (graceful - try to connect but don't fail on import)
# ---------------------------------------------------------------------------
try:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    print(f"[OK] Database connected: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'configured'}")
except Exception as _db_init_err:
    print(f"[WARN] Database connection deferred: {_db_init_err}")
    # Create dummy objects that will fail gracefully
    engine = None
    SessionLocal = None

Base = declarative_base()

# ---------------------------------------------------------------------------
# SQLAlchemy Models
# ---------------------------------------------------------------------------

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    es_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Accidente(Base):
    __tablename__ = "accidentes"

    id = Column(Integer, primary_key=True, index=True)
    latitud = Column(Float, nullable=False)
    longitud = Column(Float, nullable=False)
    barrio = Column(String(150), nullable=True)
    fecha_hora = Column(DateTime, nullable=False)
    gravedad = Column(String(20), nullable=False)       # leve / grave / fatal
    tipo_vehiculo = Column(String(100), nullable=True)
    clima = Column(String(50), nullable=True)
    estado_via = Column(String(50), nullable=True)
    dia_festivo = Column(Boolean, default=False)
    hora_pico = Column(Boolean, default=False)
    descripcion = Column(Text, nullable=True)
    reportado_por = Column(Integer, nullable=True)
    estado = Column(String(20), default="aprobado")     # pendiente / aprobado / rechazado
    fuente = Column(String(20), default="manual")       # manual / excel / externo
    created_at = Column(DateTime, default=datetime.utcnow)


class FactorRiesgo(Base):
    __tablename__ = "factores_riesgo"

    id = Column(Integer, primary_key=True, index=True)
    latitud = Column(Float, nullable=False)
    longitud = Column(Float, nullable=False)
    tipo_factor = Column(String(100), nullable=False)   # semaforo_danado / hueco / cruce_peligroso
    nivel_riesgo = Column(Float, nullable=False)        # 0-1
    activo = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(50), nullable=False)
    titulo = Column(String(255), nullable=False)
    mensaje = Column(Text, nullable=False)
    es_leida = Column(Boolean, default=False)
    datos_extra = Column(Text, nullable=True)           # JSON string for extra data
    created_at = Column(DateTime, default=datetime.utcnow)


class Geocerca(Base):
    __tablename__ = "geocercas"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text, nullable=True)
    poligono_geojson = Column(Text, nullable=False)  # GeoJSON string
    nivel_alerta = Column(String(20), default="medio")  # bajo/medio/alto/critico
    activa = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# Create tables on startup (graceful - won't crash if DB is unavailable at import time)
if engine is not None:
    try:
        from sqlalchemy import text as _text
        Base.metadata.create_all(bind=engine)
        # Auto-migration: add new columns if they don't exist (SQLite & PostgreSQL compatible)
        with engine.connect() as _conn:
            _migrations = [
                "ALTER TABLE accidentes ADD COLUMN barrio VARCHAR(150)",
                "ALTER TABLE accidentes ADD COLUMN fuente VARCHAR(20) DEFAULT 'manual'",
            ]
            for _sql in _migrations:
                try:
                    _conn.execute(_text(_sql))
                    _conn.commit()
                except Exception:
                    # Column probably already exists — ignore
                    pass
        print("[OK] Base de datos inicializada correctamente.")
    except Exception as _db_err:
        print(f"[WARN] No se pudo conectar a la base de datos al iniciar: {_db_err}")
        print("   Asegurese de que PostgreSQL este corriendo antes de hacer peticiones.")
else:
    print("[WARN] Engine is None - database initialization skipped")

# ---------------------------------------------------------------------------
# Cartagena neighborhoods
# ---------------------------------------------------------------------------
BARRIOS = [
    {"nombre": "Bocagrande", "lat": 10.3922, "lng": -75.5386},
    {"nombre": "El Laguito", "lat": 10.3980, "lng": -75.5481},
    {"nombre": "Centro Histórico", "lat": 10.4236, "lng": -75.5472},
    {"nombre": "Getsemaní", "lat": 10.4195, "lng": -75.5520},
    {"nombre": "San Diego", "lat": 10.4248, "lng": -75.5496},
    {"nombre": "La Matuna", "lat": 10.4180, "lng": -75.5420},
    {"nombre": "Manga", "lat": 10.4020, "lng": -75.5205},
    {"nombre": "Pie de la Popa", "lat": 10.4050, "lng": -75.5350},
    {"nombre": "El Cabrero", "lat": 10.4280, "lng": -75.5350},
    {"nombre": "Castillogrande", "lat": 10.3870, "lng": -75.5398},
    {"nombre": "Marbella", "lat": 10.4150, "lng": -75.5450},
    {"nombre": "El Bosque", "lat": 10.3905, "lng": -75.4880},
    {"nombre": "Zaragocilla", "lat": 10.4050, "lng": -75.5100},
    {"nombre": "Olaya Herrera", "lat": 10.3820, "lng": -75.4900},
    {"nombre": "Los Alpes", "lat": 10.3745, "lng": -75.4795},
    {"nombre": "La Esperanza", "lat": 10.3780, "lng": -75.4860},
    {"nombre": "Bazurto", "lat": 10.4110, "lng": -75.5260},
    {"nombre": "La Boquilla", "lat": 10.4600, "lng": -75.5100},
    {"nombre": "Mamonal", "lat": 10.3300, "lng": -75.4800},
    {"nombre": "Villa Olímpica", "lat": 10.3958, "lng": -75.4930},
    {"nombre": "Turbaco (vía)", "lat": 10.3450, "lng": -75.4250},
    {"nombre": "Nuevo Milenio", "lat": 10.3820, "lng": -75.4800},
    {"nombre": "San Fernando", "lat": 10.3900, "lng": -75.4820},
    {"nombre": "Av. Pedro de Heredia", "lat": 10.3995, "lng": -75.4950},
]

# ---------------------------------------------------------------------------
# Polígono de tierra de Cartagena (coordenadas simplificadas pero precisas)
# Cubre: Bocagrande, Centro, Manga, Getsemaní, zonas norte y sur continentales
# ---------------------------------------------------------------------------
_CARTAGENA_TIERRA_COORDS = [
    # Polígono principal (tierra continental + Bocagrande)
    [
        (-75.5510, 10.3820),  # Castillogrande SW
        (-75.5510, 10.3870),  # Castillogrande W
        (-75.5480, 10.3920),  # Bocagrande SW
        (-75.5430, 10.3960),  # Bocagrande W
        (-75.5400, 10.4020),  # Bocagrande N
        (-75.5350, 10.4050),  # El Laguito
        (-75.5280, 10.4080),  # Pie de la Popa W
        (-75.5200, 10.4050),  # Manga W
        (-75.5150, 10.4000),  # Manga SW
        (-75.5100, 10.3950),  # Manga S
        (-75.5050, 10.3900),  # zona industrial W
        (-75.4980, 10.3850),  # zona industrial
        (-75.4900, 10.3800),  # El Bosque S
        (-75.4820, 10.3750),  # Olaya Herrera S
        (-75.4750, 10.3720),  # sur Olaya
        (-75.4680, 10.3700),  # sur Los Alpes
        (-75.4600, 10.3690),  # SE Cartagena
        (-75.4550, 10.3710),  # SE
        (-75.4500, 10.3750),  # SE
        (-75.4450, 10.3800),  # E
        (-75.4400, 10.3860),  # NE Mamonal
        (-75.4350, 10.3920),  # NE
        (-75.4300, 10.4000),  # NE
        (-75.4280, 10.4100),  # N base
        (-75.4350, 10.4200),  # N Centro
        (-75.4400, 10.4280),  # N Centro H
        (-75.4500, 10.4350),  # NE Centro
        (-75.4600, 10.4420),  # N La Boquilla camino
        (-75.4700, 10.4480),  # N
        (-75.4800, 10.4550),  # N La Boquilla
        (-75.4900, 10.4600),  # NW La Boquilla
        (-75.5000, 10.4580),  # NW
        (-75.5100, 10.4550),  # NW
        (-75.5150, 10.4480),  # W Norte
        (-75.5200, 10.4380),  # W El Cabrero
        (-75.5300, 10.4300),  # W Getsemaní
        (-75.5400, 10.4260),  # W Centro Hist
        (-75.5480, 10.4200),  # W Getsemaní S
        (-75.5510, 10.4100),  # W Manga N
        (-75.5500, 10.4000),  # W Manga
        (-75.5480, 10.3920),  # volver Bocagrande
        (-75.5510, 10.3820),  # cierre
    ]
]

_cartagena_polygon = Polygon(_CARTAGENA_TIERRA_COORDS[0]) if _shapely_ok else None


def punto_en_tierra(lat: float, lng: float) -> bool:
    """Retorna True si las coordenadas están en tierra dentro de Cartagena."""
    if not _shapely_ok or _cartagena_polygon is None:
        return True  # sin shapely, aceptar todo (fail-open)
    try:
        p = Point(lng, lat)  # shapely usa (x=lng, y=lat)
        # Buffer generoso para no rechazar puntos costeros válidos
        return _cartagena_polygon.buffer(0.005).contains(p)
    except Exception:
        return True  # en caso de error, permitir (fail-open)


def get_barrio_cercano(lat: float, lng: float) -> str:
    """Return the name of the closest neighbourhood to the given coordinates."""
    mejor = None
    menor_dist = float("inf")
    for b in BARRIOS:
        d = _haversine_m(lat, lng, b["lat"], b["lng"])
        if d < menor_dist:
            menor_dist = d
            mejor = b["nombre"]
    return mejor or "Desconocido"


# ---------------------------------------------------------------------------
# Utility: Haversine distance (metres)
# ---------------------------------------------------------------------------
def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000.0
    la1, lo1, la2, lo2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = la2 - la1
    dlng = lo2 - lo1
    a = sin(dlat / 2) ** 2 + cos(la1) * cos(la2) * sin(dlng / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    return _haversine_m(lat1, lng1, lat2, lng2) / 1000.0


# ---------------------------------------------------------------------------
# PyTorch ML Model (only if torch is available)
# ---------------------------------------------------------------------------
if _torch_ok:
    class ModeloPrediccionRiesgo(nn.Module):
        """Simple feedforward network for accident risk prediction."""
        def __init__(self):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(10, 64), nn.ReLU(),
                nn.Linear(64, 32), nn.ReLU(),
                nn.Linear(32, 16), nn.ReLU(),
                nn.Linear(16, 1), nn.Sigmoid(),
            )
        def forward(self, x):
            return self.net(x)

    modelo_riesgo = ModeloPrediccionRiesgo()
    if os.path.exists(MODEL_PATH):
        try:
            modelo_riesgo.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
        except Exception:
            pass
    modelo_riesgo.eval()
else:
    class ModeloPrediccionRiesgo:
        pass
    modelo_riesgo = None

_CLIMA_MAP = {"soleado": 0.0, "nublado": 0.5, "lluvia": 1.0}
_VIA_MAP = {"bueno": 0.0, "regular": 0.5, "malo": 1.0}
_GRAVEDAD_MAP = {"leve": 0.0, "grave": 0.5, "fatal": 1.0}


def preparar_features_accidente(accidente: Accidente):
    """Normalise accident attributes into a (1, 10) feature tensor."""
    if not _torch_ok:
        return None
    fh = accidente.fecha_hora or datetime.utcnow()
    features = [
        (accidente.latitud or 0.0) / 100.0,
        (accidente.longitud or 0.0) / 100.0,
        fh.hour / 23.0,
        fh.weekday() / 6.0,
        _CLIMA_MAP.get(accidente.clima or "", 0.5),
        _VIA_MAP.get(accidente.estado_via or "", 0.5),
        _GRAVEDAD_MAP.get(accidente.gravedad or "", 0.5),
        float(accidente.dia_festivo or False),
        float(accidente.hora_pico or False),
        fh.month / 12.0,
    ]
    return torch.tensor(features, dtype=torch.float32).unsqueeze(0)


# ---------------------------------------------------------------------------
# WebSocket Connection Manager
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for d in dead:
            self.disconnect(d)


manager = ConnectionManager()

# ---------------------------------------------------------------------------
# Password hashing (passlib bcrypt)
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="API Accidentalidad Cartagena", version="3.0.0")
security = HTTPBearer()

# CORS configuration - allow Vercel, localhost, and any origin for now
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://accidentalidad-cartagena.vercel.app",
        "https://*.vercel.app",
        "*"  # Allow all origins in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Print full validation details so 422 errors are easy to diagnose."""
    print(f"\n[422 VALIDATION ERROR] {request.method} {request.url}")
    for err in exc.errors():
        print(f"  campo: {err.get('loc')}  msg: {err.get('msg')}  tipo: {err.get('type')}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


# ---------------------------------------------------------------------------
# Health Check Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
@app.get("/api/health")
async def health_check():
    """Health check endpoint for Vercel and monitoring."""
    try:
        # Try to check database connection
        if engine is not None and SessionLocal is not None:
            from sqlalchemy import text
            db = SessionLocal()
            db.execute(text("SELECT 1"))
            db.close()
            db_status = "connected"
        else:
            db_status = "not_configured"
        
        return {
            "status": "ok",
            "service": "API Accidentalidad Cartagena",
            "version": "3.0.0",
            "database": db_status,
            "message": "API is running and ready to accept requests"
        }
    except Exception as e:
        return {
            "status": "ok",
            "service": "API Accidentalidad Cartagena",
            "version": "3.0.0",
            "database": "error",
            "message": f"API is running but database check failed: {str(e)}"
        }


@app.on_event("startup")
def migrar_reportes_en_agua():
    """Move any accident coordinates that fall in water to the nearest land barrio."""
    if SessionLocal is None:
        print("[SKIP] Database not configured - skipping water point migration")
        return
    
    try:
        db = SessionLocal()
        accidentes = db.query(Accidente).all()
        migrados = 0
        for acc in accidentes:
            if not punto_en_tierra(acc.latitud, acc.longitud):
                barrio_cercano = get_barrio_cercano(acc.latitud, acc.longitud)
                barrio_data = next((b for b in BARRIOS if b["nombre"] == barrio_cercano), None)
                if barrio_data:
                    acc.latitud = barrio_data["lat"]
                    acc.longitud = barrio_data["lng"]
                    acc.barrio = barrio_data["nombre"]
                    migrados += 1
        if migrados:
            db.commit()
            print(f"[Migración] {migrados} accidente(s) en agua movidos a tierra.")
        db.close()
    except Exception as e:
        print(f"[Migración] Error al migrar reportes en agua: {e}")


# ---------------------------------------------------------------------------
# DB dependency
# ---------------------------------------------------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def crear_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verificar_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    try:
        payload = jwt.decode(
            credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM]
        )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")


def verificar_admin(token_data: dict = Depends(verificar_token)) -> dict:
    if not token_data.get("es_admin"):
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado: requiere permisos de administrador",
        )
    return token_data


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class UsuarioCreate(BaseModel):
    username: str
    email: str
    password: str


class LoginData(BaseModel):
    username: str
    password: str


class AccidenteBase(BaseModel):
    latitud: float
    longitud: float
    barrio: Optional[str] = None
    fecha_hora: datetime
    gravedad: str                     # leve / grave / fatal
    tipo_vehiculo: Optional[str] = None
    clima: Optional[str] = None
    estado_via: Optional[str] = None
    dia_festivo: bool = False
    hora_pico: bool = False
    descripcion: Optional[str] = None


class AccidenteCreate(AccidenteBase):
    pass


class AccidenteResponse(BaseModel):
    id: int
    latitud: float
    longitud: float
    barrio: Optional[str]
    fecha_hora: datetime
    gravedad: str
    tipo_vehiculo: Optional[str]
    clima: Optional[str]
    estado_via: Optional[str]
    dia_festivo: bool
    hora_pico: bool
    descripcion: Optional[str]
    estado: str
    fuente: str
    created_at: datetime

    class Config:
        from_attributes = True


class NotificacionResponse(BaseModel):
    id: int
    tipo: str
    titulo: str
    mensaje: str
    es_leida: bool
    datos_extra: Optional[str]
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RutaRequest(BaseModel):
    origen_lat: float
    origen_lng: float
    destino_lat: float
    destino_lng: float
    waypoints: Optional[List[dict]] = None  # OSRM route waypoints [{lat, lng}, ...]


class GeocercaCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None
    poligono_geojson: str
    nivel_alerta: str = "medio"
    activa: bool = True


class GeocercaResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str]
    poligono_geojson: str
    nivel_alerta: str
    activa: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    mensaje: str
    historial: Optional[List[dict]] = []


class CambiarPasswordRequest(BaseModel):
    password_actual: str
    nueva_password: str


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@app.post("/api/registro")
def registrar_usuario(usuario: UsuarioCreate, db: Session = Depends(get_db)):
    if db.query(Usuario).filter(Usuario.username == usuario.username).first():
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")
    if db.query(Usuario).filter(Usuario.email == usuario.email).first():
        raise HTTPException(status_code=400, detail="El email ya está registrado")

    nuevo = Usuario(
        username=usuario.username,
        email=usuario.email,
        hashed_password=hash_password(usuario.password),
        es_admin=False,  # public registration never creates admins
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    token = crear_token({"sub": nuevo.username, "es_admin": False})
    return {
        "access_token": token,
        "token_type": "bearer",
        "es_admin": False,
        "username": nuevo.username,
    }


@app.post("/api/login")
def login(datos: LoginData, db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.username == datos.username).first()
    if not user or not verify_password(datos.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    token = crear_token({"sub": user.username, "es_admin": user.es_admin})
    return {
        "access_token": token,
        "token_type": "bearer",
        "es_admin": user.es_admin,
        "username": user.username,
    }


@app.put("/api/perfil/password")
def cambiar_password(
    data: CambiarPasswordRequest,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    username = token.get("sub")
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not verify_password(data.password_actual, user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    user.hashed_password = hash_password(data.nueva_password)
    db.commit()
    return {"message": "Contraseña actualizada correctamente"}


@app.get("/api/admin/usuarios")
def listar_usuarios(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    users = db.query(Usuario).order_by(Usuario.created_at).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "es_admin": u.es_admin,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@app.put("/api/admin/usuarios/{user_id}/rol")
def cambiar_rol_usuario(
    user_id: int,
    data: dict,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    nuevo_rol = bool(data.get("es_admin", False))
    if not nuevo_rol:
        admins_count = db.query(Usuario).filter(Usuario.es_admin == True).count()
        if admins_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="No se puede quitar el rol al único administrador del sistema"
            )
    # Prevent modifying own account via this endpoint
    if user.username == token.get("sub") and not nuevo_rol:
        raise HTTPException(
            status_code=400,
            detail="No puedes quitarte el rol de administrador a ti mismo"
        )
    user.es_admin = nuevo_rol
    db.commit()
    return {"id": user.id, "username": user.username, "es_admin": user.es_admin}


@app.delete("/api/admin/usuarios/{user_id}")
def eliminar_usuario(
    user_id: int,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.username == token.get("sub"):
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta")
    admins_count = db.query(Usuario).filter(Usuario.es_admin == True).count()
    if user.es_admin and admins_count <= 1:
        raise HTTPException(status_code=400, detail="No se puede eliminar el único administrador")
    db.delete(user)
    db.commit()
    return {"message": f"Usuario {user.username} eliminado"}


# ---------------------------------------------------------------------------
# Accidentes endpoints
# ---------------------------------------------------------------------------

@app.get("/api/accidentes", response_model=List[AccidenteResponse])
def obtener_accidentes(
    barrio: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 1000,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    q = db.query(Accidente).filter(Accidente.estado == "aprobado")
    if barrio:
        q = q.filter(Accidente.barrio == barrio)
    return q.offset(skip).limit(limit).all()


@app.post("/api/accidentes", response_model=AccidenteResponse)
def crear_accidente(
    accidente: AccidenteCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    data = accidente.dict()
    if not punto_en_tierra(data["latitud"], data["longitud"]):
        raise HTTPException(
            status_code=422,
            detail="Las coordenadas están en el mar o fuera de Cartagena. Por favor selecciona una ubicación en tierra."
        )
    if not data.get("barrio"):
        data["barrio"] = get_barrio_cercano(data["latitud"], data["longitud"])
    nuevo = Accidente(**data, estado="aprobado", fuente="manual")
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    # Crear notificación
    try:
        notif = Notificacion(
            tipo="accidente",
            titulo=f"Nuevo accidente — {nuevo.barrio or 'Cartagena'}",
            mensaje=f"Accidente {nuevo.gravedad} registrado en {nuevo.barrio or 'Cartagena'}.",
            created_at=datetime.utcnow(),
        )
        db.add(notif)
        db.commit()
    except Exception:
        pass
    # Broadcast tiempo real
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(manager.broadcast(json.dumps({
                "tipo": "nuevo_accidente",
                "barrio": nuevo.barrio,
                "gravedad": nuevo.gravedad,
                "id": nuevo.id,
            })))
    except Exception:
        pass
    return nuevo


@app.put("/api/accidentes/{accidente_id}", response_model=AccidenteResponse)
def actualizar_accidente(
    accidente_id: int,
    accidente: AccidenteCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    acc = db.query(Accidente).filter(Accidente.id == accidente_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Accidente no encontrado")
    data = accidente.dict()
    if not data.get("barrio"):
        data["barrio"] = get_barrio_cercano(data["latitud"], data["longitud"])
    for key, value in data.items():
        setattr(acc, key, value)
    db.commit()
    db.refresh(acc)
    return acc


@app.delete("/api/accidentes/{accidente_id}")
def eliminar_accidente(
    accidente_id: int,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    acc = db.query(Accidente).filter(Accidente.id == accidente_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Accidente no encontrado")
    db.delete(acc)
    db.commit()
    return {"message": "Accidente eliminado exitosamente"}


@app.post("/api/accidentes/reportar", response_model=AccidenteResponse)
def reportar_accidente(
    accidente: AccidenteCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    data = accidente.dict()
    if not punto_en_tierra(data["latitud"], data["longitud"]):
        raise HTTPException(
            status_code=422,
            detail="Las coordenadas están en el mar o fuera de Cartagena. Por favor selecciona una ubicación en tierra."
        )
    if not data.get("barrio"):
        data["barrio"] = get_barrio_cercano(data["latitud"], data["longitud"])
    user_id = None
    username = token.get("sub")
    if username:
        user = db.query(Usuario).filter(Usuario.username == username).first()
        if user:
            user_id = user.id
    nuevo = Accidente(**data, estado="pendiente", fuente="manual", reportado_por=user_id)
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    # Crear notificación
    try:
        notif = Notificacion(
            tipo="accidente",
            titulo=f"Nuevo reporte — {nuevo.barrio or 'Cartagena'}",
            mensaje=f"Reporte de accidente {nuevo.gravedad} en {nuevo.barrio or 'Cartagena'}. Pendiente de revisión.",
            created_at=datetime.utcnow(),
        )
        db.add(notif)
        db.commit()
    except Exception:
        pass
    return nuevo


@app.get("/api/accidentes/mapa-calor")
def mapa_calor(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    accidentes = db.query(Accidente).filter(Accidente.estado == "aprobado").all()
    peso = {"fatal": 1.0, "grave": 0.7, "leve": 0.4}
    return {
        "puntos": [
            {"lat": a.latitud, "lng": a.longitud, "intensidad": peso.get(a.gravedad, 0.5)}
            for a in accidentes
        ]
    }


# ---------------------------------------------------------------------------
# Reportes endpoints
# ---------------------------------------------------------------------------

@app.get("/api/reportes/pendientes", response_model=List[AccidenteResponse])
def reportes_pendientes(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    return db.query(Accidente).filter(Accidente.estado == "pendiente").all()


@app.put("/api/reportes/{reporte_id}/aprobar")
def aprobar_reporte(
    reporte_id: int,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    reporte = db.query(Accidente).filter(Accidente.id == reporte_id).first()
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    reporte.estado = "aprobado"
    notif = Notificacion(
        tipo="reporte_aprobado",
        titulo="Reporte aprobado",
        mensaje=f"El reporte #{reporte_id} del barrio {reporte.barrio or 'desconocido'} ha sido aprobado.",
    )
    db.add(notif)
    db.commit()
    # Broadcast tiempo real
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.ensure_future(manager.broadcast(json.dumps({
                "tipo": "reporte_aprobado",
                "id": reporte_id,
                "barrio": reporte.barrio,
                "gravedad": reporte.gravedad,
            })))
    except Exception:
        pass
    return {"message": "Reporte aprobado exitosamente"}


@app.put("/api/reportes/{reporte_id}/rechazar")
def rechazar_reporte(
    reporte_id: int,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    reporte = db.query(Accidente).filter(Accidente.id == reporte_id).first()
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    reporte.estado = "rechazado"
    db.commit()
    return {"message": "Reporte rechazado"}


# ---------------------------------------------------------------------------
# Metricas endpoints
# ---------------------------------------------------------------------------

@app.get("/api/metricas/dashboard")
def metricas_dashboard(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    base = db.query(Accidente).filter(Accidente.estado == "aprobado")
    total = base.count()

    inicio_mes = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    este_mes = base.filter(Accidente.fecha_hora >= inicio_mes).count()

    inicio_mes_pasado = (inicio_mes - timedelta(days=1)).replace(day=1)
    mes_pasado = base.filter(
        Accidente.fecha_hora >= inicio_mes_pasado,
        Accidente.fecha_hora < inicio_mes,
    ).count()
    tasa_mensual = round(((este_mes - mes_pasado) / max(mes_pasado, 1)) * 100, 1)

    criticos = base.filter(Accidente.gravedad == "fatal").count()

    por_gravedad_rows = (
        db.query(Accidente.gravedad, func.count(Accidente.id))
        .filter(Accidente.estado == "aprobado")
        .group_by(Accidente.gravedad)
        .all()
    )
    por_clima_rows = (
        db.query(Accidente.clima, func.count(Accidente.id))
        .filter(Accidente.estado == "aprobado")
        .group_by(Accidente.clima)
        .all()
    )
    por_vehiculo_rows = (
        db.query(Accidente.tipo_vehiculo, func.count(Accidente.id))
        .filter(Accidente.estado == "aprobado")
        .group_by(Accidente.tipo_vehiculo)
        .all()
    )

    return {
        "total": total,
        "este_mes": este_mes,
        "tasa_mensual": tasa_mensual,
        "criticos": criticos,
        "por_gravedad": {g: c for g, c in por_gravedad_rows},
        "por_clima": {cl: c for cl, c in por_clima_rows},
        "por_vehiculo": {v: c for v, c in por_vehiculo_rows},
    }


@app.get("/api/metricas/tendencia-mensual")
def tendencia_mensual(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    hace_un_anio = datetime.utcnow() - timedelta(days=365)
    # SQLite-compatible: aggregate in Python
    all_acc = (
        db.query(Accidente.fecha_hora)
        .filter(Accidente.estado == "aprobado", Accidente.fecha_hora >= hace_un_anio)
        .all()
    )
    nombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
               "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    conteo: dict = {}
    for (fh,) in all_acc:
        if fh:
            key = (fh.year, fh.month)
            conteo[key] = conteo.get(key, 0) + 1
    datos = [
        {"etiqueta": f"{nombres[m - 1]} {y}", "total": conteo[(y, m)]}
        for (y, m) in sorted(conteo.keys())
    ]
    return {"datos": datos}


@app.get("/api/metricas/por-hora")
def metricas_por_hora(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    # SQLite-compatible: fetch all approved accidents and aggregate in Python
    all_acc = (
        db.query(Accidente.fecha_hora)
        .filter(Accidente.estado == "aprobado")
        .all()
    )
    conteo = {h: 0 for h in range(24)}
    for (fh,) in all_acc:
        if fh:
            conteo[fh.hour] = conteo.get(fh.hour, 0) + 1
    return {"datos": [{"hora": h, "total": conteo[h]} for h in range(24)]}


@app.get("/api/metricas/por-barrio")
def metricas_por_barrio(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    # Python aggregation for SQLite compatibility
    all_acc = (
        db.query(Accidente.barrio, Accidente.gravedad)
        .filter(Accidente.estado == "aprobado")
        .all()
    )
    barrio_stats: dict = {}
    for barrio, gravedad in all_acc:
        b = barrio or "Desconocido"
        if b not in barrio_stats:
            barrio_stats[b] = {"barrio": b, "total": 0, "fatales": 0, "graves": 0, "leves": 0}
        barrio_stats[b]["total"] += 1
        if gravedad == "fatal":
            barrio_stats[b]["fatales"] += 1
        elif gravedad == "grave":
            barrio_stats[b]["graves"] += 1
        elif gravedad == "leve":
            barrio_stats[b]["leves"] += 1

    # Attach coordinates from BARRIOS list
    coord_map = {b["nombre"]: (b["lat"], b["lng"]) for b in BARRIOS}
    resultado = []
    for nombre, stats in barrio_stats.items():
        lat, lng = coord_map.get(nombre, (10.3910, -75.4794))
        resultado.append({**stats, "lat": lat, "lng": lng})

    resultado.sort(key=lambda x: x["total"], reverse=True)
    return {"datos": resultado}


@app.get("/api/metricas/estadisticas-completas")
def estadisticas_completas(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Comprehensive statistics combining all metrics, top 5 worst zones and recent accidents."""
    base = db.query(Accidente).filter(Accidente.estado == "aprobado")
    total = base.count()

    inicio_mes = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    este_mes = base.filter(Accidente.fecha_hora >= inicio_mes).count()
    criticos = base.filter(Accidente.gravedad == "fatal").count()

    # Gravedad breakdown
    por_gravedad_rows = (
        db.query(Accidente.gravedad, func.count(Accidente.id))
        .filter(Accidente.estado == "aprobado")
        .group_by(Accidente.gravedad)
        .all()
    )

    # Top 5 barrios by accident count
    all_acc = (
        db.query(Accidente.barrio, Accidente.gravedad)
        .filter(Accidente.estado == "aprobado")
        .all()
    )
    barrio_agg: dict = {}
    for barrio, gravedad in all_acc:
        b = barrio or "Desconocido"
        if b not in barrio_agg:
            barrio_agg[b] = {"barrio": b, "total": 0, "fatales": 0}
        barrio_agg[b]["total"] += 1
        if gravedad == "fatal":
            barrio_agg[b]["fatales"] += 1

    top5 = sorted(barrio_agg.values(), key=lambda x: x["total"], reverse=True)[:5]

    # Recent 10 accidents
    recientes = base.order_by(Accidente.fecha_hora.desc()).limit(10).all()

    # Tendencia mensual (6 months) - SQLite-compatible
    hace_6m = datetime.utcnow() - timedelta(days=180)
    tendencia_all = (
        db.query(Accidente.fecha_hora)
        .filter(Accidente.estado == "aprobado", Accidente.fecha_hora >= hace_6m)
        .all()
    )
    nombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
               "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    tend_conteo: dict = {}
    for (fh,) in tendencia_all:
        if fh:
            k = (fh.year, fh.month)
            tend_conteo[k] = tend_conteo.get(k, 0) + 1
    tendencia_6m = [
        {"etiqueta": f"{nombres[m-1]} {y}", "total": tend_conteo[(y, m)]}
        for (y, m) in sorted(tend_conteo.keys())
    ]

    return {
        "resumen": {
            "total": total,
            "este_mes": este_mes,
            "criticos": criticos,
        },
        "por_gravedad": {g: c for g, c in por_gravedad_rows},
        "top5_peores_zonas": top5,
        "tendencia_6_meses": tendencia_6m,
        "accidentes_recientes": [
            {
                "id": a.id,
                "barrio": a.barrio,
                "gravedad": a.gravedad,
                "fecha_hora": a.fecha_hora.isoformat() if a.fecha_hora else None,
            }
            for a in recientes
        ],
    }


# ---------------------------------------------------------------------------
# Rutas endpoint
# ---------------------------------------------------------------------------

@app.post("/api/rutas/analizar")
def analizar_ruta(
    ruta: RutaRequest,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    # Use real OSRM waypoints if provided, else interpolate a straight line
    if ruta.waypoints and len(ruta.waypoints) >= 2:
        puntos_ruta = [
            [float(wp.get("lat", 0)), float(wp.get("lng", 0))]
            for wp in ruta.waypoints
            if wp.get("lat") is not None and wp.get("lng") is not None
        ]
        radio_critico = 350  # tighter: 350 m from actual road
    else:
        num_intermedios = 8
        puntos_ruta = []
        for i in range(num_intermedios + 2):
            t = i / (num_intermedios + 1)
            puntos_ruta.append(
                [
                    ruta.origen_lat + t * (ruta.destino_lat - ruta.origen_lat),
                    ruta.origen_lng + t * (ruta.destino_lng - ruta.origen_lng),
                ]
            )
        radio_critico = 1000  # wider: straight-line approximation

    # Bounding box: cover all waypoints + margin
    all_lats = [pt[0] for pt in puntos_ruta]
    all_lngs = [pt[1] for pt in puntos_ruta]
    lat_min = min(all_lats) - 0.005
    lat_max = max(all_lats) + 0.005
    lng_min = min(all_lngs) - 0.005
    lng_max = max(all_lngs) + 0.005

    accidentes = (
        db.query(Accidente)
        .filter(
            Accidente.latitud.between(lat_min, lat_max),
            Accidente.longitud.between(lng_min, lng_max),
            Accidente.estado == "aprobado",
        )
        .all()
    )

    puntos_criticos = []
    for acc in accidentes:
        # Minimum distance from accident to any waypoint
        min_dist = min(
            _haversine_m(acc.latitud, acc.longitud, pt[0], pt[1])
            for pt in puntos_ruta
        )
        if min_dist < radio_critico:
            riesgo = 0.5  # default if torch unavailable
            if _torch_ok and modelo_riesgo is not None:
                try:
                    with torch.no_grad():
                        features = preparar_features_accidente(acc)
                        if features is not None:
                            riesgo = modelo_riesgo(features).item()
                except Exception:
                    pass
            puntos_criticos.append(
                {
                    "latitud": acc.latitud,
                    "longitud": acc.longitud,
                    "nivel_riesgo": round(riesgo, 3),
                    "tipo": acc.gravedad,
                    "distancia_metros": round(min_dist, 1),
                }
            )

    puntos_criticos.sort(key=lambda x: x["nivel_riesgo"], reverse=True)

    distancia_km = round(_haversine_km(
        ruta.origen_lat, ruta.origen_lng,
        ruta.destino_lat, ruta.destino_lng,
    ), 2)
    tiempo_min = max(1, int(distancia_km * 3))

    if puntos_criticos:
        riesgo_prom = sum(p["nivel_riesgo"] for p in puntos_criticos) / len(puntos_criticos)
        nivel_riesgo = "alto" if riesgo_prom > 0.7 else "medio" if riesgo_prom > 0.4 else "bajo"
    else:
        nivel_riesgo = "bajo"

    return {
        "puntos_ruta": puntos_ruta,
        "puntos_criticos": puntos_criticos[:10],
        "distancia_km": distancia_km,
        "tiempo_estimado_min": tiempo_min,
        "nivel_riesgo": nivel_riesgo,
        "total_puntos_criticos": len(puntos_criticos),
    }


# ---------------------------------------------------------------------------
# Predicciones endpoint
# ---------------------------------------------------------------------------

@app.get("/api/predicciones/zona-riesgo")
def zona_riesgo(
    lat: float = Query(...),
    lng: float = Query(...),
    radio: int = Query(500),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    radio_deg = radio / 111_000  # approximate degrees
    accidentes = (
        db.query(Accidente)
        .filter(
            Accidente.latitud.between(lat - radio_deg, lat + radio_deg),
            Accidente.longitud.between(lng - radio_deg, lng + radio_deg),
            Accidente.estado == "aprobado",
        )
        .all()
    )
    # Refine by actual distance
    accidentes = [a for a in accidentes if _haversine_m(lat, lng, a.latitud, a.longitud) <= radio]

    if not accidentes:
        return {
            "nivel_riesgo": 0.1,
            "prediccion": "Zona sin historial de accidentes",
            "accidentes_historicos": 0,
        }

    riesgos = []
    for acc in accidentes:
        r = 0.5
        if _torch_ok and modelo_riesgo is not None:
            try:
                with torch.no_grad():
                    feat = preparar_features_accidente(acc)
                    if feat is not None:
                        r = modelo_riesgo(feat).item()
            except Exception:
                pass
        riesgos.append(r)

    promedio = float(sum(riesgos) / len(riesgos)) if riesgos else 0.5
    return {
        "nivel_riesgo": round(promedio, 3),
        "accidentes_historicos": len(accidentes),
        "prediccion": (
            "Alto riesgo" if promedio > 0.7
            else "Riesgo moderado" if promedio > 0.4
            else "Riesgo bajo"
        ),
    }


# ---------------------------------------------------------------------------
# Importar Excel
# ---------------------------------------------------------------------------

@app.post("/api/importar/excel")
def importar_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ("xlsx", "xls", "csv"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos .xlsx, .xls o .csv")

    contenido = file.file.read()
    try:
        buf = io.BytesIO(contenido)
        if ext == "csv":
            df = pd.read_csv(buf, dtype=str)
        elif ext == "xls":
            df = pd.read_excel(buf, engine="xlrd", dtype=str)
        else:
            df = pd.read_excel(buf, engine="openpyxl", dtype=str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer el archivo: {e}")

    # Normalise column names
    df.columns = [str(c).strip().lower() for c in df.columns]

    importados = 0
    errores = 0

    for _, row in df.iterrows():
        try:
            lat = float(row.get("latitud", ""))
            lng = float(row.get("longitud", ""))
            fh_raw = str(row.get("fecha_hora", "")).strip()
            fh = datetime.fromisoformat(fh_raw) if fh_raw else None
            if fh is None:
                errores += 1
                continue
            gravedad = str(row.get("gravedad") or "leve").lower()
            tipo_vehiculo = str(row.get("tipo_vehiculo") or "")
            clima = str(row.get("clima") or "")
            estado_via = str(row.get("estado_via") or "")
            descripcion = str(row.get("descripcion") or "")
            barrio = str(row.get("barrio") or "") or get_barrio_cercano(lat, lng)

            if not punto_en_tierra(lat, lng):
                errores += 1
                continue

            acc = Accidente(
                latitud=lat,
                longitud=lng,
                barrio=str(barrio),
                fecha_hora=fh,
                gravedad=gravedad,
                tipo_vehiculo=tipo_vehiculo,
                clima=clima,
                estado_via=estado_via,
                descripcion=descripcion,
                estado="aprobado",
                fuente="excel",
            )
            db.add(acc)
            importados += 1
        except Exception:
            errores += 1

    if importados > 0:
        db.commit()
        notif = Notificacion(
            tipo="importacion_excel",
            titulo="Importación completada",
            mensaje=f"Se importaron {importados} accidentes ({errores} errores).",
        )
        db.add(notif)
        db.commit()

    return {
        "importados": importados,
        "errores": errores,
        "mensaje": f"Importación completada: {importados} registros importados, {errores} filas con error.",
    }


# ---------------------------------------------------------------------------
# Notificaciones endpoints
# ---------------------------------------------------------------------------

@app.get("/api/notificaciones", response_model=List[NotificacionResponse])
def listar_notificaciones(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    return (
        db.query(Notificacion)
        .order_by(Notificacion.created_at.desc())
        .limit(50)
        .all()
    )


@app.get("/api/notificaciones/no-leidas")
def contar_no_leidas(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    count = db.query(Notificacion).filter(Notificacion.es_leida == False).count()
    return {"count": count}


@app.post("/api/notificaciones/marcar-leidas")
def marcar_todas_leidas(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    db.query(Notificacion).filter(Notificacion.es_leida == False).update(
        {"es_leida": True}
    )
    db.commit()
    return {"message": "Todas las notificaciones marcadas como leídas"}


@app.delete("/api/notificaciones/{notificacion_id}")
def eliminar_notificacion(
    notificacion_id: int,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    notif = db.query(Notificacion).filter(Notificacion.id == notificacion_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    db.delete(notif)
    db.commit()
    return {"message": "Notificación eliminada"}


# ---------------------------------------------------------------------------
# Fuentes externas (simulation)
# ---------------------------------------------------------------------------

_TIPOS_VEHICULO = ["moto", "automóvil", "bus", "camión", "bicicleta", "peatón"]
_GRAVEDADES = ["leve", "grave", "fatal"]
_CLIMAS = ["soleado", "nublado", "lluvia"]
_ESTADOS_VIA = ["bueno", "regular", "malo"]
_FUENTES_NOTICIAS = ["Noticias Cartagena", "El Universal", "Red Social"]


@app.post("/api/fuentes-externas/simular")
def simular_fuentes_externas(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    num = random.randint(1, 3)
    creados = []

    for _ in range(num):
        barrio_info = random.choice(BARRIOS)
        # Add small random offset so accidents don't stack exactly
        lat = barrio_info["lat"] + random.uniform(-0.003, 0.003)
        lng = barrio_info["lng"] + random.uniform(-0.003, 0.003)

        # Validar tierra antes de crear
        if not punto_en_tierra(lat, lng):
            lat = barrio_info["lat"]
            lng = barrio_info["lng"]

        gravedad = random.choice(_GRAVEDADES)
        tipo_v = random.choice(_TIPOS_VEHICULO)
        clima = random.choice(_CLIMAS)
        estado_via = random.choice(_ESTADOS_VIA)
        fuente_nombre = random.choice(_FUENTES_NOTICIAS)
        hora = random.randint(0, 23)
        fh = datetime.utcnow().replace(hour=hora, minute=random.randint(0, 59))

        acc = Accidente(
            latitud=round(lat, 6),
            longitud=round(lng, 6),
            barrio=barrio_info["nombre"],
            fecha_hora=fh,
            gravedad=gravedad,
            tipo_vehiculo=tipo_v,
            clima=clima,
            estado_via=estado_via,
            descripcion=f"Accidente reportado por {fuente_nombre}",
            estado="aprobado",
            fuente="externo",
        )
        db.add(acc)
        db.flush()

        notif = Notificacion(
            tipo="fuente_externa",
            titulo=f"Nuevo accidente detectado — {fuente_nombre}",
            mensaje=(
                f"Accidente {gravedad} en {barrio_info['nombre']} "
                f"({tipo_v}) reportado via {fuente_nombre}."
            ),
        )
        db.add(notif)
        creados.append(
            {
                "barrio": barrio_info["nombre"],
                "gravedad": gravedad,
                "tipo_vehiculo": tipo_v,
                "fuente_nombre": fuente_nombre,
            }
        )

    db.commit()
    return {
        "creados": creados,
        "total": len(creados),
        "mensaje": f"Se simularon {len(creados)} accidente(s) de fuentes externas.",
    }


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws/notificaciones")
async def websocket_notificaciones(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back or handle ping/pong
            await websocket.send_text(f"pong:{data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ---------------------------------------------------------------------------
# Clustering / Puntos Negros
# ---------------------------------------------------------------------------

@app.get("/api/analisis/puntos-negros")
def puntos_negros(
    metodo: str = Query("kmeans", enum=["kmeans", "dbscan"]),
    n_clusters: int = Query(8, ge=3, le=20),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    if not _sklearn_ok or not _numpy_ok:
        return {"clusters": [], "total_accidentes": 0, "error": "scikit-learn/numpy no instalado"}
    accs = db.query(Accidente).filter(
        Accidente.estado == "aprobado",
        Accidente.latitud.isnot(None),
        Accidente.longitud.isnot(None)
    ).all()

    if len(accs) < 10:
        return {"clusters": [], "total_accidentes": len(accs)}

    coords = np.array([[a.latitud, a.longitud] for a in accs])
    gravedades = [a.gravedad for a in accs]

    scaler = StandardScaler()
    coords_scaled = scaler.fit_transform(coords)

    if metodo == "dbscan":
        model = DBSCAN(eps=0.3, min_samples=5)
        labels = model.fit_predict(coords_scaled)
    else:
        k = min(n_clusters, len(accs) // 3)
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = model.fit_predict(coords_scaled)

    clusters = {}
    for i, label in enumerate(labels):
        if label == -1:
            continue
        if label not in clusters:
            clusters[label] = {"lats": [], "lngs": [], "gravedades": []}
        clusters[label]["lats"].append(coords[i][0])
        clusters[label]["lngs"].append(coords[i][1])
        clusters[label]["gravedades"].append(gravedades[i])

    resultado = []
    peso_grav = {"fatal": 3, "grave": 2, "leve": 1}
    for label, data in clusters.items():
        n = len(data["lats"])
        if n < 2:
            continue
        lat_c = float(np.mean(data["lats"]))
        lng_c = float(np.mean(data["lngs"]))
        # Radio aproximado en metros
        if n > 1:
            dists = [_haversine_m(lat_c, lng_c, la, lo)
                     for la, lo in zip(data["lats"], data["lngs"])]
            radio = float(np.percentile(dists, 75))
        else:
            radio = 200.0

        score = sum(peso_grav.get(g, 1) for g in data["gravedades"]) / n
        fatales = data["gravedades"].count("fatal")
        graves = data["gravedades"].count("grave")

        nivel = "critico" if (fatales > 0 or score > 2.0) else "alto" if score > 1.5 else "medio"

        resultado.append({
            "id": int(label),
            "lat": round(lat_c, 6),
            "lng": round(lng_c, 6),
            "radio_metros": round(max(radio, 100), 1),
            "total": n,
            "fatales": fatales,
            "graves": graves,
            "leves": data["gravedades"].count("leve"),
            "score_peligro": round(score, 2),
            "nivel_peligro": nivel,
        })

    resultado.sort(key=lambda x: x["score_peligro"], reverse=True)
    return {"clusters": resultado, "total_accidentes": len(accs), "metodo": metodo}


# ---------------------------------------------------------------------------
# Entrenar modelo ML
# ---------------------------------------------------------------------------

@app.post("/api/ml/entrenar")
def entrenar_modelo(
    epochs: int = Query(100, ge=10, le=500),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    if not _torch_ok:
        return {"mensaje": "PyTorch no está instalado. Ejecuta: pip install torch", "error": True}
    global modelo_riesgo

    accs = db.query(Accidente).filter(Accidente.estado == "aprobado").all()
    if len(accs) < 20:
        raise HTTPException(status_code=400, detail="Se necesitan al menos 20 accidentes aprobados para entrenar.")

    # Preparar dataset
    X_list, y_list = [], []
    for acc in accs:
        try:
            feat = preparar_features_accidente(acc).squeeze(0)
            label = 1.0 if acc.gravedad in ("grave", "fatal") else 0.0
            X_list.append(feat)
            y_list.append(label)
        except Exception:
            continue

    if len(X_list) < 20:
        raise HTTPException(status_code=400, detail="No hay suficientes datos válidos para entrenar.")

    X = torch.stack(X_list)
    y = torch.tensor(y_list, dtype=torch.float32).unsqueeze(1)

    # Re-inicializar modelo
    nuevo_modelo = ModeloPrediccionRiesgo()
    optimizer = torch.optim.Adam(nuevo_modelo.parameters(), lr=0.001)
    criterion = nn.BCELoss()

    nuevo_modelo.train()
    loss_final = 0.0
    for epoch in range(epochs):
        optimizer.zero_grad()
        outputs = nuevo_modelo(X)
        loss = criterion(outputs, y)
        loss.backward()
        optimizer.step()
        loss_final = loss.item()

    # Calcular accuracy
    nuevo_modelo.eval()
    with torch.no_grad():
        preds = (nuevo_modelo(X) > 0.5).float()
        accuracy = float((preds == y).float().mean().item())

    # Guardar modelo
    torch.save(nuevo_modelo.state_dict(), MODEL_PATH)
    modelo_riesgo = nuevo_modelo
    modelo_riesgo.eval()

    return {
        "mensaje": "Modelo entrenado exitosamente",
        "accuracy": round(accuracy * 100, 1),
        "loss_final": round(loss_final, 4),
        "muestras": len(X_list),
        "epochs": epochs,
        "fecha": datetime.utcnow().isoformat(),
    }


@app.get("/api/ml/estado")
def estado_modelo(token: dict = Depends(verificar_token)):
    existe = os.path.exists(MODEL_PATH)
    fecha = None
    if existe:
        fecha = datetime.fromtimestamp(os.path.getmtime(MODEL_PATH)).isoformat()
    return {
        "entrenado": existe,
        "fecha_entrenamiento": fecha,
        "ruta": MODEL_PATH,
    }


# ---------------------------------------------------------------------------
# Correlaciones
# ---------------------------------------------------------------------------

@app.get("/api/metricas/correlaciones")
def correlaciones(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    accs = db.query(Accidente).filter(Accidente.estado == "aprobado").all()

    # Hora vs gravedad
    hora_grav = {}
    for a in accs:
        if not a.fecha_hora:
            continue
        h = a.fecha_hora.hour
        if h not in hora_grav:
            hora_grav[h] = {"leve": 0, "grave": 0, "fatal": 0, "total": 0}
        hora_grav[h][a.gravedad] = hora_grav[h].get(a.gravedad, 0) + 1
        hora_grav[h]["total"] += 1

    # Clima vs gravedad
    clima_grav = {}
    for a in accs:
        c = a.clima or "desconocido"
        if c not in clima_grav:
            clima_grav[c] = {"leve": 0, "grave": 0, "fatal": 0, "total": 0}
        clima_grav[c][a.gravedad] = clima_grav[c].get(a.gravedad, 0) + 1
        clima_grav[c]["total"] += 1

    # Dia festivo vs gravedad
    festivo_grav = {"festivo": {"leve": 0, "grave": 0, "fatal": 0, "total": 0},
                    "normal": {"leve": 0, "grave": 0, "fatal": 0, "total": 0}}
    for a in accs:
        k = "festivo" if a.dia_festivo else "normal"
        festivo_grav[k][a.gravedad] = festivo_grav[k].get(a.gravedad, 0) + 1
        festivo_grav[k]["total"] += 1

    # Hora pico vs gravedad
    pico_grav = {"pico": {"leve": 0, "grave": 0, "fatal": 0, "total": 0},
                 "normal": {"leve": 0, "grave": 0, "fatal": 0, "total": 0}}
    for a in accs:
        k = "pico" if a.hora_pico else "normal"
        pico_grav[k][a.gravedad] = pico_grav[k].get(a.gravedad, 0) + 1
        pico_grav[k]["total"] += 1

    # Día semana vs accidentes
    dias_nombres = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
    dia_conteo = {i: 0 for i in range(7)}
    for a in accs:
        if a.fecha_hora:
            dia_conteo[a.fecha_hora.weekday()] += 1
    dias_semana = [{"dia": dias_nombres[i], "total": dia_conteo[i]} for i in range(7)]

    return {
        "hora_vs_gravedad": [
            {"hora": h, **hora_grav[h]}
            for h in sorted(hora_grav.keys())
        ],
        "clima_vs_gravedad": [
            {"clima": c, **clima_grav[c]}
            for c in clima_grav
        ],
        "festivo_vs_gravedad": festivo_grav,
        "horapico_vs_gravedad": pico_grav,
        "dias_semana": dias_semana,
    }


# ---------------------------------------------------------------------------
# Comparativa temporal (mes a mes, año a año)
# ---------------------------------------------------------------------------

@app.get("/api/metricas/comparativa")
def comparativa_temporal(
    anios: int = Query(3, ge=1, le=5),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    anio_actual = datetime.utcnow().year
    nombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

    resultado = {}
    for anio in range(anio_actual - anios + 1, anio_actual + 1):
        inicio = datetime(anio, 1, 1)
        fin = datetime(anio, 12, 31, 23, 59, 59)
        accs = (
            db.query(Accidente.fecha_hora)
            .filter(
                Accidente.estado == "aprobado",
                Accidente.fecha_hora >= inicio,
                Accidente.fecha_hora <= fin,
            )
            .all()
        )
        mes_conteo = {m: 0 for m in range(1, 13)}
        for (fh,) in accs:
            if fh:
                mes_conteo[fh.month] += 1
        resultado[str(anio)] = [mes_conteo[m] for m in range(1, 13)]

    return {
        "labels": nombres,
        "series": resultado,
        "anios": list(resultado.keys()),
    }


# ---------------------------------------------------------------------------
# Clima real (OpenWeatherMap con caché de 10 min)
# ---------------------------------------------------------------------------
_clima_cache: dict = {"data": None, "ts": None}


@app.get("/api/clima/actual")
def clima_actual():
    global _clima_cache
    ahora = datetime.utcnow()

    if _clima_cache["data"] and _clima_cache["ts"]:
        diff = (ahora - _clima_cache["ts"]).total_seconds()
        if diff < 600:  # caché de 10 min
            return _clima_cache["data"]

    if not OPENWEATHER_API_KEY:
        # Datos simulados si no hay API key
        return {
            "temperatura": 31,
            "descripcion": "Cielo despejado",
            "humedad": 78,
            "viento_kmh": 15,
            "icono": "01d",
            "ciudad": "Cartagena",
            "simulado": True,
        }

    try:
        import urllib.request
        url = (
            f"http://api.openweathermap.org/data/2.5/weather"
            f"?lat={CARTAGENA_LAT}&lon={CARTAGENA_LNG}"
            f"&appid={OPENWEATHER_API_KEY}&units=metric&lang=es"
        )
        with urllib.request.urlopen(url, timeout=5) as resp:
            weather = json.loads(resp.read())

        data = {
            "temperatura": round(weather["main"]["temp"]),
            "descripcion": weather["weather"][0]["description"].capitalize(),
            "humedad": weather["main"]["humidity"],
            "viento_kmh": round(weather["wind"]["speed"] * 3.6),
            "icono": weather["weather"][0]["icon"],
            "ciudad": "Cartagena",
            "simulado": False,
        }
        _clima_cache = {"data": data, "ts": ahora}
        return data
    except Exception:
        return {
            "temperatura": 31,
            "descripcion": "Cielo despejado",
            "humedad": 78,
            "viento_kmh": 15,
            "icono": "01d",
            "ciudad": "Cartagena",
            "simulado": True,
        }


# ---------------------------------------------------------------------------
# Chat con Claude AI
# ---------------------------------------------------------------------------

@app.post("/api/chat")
def chat_ia(
    req: ChatRequest,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    if not ANTHROPIC_API_KEY:
        return {
            "respuesta": "El chat con IA no está configurado. Agrega ANTHROPIC_API_KEY al archivo .env del backend.",
            "configurado": False,
        }

    try:
        import anthropic as _anthropic

        # Contexto de datos reales de la BD
        total = db.query(Accidente).filter(Accidente.estado == "aprobado").count()
        fatales = db.query(Accidente).filter(Accidente.estado == "aprobado", Accidente.gravedad == "fatal").count()
        pendientes = db.query(Accidente).filter(Accidente.estado == "pendiente").count()
        inicio_mes = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        este_mes = db.query(Accidente).filter(Accidente.estado == "aprobado", Accidente.fecha_hora >= inicio_mes).count()

        # Top 3 barrios
        all_b = db.query(Accidente.barrio).filter(Accidente.estado == "aprobado").all()
        barrio_cnt: dict = {}
        for (b,) in all_b:
            if b:
                barrio_cnt[b] = barrio_cnt.get(b, 0) + 1
        top3 = sorted(barrio_cnt.items(), key=lambda x: x[1], reverse=True)[:3]
        top3_str = ", ".join(f"{b}({c})" for b, c in top3)

        system_prompt = f"""Eres un asistente experto en seguridad vial, movilidad y accidentalidad para la ciudad de Cartagena de Indias, Colombia.
Trabajas con el sistema CrashMap de la Secretaría de Tránsito de Cartagena.

DATOS ACTUALES DEL SISTEMA:
- Total accidentes registrados: {total}
- Accidentes fatales: {fatales}
- Accidentes este mes: {este_mes}
- Reportes pendientes de revisión: {pendientes}
- Top 3 barrios con más accidentes: {top3_str if top3_str else "sin datos suficientes"}

INSTRUCCIONES:
- Responde en español, de forma clara, profesional y útil.
- Puedes responder CUALQUIER pregunta relacionada con accidentalidad, tráfico, seguridad vial, movilidad, normativa de tránsito o prevención de accidentes en Cartagena.
- Usa los datos del sistema cuando sean relevantes. Si la pregunta es general, responde con tu conocimiento sobre Cartagena y Colombia.
- Puedes hablar sobre barrios, vías, estadísticas, causas de accidentes, recomendaciones de seguridad, horarios peligrosos, tipos de vehículos, clima y su efecto en accidentes, etc.
- Si no tienes un dato exacto, da información útil basada en lo que sí sabes.
- Sé conciso pero completo. Usa viñetas o listas cuando ayude a la claridad.
- No te limites a temas predefinidos: responde cualquier pregunta relacionada con la accidentalidad y seguridad vial en Cartagena."""

        # Construir mensajes con historial (max 10 últimos)
        messages = []
        for msg in (req.historial or [])[-10:]:
            if msg.get("role") in ("user", "assistant"):
                messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": req.mensaje})

        client = _anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )

        return {
            "respuesta": response.content[0].text,
            "configurado": True,
        }

    except ImportError:
        return {
            "respuesta": "Paquete 'anthropic' no instalado. Ejecuta: pip install anthropic",
            "configurado": False,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en chat IA: {str(e)}")


# ---------------------------------------------------------------------------
# Geocercas
# ---------------------------------------------------------------------------

def _verificar_geocercas(lat: float, lng: float, db: Session) -> List[str]:
    """Retorna nombres de geocercas activas que contienen el punto dado."""
    if not _shapely_ok:
        return []
    geocercas = db.query(Geocerca).filter(Geocerca.activa == True).all()
    alertas = []
    p = Point(lng, lat)
    for geo in geocercas:
        try:
            geojson = json.loads(geo.poligono_geojson)
            poly = shape(geojson)
            if poly.contains(p):
                alertas.append(geo.nombre)
        except Exception:
            continue
    return alertas


@app.get("/api/geocercas", response_model=List[GeocercaResponse])
def listar_geocercas(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    return db.query(Geocerca).order_by(Geocerca.created_at.desc()).all()


@app.post("/api/geocercas", response_model=GeocercaResponse)
def crear_geocerca(
    geo: GeocercaCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    nueva = Geocerca(**geo.dict())
    db.add(nueva)
    db.commit()
    db.refresh(nueva)
    return nueva


@app.put("/api/geocercas/{geo_id}", response_model=GeocercaResponse)
def actualizar_geocerca(
    geo_id: int,
    geo: GeocercaCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    g = db.query(Geocerca).filter(Geocerca.id == geo_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Geocerca no encontrada")
    for k, v in geo.dict().items():
        setattr(g, k, v)
    db.commit()
    db.refresh(g)
    return g


@app.delete("/api/geocercas/{geo_id}")
def eliminar_geocerca(
    geo_id: int,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    g = db.query(Geocerca).filter(Geocerca.id == geo_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Geocerca no encontrada")
    db.delete(g)
    db.commit()
    return {"message": "Geocerca eliminada"}


# ---------------------------------------------------------------------------
# Panel Público (sin autenticación)
# ---------------------------------------------------------------------------

@app.get("/api/publico/estadisticas")
def publico_estadisticas(db: Session = Depends(get_db)):
    base = db.query(Accidente).filter(Accidente.estado == "aprobado")
    total = base.count()
    fatales = base.filter(Accidente.gravedad == "fatal").count()
    graves = base.filter(Accidente.gravedad == "grave").count()
    leves = base.filter(Accidente.gravedad == "leve").count()

    # Tendencia últimos 6 meses
    hace_6m = datetime.utcnow() - timedelta(days=180)
    nombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    all_fh = db.query(Accidente.fecha_hora).filter(
        Accidente.estado == "aprobado", Accidente.fecha_hora >= hace_6m
    ).all()
    cnt: dict = {}
    for (fh,) in all_fh:
        if fh:
            k = (fh.year, fh.month)
            cnt[k] = cnt.get(k, 0) + 1
    tendencia = [{"etiqueta": f"{nombres[m-1]} {y}", "total": cnt[(y, m)]} for (y, m) in sorted(cnt.keys())]

    # Top 5 barrios (sin coordenadas exactas)
    all_b = db.query(Accidente.barrio).filter(Accidente.estado == "aprobado").all()
    bcnt: dict = {}
    for (b,) in all_b:
        if b:
            bcnt[b] = bcnt.get(b, 0) + 1
    top5 = [{"barrio": b, "total": c} for b, c in sorted(bcnt.items(), key=lambda x: x[1], reverse=True)[:5]]

    return {
        "total": total,
        "por_gravedad": {"fatal": fatales, "grave": graves, "leve": leves},
        "tendencia_6_meses": tendencia,
        "top5_barrios": top5,
        "ultima_actualizacion": datetime.utcnow().isoformat(),
    }


@app.get("/api/publico/mapa-calor")
def publico_mapa_calor(db: Session = Depends(get_db)):
    accs = db.query(Accidente).filter(Accidente.estado == "aprobado").all()
    peso = {"fatal": 1.0, "grave": 0.7, "leve": 0.4}
    # Coordenadas redondeadas a 3 decimales para privacidad
    return {
        "puntos": [
            {
                "lat": round(a.latitud, 3),
                "lng": round(a.longitud, 3),
                "intensidad": peso.get(a.gravedad, 0.5),
            }
            for a in accs if a.latitud and a.longitud
        ]
    }


# ---------------------------------------------------------------------------
# WebSocket broadcast manual
# ---------------------------------------------------------------------------

@app.post("/api/ws/broadcast-test")
async def broadcast_test(
    mensaje: dict,
    token: dict = Depends(verificar_admin),
):
    await manager.broadcast(json.dumps(mensaje))
    return {"enviado": True, "conexiones": len(manager.active_connections)}


# ---------------------------------------------------------------------------
# Exportar resumen PDF (datos para el cliente)
# ---------------------------------------------------------------------------

@app.get("/api/exportar/resumen-pdf")
def exportar_resumen_pdf(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Retorna todos los datos necesarios para generar el PDF en el frontend."""
    base = db.query(Accidente).filter(Accidente.estado == "aprobado")
    total = base.count()
    inicio_mes = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    este_mes = base.filter(Accidente.fecha_hora >= inicio_mes).count()

    por_grav: dict = {}
    for (g, c) in db.query(Accidente.gravedad, func.count(Accidente.id)).filter(Accidente.estado == "aprobado").group_by(Accidente.gravedad).all():
        por_grav[g] = c

    por_clima: dict = {}
    for (cl, c) in db.query(Accidente.clima, func.count(Accidente.id)).filter(Accidente.estado == "aprobado").group_by(Accidente.clima).all():
        if cl:
            por_clima[cl] = c

    # Top 10 barrios
    all_b = db.query(Accidente.barrio).filter(Accidente.estado == "aprobado").all()
    bcnt: dict = {}
    for (b,) in all_b:
        if b:
            bcnt[b] = bcnt.get(b, 0) + 1
    top10 = [{"barrio": b, "total": c} for b, c in sorted(bcnt.items(), key=lambda x: x[1], reverse=True)[:10]]

    # Tendencia mensual
    hace_1a = datetime.utcnow() - timedelta(days=365)
    nombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    all_fh = db.query(Accidente.fecha_hora).filter(Accidente.estado == "aprobado", Accidente.fecha_hora >= hace_1a).all()
    cnt: dict = {}
    for (fh,) in all_fh:
        if fh:
            k = (fh.year, fh.month)
            cnt[k] = cnt.get(k, 0) + 1
    tendencia = [{"etiqueta": f"{nombres[m-1]} {y}", "total": cnt[(y, m)]} for (y, m) in sorted(cnt.keys())]

    # Últimos 20 accidentes
    recientes = base.order_by(Accidente.fecha_hora.desc()).limit(20).all()

    return {
        "fecha_reporte": datetime.utcnow().isoformat(),
        "resumen": {"total": total, "este_mes": este_mes},
        "por_gravedad": por_grav,
        "por_clima": por_clima,
        "top10_barrios": top10,
        "tendencia_mensual": tendencia,
        "accidentes_recientes": [
            {
                "id": a.id,
                "fecha": a.fecha_hora.strftime("%Y-%m-%d %H:%M") if a.fecha_hora else "",
                "barrio": a.barrio or "",
                "gravedad": a.gravedad,
                "tipo_vehiculo": a.tipo_vehiculo or "",
                "clima": a.clima or "",
            }
            for a in recientes
        ],
    }


# ---------------------------------------------------------------------------
# WhatsApp Webhook (Twilio)
# ---------------------------------------------------------------------------

@app.post("/api/whatsapp/webhook")
async def whatsapp_webhook(request: Request):
    """Webhook para recibir mensajes de WhatsApp via Twilio."""
    try:
        body = await request.form()
        from_number = body.get("From", "")
        message_body = body.get("Body", "").strip().lower()

        # Parsear mensaje simple: "accidente en [barrio], [gravedad], [vehiculo]"
        gravedad = "leve"
        if any(w in message_body for w in ["fatal", "muerto", "fallecido"]):
            gravedad = "fatal"
        elif any(w in message_body for w in ["grave", "herido", "hospital"]):
            gravedad = "grave"

        tipo_v = "automovil"
        for v in ["moto", "bus", "camion", "bicicleta", "peatón", "taxi"]:
            if v in message_body:
                tipo_v = v
                break

        # Barrio por defecto
        barrio_detectado = "Desconocido"
        for b in BARRIOS:
            if b["nombre"].lower() in message_body:
                barrio_detectado = b["nombre"]
                break

        # Crear accidente pendiente desde WhatsApp
        db = SessionLocal()
        try:
            acc = Accidente(
                latitud=10.3910,
                longitud=-75.4794,
                barrio=barrio_detectado,
                fecha_hora=datetime.utcnow(),
                gravedad=gravedad,
                tipo_vehiculo=tipo_v,
                descripcion=f"Reporte WhatsApp ({from_number}): {body.get('Body', '')}",
                estado="pendiente",
                fuente="whatsapp",
            )
            db.add(acc)
            notif = Notificacion(
                tipo="whatsapp",
                titulo="Reporte WhatsApp recibido",
                mensaje=f"Reporte vía WhatsApp de {from_number}: {gravedad} en {barrio_detectado}",
            )
            db.add(notif)
            db.commit()
        finally:
            db.close()

        # Respuesta TwiML
        response_xml = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Reporte recibido. Un administrador lo revisará pronto. Gracias por contribuir a la seguridad vial de Cartagena.</Message>
</Response>"""
        from fastapi.responses import Response as FastAPIResponse
        return FastAPIResponse(content=response_xml, media_type="application/xml")

    except Exception as e:
        return {"error": str(e)}


# ===========================================================================
# NUEVAS FUNCIONALIDADES v4.0
# ===========================================================================

# ---------------------------------------------------------------------------
# Nuevos modelos de base de datos
# ---------------------------------------------------------------------------

class IncidenteActivo(Base):
    __tablename__ = "incidentes_activos"
    id = Column(Integer, primary_key=True, index=True)
    accidente_id = Column(Integer, nullable=False)
    estado = Column(String(30), default="pendiente")   # pendiente / en_atencion / cerrado
    operador_id = Column(Integer, nullable=True)
    telefono_reportante = Column(String(50), nullable=True)
    notas_operador = Column(Text, nullable=True)
    fecha_asignacion = Column(DateTime, nullable=True)
    fecha_cierre = Column(DateTime, nullable=True)
    sla_minutos = Column(Integer, default=30)
    tiempo_respuesta_min = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ConfigAlertaZona(Base):
    __tablename__ = "config_alertas_zona"
    id = Column(Integer, primary_key=True, index=True)
    nombre_zona = Column(String(200), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    radio_metros = Column(Integer, default=500)
    max_accidentes = Column(Integer, default=3)
    ventana_minutos = Column(Integer, default=30)
    email_supervisor = Column(String(255), nullable=True)
    whatsapp_supervisor = Column(String(50), nullable=True)
    activa = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PuntoNegro(Base):
    __tablename__ = "puntos_negros"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    barrio = Column(String(150), nullable=True)
    ranking = Column(Integer, default=0)
    total_accidentes = Column(Integer, default=0)
    fatales = Column(Integer, default=0)
    graves = Column(Integer, default=0)
    score_peligro = Column(Float, default=0.0)
    estado_intervencion = Column(String(30), default="sin_intervenir")
    foto_url = Column(String(500), nullable=True)
    notas = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class CamaraTransito(Base):
    __tablename__ = "camaras_transito"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    url_stream = Column(String(500), nullable=False)
    descripcion = Column(Text, nullable=True)
    activa = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# Crear las nuevas tablas
try:
    from sqlalchemy import text as _text2
    IncidenteActivo.__table__.create(bind=engine, checkfirst=True)
    ConfigAlertaZona.__table__.create(bind=engine, checkfirst=True)
    PuntoNegro.__table__.create(bind=engine, checkfirst=True)
    CamaraTransito.__table__.create(bind=engine, checkfirst=True)
    # Migrations for new columns if tables existed before
    with engine.connect() as _conn2:
        _migs2 = [
            "ALTER TABLE incidentes_activos ADD COLUMN tiempo_respuesta_min INTEGER",
        ]
        for _sq in _migs2:
            try:
                _conn2.execute(_text2(_sq))
                _conn2.commit()
            except Exception:
                pass
    print("[OK] Nuevas tablas v4.0 creadas.")
except Exception as _e4:
    print(f"[WARN] Error creando nuevas tablas: {_e4}")


# ---------------------------------------------------------------------------
# Pydantic schemas nuevos
# ---------------------------------------------------------------------------

class IncidenteActivoCreate(BaseModel):
    accidente_id: int
    telefono_reportante: Optional[str] = None
    sla_minutos: int = 30


class ConfigAlertaCreate(BaseModel):
    nombre_zona: str
    lat: float
    lng: float
    radio_metros: int = 500
    max_accidentes: int = 3
    ventana_minutos: int = 30
    email_supervisor: Optional[str] = None
    whatsapp_supervisor: Optional[str] = None


class CamaraCreate(BaseModel):
    nombre: str
    lat: float
    lng: float
    url_stream: str
    descripcion: Optional[str] = None


class PuntoNegroEstadoUpdate(BaseModel):
    estado_intervencion: str  # sin_intervenir / en_proceso / intervenido
    notas: Optional[str] = None


# ---------------------------------------------------------------------------
# Helper: enviar WhatsApp via Twilio
# ---------------------------------------------------------------------------

def enviar_whatsapp(to_number: str, message: str) -> bool:
    """Envía un mensaje WhatsApp via Twilio. Retorna True si fue exitoso."""
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        print(f"[WhatsApp] Sin credenciales Twilio. Mensaje simulado → {to_number}: {message}")
        return False
    try:
        from twilio.rest import Client as TwilioClient
        client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        twilio_from = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
        to_wa = f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number
        client.messages.create(body=message, from_=twilio_from, to=to_wa)
        return True
    except Exception as e:
        print(f"[WhatsApp] Error enviando: {e}")
        return False


def enviar_email_alerta(email: str, asunto: str, cuerpo: str) -> bool:
    """Envía email de alerta usando SMTP configurado en .env."""
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")
    if not smtp_host or not smtp_user:
        print(f"[Email] Sin configuración SMTP. Email simulado → {email}: {asunto}")
        return False
    try:
        import smtplib
        from email.mime.text import MIMEText
        msg = MIMEText(cuerpo, "plain", "utf-8")
        msg["Subject"] = asunto
        msg["From"] = smtp_user
        msg["To"] = email
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"[Email] Error: {e}")
        return False


# ---------------------------------------------------------------------------
# FEATURE 1: Incidentes en tiempo real con estados y SLA
# ---------------------------------------------------------------------------

@app.post("/api/incidentes", status_code=201)
def crear_incidente(
    data: IncidenteActivoCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Crea un incidente activo a partir de un accidente existente."""
    acc = db.query(Accidente).filter(Accidente.id == data.accidente_id).first()
    if not acc:
        raise HTTPException(404, "Accidente no encontrado")
    inc = IncidenteActivo(
        accidente_id=data.accidente_id,
        estado="pendiente",
        telefono_reportante=data.telefono_reportante,
        sla_minutos=data.sla_minutos,
    )
    db.add(inc)
    db.commit()
    db.refresh(inc)
    return {"id": inc.id, "estado": inc.estado, "sla_minutos": inc.sla_minutos}


@app.get("/api/incidentes/activos")
def listar_incidentes_activos(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    """Lista todos los incidentes activos (pendiente + en_atencion) con datos del accidente."""
    incidentes = (
        db.query(IncidenteActivo)
        .filter(IncidenteActivo.estado.in_(["pendiente", "en_atencion"]))
        .order_by(IncidenteActivo.created_at.desc())
        .all()
    )
    ahora = datetime.utcnow()
    result = []
    for inc in incidentes:
        acc = db.query(Accidente).filter(Accidente.id == inc.accidente_id).first()
        sla_limite = inc.created_at + timedelta(minutes=inc.sla_minutos)
        elapsed = int((ahora - inc.created_at).total_seconds() / 60)
        vencido = ahora > sla_limite and inc.estado != "cerrado"
        result.append({
            "id": inc.id,
            "accidente_id": inc.accidente_id,
            "estado": inc.estado,
            "sla_minutos": inc.sla_minutos,
            "minutos_transcurridos": elapsed,
            "sla_limite": sla_limite.isoformat(),
            "sla_vencido": vencido,
            "telefono_reportante": inc.telefono_reportante,
            "notas_operador": inc.notas_operador,
            "created_at": inc.created_at.isoformat(),
            "accidente": {
                "lat": acc.latitud if acc else 0,
                "lng": acc.longitud if acc else 0,
                "barrio": acc.barrio if acc else "",
                "gravedad": acc.gravedad if acc else "",
                "descripcion": acc.descripcion if acc else "",
                "fecha_hora": acc.fecha_hora.isoformat() if acc and acc.fecha_hora else "",
            } if acc else None,
        })
    return result


@app.put("/api/incidentes/{inc_id}/en-atencion")
def asignar_incidente(
    inc_id: int,
    notas: Optional[str] = None,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Operador toma el incidente (estado → en_atencion)."""
    inc = db.query(IncidenteActivo).filter(IncidenteActivo.id == inc_id).first()
    if not inc:
        raise HTTPException(404, "Incidente no encontrado")
    if inc.estado == "cerrado":
        raise HTTPException(400, "El incidente ya fue cerrado")
    inc.estado = "en_atencion"
    inc.operador_id = token.get("user_id")
    inc.fecha_asignacion = datetime.utcnow()
    if notas:
        inc.notas_operador = notas
    db.commit()
    return {"ok": True, "estado": "en_atencion"}


@app.put("/api/incidentes/{inc_id}/cerrar")
def cerrar_incidente(
    inc_id: int,
    notas: Optional[str] = None,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Cierra el incidente, calcula tiempo de respuesta y notifica por WhatsApp."""
    inc = db.query(IncidenteActivo).filter(IncidenteActivo.id == inc_id).first()
    if not inc:
        raise HTTPException(404, "Incidente no encontrado")
    ahora = datetime.utcnow()
    inc.estado = "cerrado"
    inc.fecha_cierre = ahora
    inc.tiempo_respuesta_min = int((ahora - inc.created_at).total_seconds() / 60)
    if notas:
        inc.notas_operador = (inc.notas_operador or "") + f"\nCierre: {notas}"
    db.commit()

    # Notificar al reportante por WhatsApp
    if inc.telefono_reportante:
        acc = db.query(Accidente).filter(Accidente.id == inc.accidente_id).first()
        barrio = acc.barrio if acc else "la zona reportada"
        msg = (
            f"Hola! Su reporte de accidente en {barrio} fue atendido por la Secretaría de Movilidad de Cartagena "
            f"en {inc.tiempo_respuesta_min} minutos. Gracias por contribuir a la seguridad vial. 🚦"
        )
        enviar_whatsapp(inc.telefono_reportante, msg)

    return {
        "ok": True,
        "estado": "cerrado",
        "tiempo_respuesta_min": inc.tiempo_respuesta_min,
    }


@app.get("/api/incidentes/historial")
def historial_incidentes(
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Incidentes cerrados con métricas de respuesta."""
    incidentes = (
        db.query(IncidenteActivo)
        .filter(IncidenteActivo.estado == "cerrado")
        .order_by(IncidenteActivo.fecha_cierre.desc())
        .limit(limit)
        .all()
    )
    cumple_sla = sum(1 for i in incidentes if i.tiempo_respuesta_min and i.tiempo_respuesta_min <= i.sla_minutos)
    tiempos = [i.tiempo_respuesta_min for i in incidentes if i.tiempo_respuesta_min]
    return {
        "total": len(incidentes),
        "cumple_sla": cumple_sla,
        "pct_sla": round(cumple_sla / max(len(incidentes), 1) * 100, 1),
        "tiempo_promedio_min": round(sum(tiempos) / max(len(tiempos), 1), 1),
        "incidentes": [
            {
                "id": i.id,
                "accidente_id": i.accidente_id,
                "tiempo_respuesta_min": i.tiempo_respuesta_min,
                "sla_minutos": i.sla_minutos,
                "cumple_sla": bool(i.tiempo_respuesta_min and i.tiempo_respuesta_min <= i.sla_minutos),
                "fecha_cierre": i.fecha_cierre.isoformat() if i.fecha_cierre else None,
                "notas": i.notas_operador,
            }
            for i in incidentes
        ],
    }


# ---------------------------------------------------------------------------
# FEATURE 2: Panel de turno (sin autenticación, solo lectura)
# ---------------------------------------------------------------------------

@app.get("/api/panel-turno/datos")
def panel_turno_datos(db: Session = Depends(get_db)):
    """Datos en tiempo real para el panel de sala de control. No requiere login."""
    ahora = datetime.utcnow()
    inicio_hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)

    # Accidentes de hoy (pendientes + aprobados)
    hoy = db.query(Accidente).filter(
        Accidente.estado.in_(["aprobado", "pendiente"]),
        Accidente.fecha_hora >= inicio_hoy,
    ).all()

    # Incidentes activos
    incidentes = db.query(IncidenteActivo).filter(
        IncidenteActivo.estado.in_(["pendiente", "en_atencion"])
    ).all()

    # Puntos activos para el mapa (últimas 6 horas)
    hace_6h = ahora - timedelta(hours=6)
    recientes = db.query(Accidente).filter(
        Accidente.estado.in_(["aprobado", "pendiente"]),
        Accidente.fecha_hora >= hace_6h,
    ).all()

    # Semáforo por barrio (últimas 2 horas)
    hace_2h = ahora - timedelta(hours=2)
    ultimos = db.query(Accidente).filter(
        Accidente.estado.in_(["aprobado", "pendiente"]),
        Accidente.fecha_hora >= hace_2h,
    ).all()
    barrio_conteo: dict = {}
    for a in ultimos:
        b = a.barrio or "Desconocido"
        barrio_conteo[b] = barrio_conteo.get(b, 0) + 1

    semaforo = []
    for barrio, cnt in sorted(barrio_conteo.items(), key=lambda x: -x[1])[:10]:
        nivel = "rojo" if cnt >= 3 else "amarillo" if cnt >= 2 else "verde"
        semaforo.append({"barrio": barrio, "accidentes_2h": cnt, "nivel": nivel})

    # KPIs del día
    fatales_hoy = sum(1 for a in hoy if a.gravedad == "fatal")
    graves_hoy = sum(1 for a in hoy if a.gravedad == "grave")

    return {
        "timestamp": ahora.isoformat(),
        "kpis": {
            "total_hoy": len(hoy),
            "fatales_hoy": fatales_hoy,
            "graves_hoy": graves_hoy,
            "incidentes_activos": len(incidentes),
            "incidentes_vencidos": sum(
                1 for i in incidentes
                if ahora > (i.created_at + timedelta(minutes=i.sla_minutos))
            ),
        },
        "puntos_activos": [
            {
                "lat": a.latitud,
                "lng": a.longitud,
                "barrio": a.barrio or "",
                "gravedad": a.gravedad,
                "descripcion": (a.descripcion or "")[:80],
                "hace_min": int((ahora - a.fecha_hora).total_seconds() / 60) if a.fecha_hora else 0,
            }
            for a in recientes
        ],
        "semaforo_zonas": semaforo,
        "incidentes_activos": [
            {
                "id": i.id,
                "estado": i.estado,
                "minutos": int((ahora - i.created_at).total_seconds() / 60),
                "sla": i.sla_minutos,
                "vencido": ahora > (i.created_at + timedelta(minutes=i.sla_minutos)),
            }
            for i in incidentes
        ],
    }


# ---------------------------------------------------------------------------
# FEATURE 3: Alertas automáticas por zona
# ---------------------------------------------------------------------------

@app.get("/api/alertas/config")
def listar_alertas_config(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    configs = db.query(ConfigAlertaZona).order_by(ConfigAlertaZona.id).all()
    return [
        {
            "id": c.id,
            "nombre_zona": c.nombre_zona,
            "lat": c.lat,
            "lng": c.lng,
            "radio_metros": c.radio_metros,
            "max_accidentes": c.max_accidentes,
            "ventana_minutos": c.ventana_minutos,
            "email_supervisor": c.email_supervisor,
            "whatsapp_supervisor": c.whatsapp_supervisor,
            "activa": c.activa,
        }
        for c in configs
    ]


@app.post("/api/alertas/config", status_code=201)
def crear_alerta_config(
    data: ConfigAlertaCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    cfg = ConfigAlertaZona(**data.model_dump())
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return {"id": cfg.id, "nombre_zona": cfg.nombre_zona}


@app.delete("/api/alertas/config/{cfg_id}")
def eliminar_alerta_config(
    cfg_id: int,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    cfg = db.query(ConfigAlertaZona).filter(ConfigAlertaZona.id == cfg_id).first()
    if not cfg:
        raise HTTPException(404, "Configuración no encontrada")
    db.delete(cfg)
    db.commit()
    return {"ok": True}


@app.post("/api/alertas/verificar")
def verificar_alertas_manualmente(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Verifica todas las zonas configuradas y dispara alertas si hay acumulación."""
    return _ejecutar_verificacion_alertas(db)


def _ejecutar_verificacion_alertas(db: Session) -> dict:
    """Lógica de verificación de alertas por zona."""
    ahora = datetime.utcnow()
    configs = db.query(ConfigAlertaZona).filter(ConfigAlertaZona.activa == True).all()
    alertas_disparadas = []

    for cfg in configs:
        ventana_inicio = ahora - timedelta(minutes=cfg.ventana_minutos)
        accs_recientes = db.query(Accidente).filter(
            Accidente.estado == "aprobado",
            Accidente.fecha_hora >= ventana_inicio,
        ).all()

        en_zona = [
            a for a in accs_recientes
            if _haversine_m(cfg.lat, cfg.lng, a.latitud, a.longitud) <= cfg.radio_metros
        ]

        if len(en_zona) >= cfg.max_accidentes:
            alertas_disparadas.append(cfg.nombre_zona)
            cuerpo = (
                f"ALERTA: Se registraron {len(en_zona)} accidentes en {cfg.nombre_zona} "
                f"en los últimos {cfg.ventana_minutos} minutos (radio {cfg.radio_metros}m). "
                f"Hora: {ahora.strftime('%H:%M')} UTC"
            )
            # Notificación interna
            notif = Notificacion(
                tipo="warning",
                titulo=f"Alerta zona: {cfg.nombre_zona}",
                mensaje=cuerpo,
            )
            db.add(notif)
            # Email
            if cfg.email_supervisor:
                enviar_email_alerta(
                    cfg.email_supervisor,
                    f"ALERTA VIAL - {cfg.nombre_zona}",
                    cuerpo,
                )
            # WhatsApp
            if cfg.whatsapp_supervisor:
                enviar_whatsapp(cfg.whatsapp_supervisor, cuerpo)

    if alertas_disparadas:
        db.commit()

    return {"alertas_disparadas": alertas_disparadas, "verificado_en": ahora.isoformat()}


# Background task: verificar alertas cada 5 minutos
_ultima_verificacion_alertas = datetime.utcnow() - timedelta(minutes=10)


@app.middleware("http")
async def alerta_middleware(request, call_next):
    """Middleware liviano que dispara verificación de alertas cada 5 min en background."""
    global _ultima_verificacion_alertas
    ahora = datetime.utcnow()
    if (ahora - _ultima_verificacion_alertas).total_seconds() > 300:
        _ultima_verificacion_alertas = ahora
        try:
            db = SessionLocal()
            _ejecutar_verificacion_alertas(db)
            db.close()
        except Exception:
            pass
    return await call_next(request)


# ---------------------------------------------------------------------------
# FEATURE 4: Generación de informes PDF automáticos
# ---------------------------------------------------------------------------

@app.get("/api/informes/pdf-mensual")
def generar_pdf_mensual(
    anio: int = Query(default=None),
    mes: int = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Genera un informe PDF mensual oficial con branding del Distrito de Cartagena."""
    try:
        from reportlab.lib.pagesizes import letter, A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        )
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        from io import BytesIO
        from fastapi.responses import StreamingResponse
    except ImportError:
        raise HTTPException(500, "reportlab no instalado. Ejecuta: pip install reportlab")

    ahora = datetime.utcnow()
    anio = anio or ahora.year
    mes = mes or (ahora.month - 1 or 12)
    if mes == 0:
        mes = 12
        anio -= 1

    inicio = datetime(anio, mes, 1)
    if mes == 12:
        fin = datetime(anio + 1, 1, 1) - timedelta(seconds=1)
    else:
        fin = datetime(anio, mes + 1, 1) - timedelta(seconds=1)

    accs = db.query(Accidente).filter(
        Accidente.estado == "aprobado",
        Accidente.fecha_hora >= inicio,
        Accidente.fecha_hora <= fin,
    ).all()

    # Año anterior mismo mes
    accs_ant = db.query(Accidente).filter(
        Accidente.estado == "aprobado",
        Accidente.fecha_hora >= datetime(anio - 1, mes, 1),
        Accidente.fecha_hora <= fin.replace(year=anio - 1),
    ).all()

    MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
             "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm,
                             leftMargin=2.5*cm, rightMargin=2.5*cm)
    styles = getSampleStyleSheet()
    story = []

    # Estilos personalizados
    title_style = ParagraphStyle("Title", parent=styles["Normal"],
                                  fontSize=16, fontName="Helvetica-Bold",
                                  alignment=TA_CENTER, spaceAfter=6)
    subtitle_style = ParagraphStyle("Subtitle", parent=styles["Normal"],
                                     fontSize=11, fontName="Helvetica",
                                     alignment=TA_CENTER, textColor=colors.grey, spaceAfter=4)
    heading_style = ParagraphStyle("Heading", parent=styles["Normal"],
                                    fontSize=12, fontName="Helvetica-Bold",
                                    spaceBefore=12, spaceAfter=6)
    body_style = ParagraphStyle("Body", parent=styles["Normal"],
                                  fontSize=9, spaceAfter=4)

    # Encabezado
    story.append(Paragraph("DISTRITO TURÍSTICO Y CULTURAL DE CARTAGENA DE INDIAS", subtitle_style))
    story.append(Paragraph("Secretaría de Movilidad", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#1a3a5c")))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph(f"INFORME DE ACCIDENTALIDAD VIAL", title_style))
    story.append(Paragraph(f"{MESES[mes]} {anio}", title_style))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(f"Generado: {ahora.strftime('%d/%m/%Y %H:%M')} UTC", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
    story.append(Spacer(1, 0.5*cm))

    # Resumen ejecutivo
    total = len(accs)
    fatales = sum(1 for a in accs if a.gravedad == "fatal")
    graves = sum(1 for a in accs if a.gravedad == "grave")
    leves = sum(1 for a in accs if a.gravedad == "leve")
    total_ant = len(accs_ant)
    variacion = round((total - total_ant) / max(total_ant, 1) * 100, 1)
    tendencia = "▲" if variacion > 0 else "▼"
    color_var = colors.red if variacion > 0 else colors.green

    story.append(Paragraph("1. RESUMEN EJECUTIVO", heading_style))
    story.append(Paragraph(
        f"Durante {MESES[mes]} {anio} se registraron <b>{total} accidentes de tránsito</b> en el Distrito de Cartagena. "
        f"Comparado con el mismo período del año anterior ({total_ant} accidentes), "
        f"representa una variación de <b>{tendencia} {abs(variacion)}%</b>.",
        body_style
    ))
    story.append(Spacer(1, 0.3*cm))

    # Tabla KPIs
    story.append(Paragraph("2. INDICADORES CLAVE", heading_style))
    kpi_data = [
        ["Indicador", "Valor", "Mes Anterior"],
        ["Total accidentes", str(total), str(total_ant)],
        ["Fatales", str(fatales), "-"],
        ["Graves", str(graves), "-"],
        ["Leves", str(leves), "-"],
        ["Variación interanual", f"{tendencia} {abs(variacion)}%", "-"],
    ]
    kpi_table = Table(kpi_data, colWidths=[8*cm, 4*cm, 4*cm])
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3a5c")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 0.5*cm))

    # Top barrios
    story.append(Paragraph("3. BARRIOS CON MAYOR ACCIDENTALIDAD", heading_style))
    barrio_cnt: dict = {}
    barrio_fat: dict = {}
    for a in accs:
        b = a.barrio or "Desconocido"
        barrio_cnt[b] = barrio_cnt.get(b, 0) + 1
        if a.gravedad == "fatal":
            barrio_fat[b] = barrio_fat.get(b, 0) + 1

    top_barrios = sorted(barrio_cnt.items(), key=lambda x: -x[1])[:10]
    bar_data = [["Ranking", "Barrio / Vía", "Accidentes", "Fatales"]]
    for i, (b, cnt) in enumerate(top_barrios, 1):
        bar_data.append([str(i), b, str(cnt), str(barrio_fat.get(b, 0))])
    bar_table = Table(bar_data, colWidths=[2*cm, 9*cm, 3*cm, 2*cm])
    bar_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c5282")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#ebf8ff")]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(bar_table)
    story.append(Spacer(1, 0.5*cm))

    # Por tipo de vehículo
    story.append(Paragraph("4. DISTRIBUCIÓN POR TIPO DE VEHÍCULO", heading_style))
    vehiculo_cnt: dict = {}
    for a in accs:
        v = a.tipo_vehiculo or "Desconocido"
        vehiculo_cnt[v] = vehiculo_cnt.get(v, 0) + 1
    veh_data = [["Vehículo", "Cantidad", "% del Total"]]
    for v, cnt in sorted(vehiculo_cnt.items(), key=lambda x: -x[1]):
        veh_data.append([v, str(cnt), f"{round(cnt/max(total,1)*100,1)}%"])
    veh_table = Table(veh_data, colWidths=[8*cm, 4*cm, 4*cm])
    veh_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#276749")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0fff4")]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.grey),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(veh_table)
    story.append(Spacer(1, 0.5*cm))

    # Pie de página / firma
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(
        "Este informe fue generado automáticamente por el Sistema de Análisis de Accidentalidad "
        "CrashMap — Secretaría de Movilidad, Distrito Turístico y Cultural de Cartagena de Indias.",
        ParagraphStyle("footer", parent=styles["Normal"], fontSize=7,
                        textColor=colors.grey, alignment=TA_CENTER)
    ))

    doc.build(story)
    buffer.seek(0)
    nombre_archivo = f"informe_accidentalidad_{MESES[mes]}_{anio}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nombre_archivo}"'},
    )


# ---------------------------------------------------------------------------
# FEATURE 5: Módulo de Puntos Negros (Hotspots)
# ---------------------------------------------------------------------------

@app.get("/api/puntos-negros")
def listar_puntos_negros(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    puntos = db.query(PuntoNegro).order_by(PuntoNegro.ranking).all()
    return [
        {
            "id": p.id,
            "nombre": p.nombre,
            "lat": p.lat,
            "lng": p.lng,
            "barrio": p.barrio,
            "ranking": p.ranking,
            "total_accidentes": p.total_accidentes,
            "fatales": p.fatales,
            "graves": p.graves,
            "score_peligro": p.score_peligro,
            "estado_intervencion": p.estado_intervencion,
            "foto_url": p.foto_url,
            "notas": p.notas,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in puntos
    ]


@app.put("/api/puntos-negros/{punto_id}/estado")
def actualizar_estado_punto_negro(
    punto_id: int,
    data: PuntoNegroEstadoUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Actualiza el estado de intervención de un punto negro."""
    punto = db.query(PuntoNegro).filter(PuntoNegro.id == punto_id).first()
    if not punto:
        raise HTTPException(404, "Punto negro no encontrado")
    estados_validos = ("sin_intervenir", "en_proceso", "intervenido")
    if data.estado_intervencion not in estados_validos:
        raise HTTPException(400, f"Estado debe ser uno de: {estados_validos}")
    punto.estado_intervencion = data.estado_intervencion
    if data.notas:
        punto.notas = data.notas
    punto.updated_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "estado_intervencion": punto.estado_intervencion}


@app.post("/api/puntos-negros/{punto_id}/foto")
async def subir_foto_punto_negro(
    punto_id: int,
    foto: UploadFile = File(...),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Sube una foto al punto negro y la guarda localmente."""
    punto = db.query(PuntoNegro).filter(PuntoNegro.id == punto_id).first()
    if not punto:
        raise HTTPException(404, "Punto negro no encontrado")
    if not foto.content_type.startswith("image/"):
        raise HTTPException(400, "Solo se aceptan archivos de imagen")

    fotos_dir = "fotos_puntos_negros"
    os.makedirs(fotos_dir, exist_ok=True)
    ext = foto.filename.rsplit(".", 1)[-1] if "." in foto.filename else "jpg"
    nombre = f"punto_{punto_id}_{int(datetime.utcnow().timestamp())}.{ext}"
    ruta = os.path.join(fotos_dir, nombre)
    with open(ruta, "wb") as f:
        f.write(await foto.read())

    punto.foto_url = f"/api/fotos/{nombre}"
    punto.updated_at = datetime.utcnow()
    db.commit()
    return {"foto_url": punto.foto_url}


@app.get("/api/fotos/{nombre_archivo}")
def servir_foto(nombre_archivo: str):
    """Sirve las fotos almacenadas de puntos negros."""
    from fastapi.responses import FileResponse
    ruta = os.path.join("fotos_puntos_negros", nombre_archivo)
    if not os.path.exists(ruta):
        raise HTTPException(404, "Foto no encontrada")
    return FileResponse(ruta)


@app.post("/api/puntos-negros/sincronizar")
def sincronizar_puntos_negros(
    n_clusters: int = Query(10, ge=3, le=20),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Recalcula los puntos negros usando clustering sobre todos los accidentes aprobados."""
    if not _sklearn_ok or not _numpy_ok:
        raise HTTPException(500, "scikit-learn/numpy no instalado")

    accs = db.query(Accidente).filter(
        Accidente.estado == "aprobado",
        Accidente.latitud.isnot(None),
    ).all()
    if len(accs) < n_clusters:
        raise HTTPException(400, f"Se necesitan al menos {n_clusters} accidentes")

    coords = np.array([[a.latitud, a.longitud] for a in accs])
    scaler = StandardScaler()
    coords_scaled = scaler.fit_transform(coords)
    k = min(n_clusters, len(accs) // 3)
    model = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = model.fit_predict(coords_scaled)

    clusters: dict = {}
    for i, label in enumerate(labels):
        if label not in clusters:
            clusters[label] = {"lats": [], "lngs": [], "gravs": []}
        clusters[label]["lats"].append(accs[i].latitud)
        clusters[label]["lngs"].append(accs[i].longitud)
        clusters[label]["gravs"].append(accs[i].gravedad)

    peso = {"fatal": 3, "grave": 2, "leve": 1}
    resultado_clusters = []
    for label, data in clusters.items():
        n = len(data["lats"])
        lat_c = float(np.mean(data["lats"]))
        lng_c = float(np.mean(data["lngs"]))
        score = sum(peso.get(g, 1) for g in data["gravs"]) / n
        resultado_clusters.append({
            "lat": lat_c, "lng": lng_c, "n": n,
            "fatales": data["gravs"].count("fatal"),
            "graves": data["gravs"].count("grave"),
            "score": score,
        })

    resultado_clusters.sort(key=lambda x: -x["score"])

    # Actualizar tabla puntos_negros
    db.query(PuntoNegro).delete()
    for rank, cl in enumerate(resultado_clusters, 1):
        barrio = get_barrio_cercano(cl["lat"], cl["lng"])
        nombre = f"Punto Negro #{rank} - {barrio}"
        punto = PuntoNegro(
            nombre=nombre,
            lat=cl["lat"],
            lng=cl["lng"],
            barrio=barrio,
            ranking=rank,
            total_accidentes=cl["n"],
            fatales=cl["fatales"],
            graves=cl["graves"],
            score_peligro=round(cl["score"], 2),
            estado_intervencion="sin_intervenir",
            updated_at=datetime.utcnow(),
        )
        db.add(punto)
    db.commit()
    return {"sincronizados": len(resultado_clusters)}


# ---------------------------------------------------------------------------
# FEATURE 6: Comparativo interanual detallado
# ---------------------------------------------------------------------------

@app.get("/api/metricas/comparativo-interanual")
def comparativo_interanual(
    anio1: int = Query(default=None),
    anio2: int = Query(default=None),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    """Comparativo mensual entre dos años con porcentaje de variación."""
    ahora = datetime.utcnow()
    anio2 = anio2 or ahora.year
    anio1 = anio1 or (anio2 - 1)

    MESES_NOMBRES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                     "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

    def conteo_mensual(anio: int) -> list:
        inicio = datetime(anio, 1, 1)
        fin = datetime(anio, 12, 31, 23, 59, 59)
        rows = db.query(Accidente.fecha_hora, Accidente.gravedad).filter(
            Accidente.estado == "aprobado",
            Accidente.fecha_hora >= inicio,
            Accidente.fecha_hora <= fin,
        ).all()
        meses = {m: {"total": 0, "fatales": 0, "graves": 0} for m in range(1, 13)}
        for fh, grav in rows:
            if fh:
                meses[fh.month]["total"] += 1
                if grav == "fatal":
                    meses[fh.month]["fatales"] += 1
                elif grav == "grave":
                    meses[fh.month]["graves"] += 1
        return [meses[m] for m in range(1, 13)]

    data1 = conteo_mensual(anio1)
    data2 = conteo_mensual(anio2)

    series = []
    for i, nombre in enumerate(MESES_NOMBRES):
        t1 = data1[i]["total"]
        t2 = data2[i]["total"]
        variacion = round((t2 - t1) / max(t1, 1) * 100, 1) if t1 > 0 else None
        series.append({
            "mes": nombre,
            "mes_num": i + 1,
            anio1: t1,
            f"{anio1}_fatales": data1[i]["fatales"],
            anio2: t2,
            f"{anio2}_fatales": data2[i]["fatales"],
            "variacion_pct": variacion,
        })

    total1 = sum(d["total"] for d in data1)
    total2 = sum(d["total"] for d in data2)
    var_anual = round((total2 - total1) / max(total1, 1) * 100, 1)

    return {
        "labels": MESES_NOMBRES,
        "anio1": anio1,
        "anio2": anio2,
        "series": series,
        "totales": {str(anio1): total1, str(anio2): total2},
        "variacion_anual_pct": var_anual,
        "tendencia": "aumento" if var_anual > 0 else "reduccion" if var_anual < 0 else "estable",
    }


# ---------------------------------------------------------------------------
# FEATURE 8: Cámaras de tránsito
# ---------------------------------------------------------------------------

@app.get("/api/camaras")
def listar_camaras(
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    camaras = db.query(CamaraTransito).filter(CamaraTransito.activa == True).all()
    return [
        {
            "id": c.id,
            "nombre": c.nombre,
            "lat": c.lat,
            "lng": c.lng,
            "url_stream": c.url_stream,
            "descripcion": c.descripcion,
            "activa": c.activa,
        }
        for c in camaras
    ]


@app.post("/api/camaras", status_code=201)
def crear_camara(
    data: CamaraCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    cam = CamaraTransito(**data.model_dump())
    db.add(cam)
    db.commit()
    db.refresh(cam)
    return {"id": cam.id, "nombre": cam.nombre}


@app.put("/api/camaras/{cam_id}")
def editar_camara(
    cam_id: int,
    data: CamaraCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    cam = db.query(CamaraTransito).filter(CamaraTransito.id == cam_id).first()
    if not cam:
        raise HTTPException(404, "Cámara no encontrada")
    for k, v in data.model_dump().items():
        setattr(cam, k, v)
    db.commit()
    return {"ok": True}


@app.delete("/api/camaras/{cam_id}")
def eliminar_camara(
    cam_id: int,
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_admin),
):
    cam = db.query(CamaraTransito).filter(CamaraTransito.id == cam_id).first()
    if not cam:
        raise HTTPException(404, "Cámara no encontrada")
    db.delete(cam)
    db.commit()
    return {"ok": True}


@app.get("/api/camaras/cercana")
def camara_cercana(
    lat: float = Query(...),
    lng: float = Query(...),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    """Retorna la cámara más cercana a las coordenadas dadas."""
    camaras = db.query(CamaraTransito).filter(CamaraTransito.activa == True).all()
    if not camaras:
        return None
    mejor = min(camaras, key=lambda c: _haversine_m(lat, lng, c.lat, c.lng))
    dist = _haversine_m(lat, lng, mejor.lat, mejor.lng)
    return {
        "id": mejor.id,
        "nombre": mejor.nombre,
        "lat": mejor.lat,
        "lng": mejor.lng,
        "url_stream": mejor.url_stream,
        "distancia_metros": round(dist),
    }


# ---------------------------------------------------------------------------
# FEATURE 9: Predicción de riesgo por hora y día
# ---------------------------------------------------------------------------

@app.get("/api/predicciones/mapa-calor-predictivo")
def mapa_calor_predictivo(
    dia_semana: int = Query(0, ge=0, le=6, description="0=Lunes, 6=Domingo"),
    hora_inicio: int = Query(7, ge=0, le=23),
    hora_fin: int = Query(9, ge=0, le=23),
    db: Session = Depends(get_db),
    token: dict = Depends(verificar_token),
):
    """
    Genera un mapa de calor predictivo para una combinación de día/hora.
    Combina densidad histórica con predicción del modelo ML.
    """
    dias_nombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

    # Filtrar accidentes históricos en el mismo día y rango de hora
    horas = list(range(hora_inicio, hora_fin + 1)) if hora_fin >= hora_inicio else (
        list(range(hora_inicio, 24)) + list(range(0, hora_fin + 1))
    )
    accs = db.query(Accidente).filter(Accidente.estado == "aprobado").all()
    historicos = [
        a for a in accs
        if a.fecha_hora
        and a.fecha_hora.weekday() == dia_semana
        and a.fecha_hora.hour in horas
    ]

    # Puntos del mapa de calor histórico
    puntos_historicos = []
    peso_grav = {"fatal": 1.0, "grave": 0.7, "leve": 0.4}
    for a in historicos:
        puntos_historicos.append({
            "lat": a.latitud,
            "lng": a.longitud,
            "peso": peso_grav.get(a.gravedad, 0.4),
        })

    # Predicción con ML por barrio
    predicciones_por_barrio = []
    hora_media = (hora_inicio + hora_fin) // 2
    for b in BARRIOS:
        # Crear un accidente ficticio con los parámetros solicitados
        acc_dummy = Accidente(
            latitud=b["lat"],
            longitud=b["lng"],
            fecha_hora=datetime(2026, 1, 6 + dia_semana, hora_media),  # semana de referencia
            gravedad="leve",
            clima="soleado",
            estado_via="bueno",
            dia_festivo=False,
            hora_pico=(7 <= hora_media <= 9 or 17 <= hora_media <= 19),
        )
        riesgo_ml = 0.5  # default
        if _torch_ok and modelo_riesgo is not None:
            try:
                features = preparar_features_accidente(acc_dummy)
                if features is not None:
                    with torch.no_grad():
                        riesgo_ml = float(modelo_riesgo(features).item())
            except Exception:
                pass

        # Combinar con densidad histórica
        cnt_historico = sum(
            1 for a in historicos
            if _haversine_m(b["lat"], b["lng"], a.latitud, a.longitud) < 800
        )
        densidad = min(cnt_historico / max(len(historicos), 1) * 10, 1.0)
        riesgo_combinado = 0.6 * riesgo_ml + 0.4 * densidad

        predicciones_por_barrio.append({
            "barrio": b["nombre"],
            "lat": b["lat"],
            "lng": b["lng"],
            "riesgo_ml": round(riesgo_ml, 3),
            "densidad_historica": cnt_historico,
            "riesgo_combinado": round(riesgo_combinado, 3),
            "nivel": "alto" if riesgo_combinado > 0.65 else "medio" if riesgo_combinado > 0.35 else "bajo",
        })

    predicciones_por_barrio.sort(key=lambda x: -x["riesgo_combinado"])

    return {
        "dia_semana": dia_semana,
        "dia_nombre": dias_nombres[dia_semana],
        "hora_inicio": hora_inicio,
        "hora_fin": hora_fin,
        "total_historicos": len(historicos),
        "puntos_historicos": puntos_historicos,
        "predicciones_por_barrio": predicciones_por_barrio,
        "top_zonas_riesgo": predicciones_por_barrio[:5],
        "modelo_entrenado": os.path.exists(MODEL_PATH),
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
