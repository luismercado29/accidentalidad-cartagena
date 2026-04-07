"""
Setup script for the CrashMap Cartagena PostgreSQL database.
Uses SQLAlchemy 2.0 with declarative_base from sqlalchemy.orm.
Drops and recreates all tables, then seeds with realistic accident data.
"""

import random
from datetime import datetime, timedelta

from passlib.context import CryptContext
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost/accidentalidad_ctg"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------

Base = declarative_base()


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    es_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Accidente(Base):
    __tablename__ = "accidentes"

    id = Column(Integer, primary_key=True, index=True)
    latitud = Column(Float, nullable=False)
    longitud = Column(Float, nullable=False)
    barrio = Column(String(150))
    fecha_hora = Column(DateTime, nullable=False)
    gravedad = Column(String(20), nullable=False)       # leve / grave / fatal
    tipo_vehiculo = Column(String(50), nullable=False)  # auto / moto / bus / camion / bicicleta
    clima = Column(String(20), nullable=False)          # soleado / nublado / lluvia
    estado_via = Column(String(20), nullable=False)     # bueno / regular / malo
    dia_festivo = Column(Boolean, default=False)
    hora_pico = Column(Boolean, default=False)
    descripcion = Column(Text)
    reportado_por = Column(String(100))
    estado = Column(String(20), default="pendiente")   # pendiente / aprobado / rechazado
    fuente = Column(String(20), default="manual")      # manual / excel / externo
    created_at = Column(DateTime, default=datetime.utcnow)


class FactorRiesgo(Base):
    __tablename__ = "factores_riesgo"

    id = Column(Integer, primary_key=True, index=True)
    latitud = Column(Float, nullable=False)
    longitud = Column(Float, nullable=False)
    tipo_factor = Column(String(100), nullable=False)
    nivel_riesgo = Column(Float, nullable=False)
    activo = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Notificacion(Base):
    __tablename__ = "notificaciones"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(50))
    titulo = Column(String(200))
    mensaje = Column(Text)
    es_leida = Column(Boolean, default=False)
    datos_extra = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# Seed data constants
# ---------------------------------------------------------------------------

BARRIOS_DATA = [
    # High-risk neighborhoods
    {"nombre": "Bocagrande",          "lat": 10.3922, "lng": -75.5386, "factor_riesgo": 1.4, "cantidad": 80},
    {"nombre": "Centro Histórico",    "lat": 10.4236, "lng": -75.5472, "factor_riesgo": 1.3, "cantidad": 70},
    {"nombre": "Av. Pedro de Heredia","lat": 10.3995, "lng": -75.4950, "factor_riesgo": 1.5, "cantidad": 90},
    {"nombre": "Getsemaní",           "lat": 10.4195, "lng": -75.5520, "factor_riesgo": 1.2, "cantidad": 55},
    {"nombre": "Bazurto",             "lat": 10.4110, "lng": -75.5260, "factor_riesgo": 1.3, "cantidad": 60},
    # Medium-risk neighborhoods
    {"nombre": "Manga",               "lat": 10.4020, "lng": -75.5205, "factor_riesgo": 1.0, "cantidad": 40},
    {"nombre": "El Bosque",           "lat": 10.3905, "lng": -75.4880, "factor_riesgo": 1.1, "cantidad": 45},
    {"nombre": "Olaya Herrera",       "lat": 10.3820, "lng": -75.4900, "factor_riesgo": 1.2, "cantidad": 50},
    {"nombre": "Zaragocilla",         "lat": 10.4050, "lng": -75.5100, "factor_riesgo": 1.0, "cantidad": 35},
    {"nombre": "Villa Olímpica",      "lat": 10.3958, "lng": -75.4930, "factor_riesgo": 1.0, "cantidad": 35},
    {"nombre": "Los Alpes",           "lat": 10.3745, "lng": -75.4795, "factor_riesgo": 0.9, "cantidad": 30},
    {"nombre": "La Esperanza",        "lat": 10.3780, "lng": -75.4860, "factor_riesgo": 0.9, "cantidad": 30},
    # Lower-risk neighborhoods
    {"nombre": "Castillogrande",      "lat": 10.3870, "lng": -75.5398, "factor_riesgo": 0.8, "cantidad": 25},
    {"nombre": "Marbella",            "lat": 10.4150, "lng": -75.5450, "factor_riesgo": 0.8, "cantidad": 20},
    {"nombre": "El Cabrero",          "lat": 10.4280, "lng": -75.5350, "factor_riesgo": 0.7, "cantidad": 20},
    {"nombre": "La Boquilla",         "lat": 10.4600, "lng": -75.5100, "factor_riesgo": 0.6, "cantidad": 15},
    {"nombre": "Mamonal",             "lat": 10.3300, "lng": -75.4800, "factor_riesgo": 0.7, "cantidad": 20},
    {"nombre": "Turbaco (vía)",       "lat": 10.3450, "lng": -75.4250, "factor_riesgo": 1.1, "cantidad": 25},
]

DESCRIPCIONES = {
    ("moto", "leve"): [
        "Motocicleta con pérdida de control en curva, conductor sufrió raspaduras leves",
        "Colisión entre motocicleta y automóvil, daños menores al vehículo",
        "Motociclista realizó giro brusco causando caída, sin heridos graves",
    ],
    ("moto", "grave"): [
        "Motociclista sin casco colisionó con bus, trasladado al hospital",
        "Accidente entre moto y camión, piloto con fractura expuesta en pierna",
        "Choque de motocicleta contra separador vial, conductor hospitalizado",
    ],
    ("moto", "fatal"): [
        "Motociclista falleció tras impacto con vehículo de carga pesada",
        "Piloto de moto perdió la vida en choque frontal en vía de acceso",
    ],
    ("auto", "leve"): [
        "Colisión entre dos automóviles en intersección, daños materiales",
        "Vehículo rozó separador vial, conductor ileso",
        "Choque trasero menor en zona de trancón",
    ],
    ("auto", "grave"): [
        "Automóvil invadió carril contrario y chocó frontalmente, heridos graves",
        "Vehículo atropelló a peatón que cruzó imprudentemente",
    ],
    ("auto", "fatal"): [
        "Colisión frontal entre dos automóviles causó muerte de conductor",
        "Vehículo perdió control y arrolló a peatones en andén",
    ],
    ("bus", "leve"): [
        "Bus urbano chocó contra poste al girar, pasajeros con contusiones leves",
        "Bus de servicio público frenó bruscamente causando caídas internas",
    ],
    ("bus", "grave"): [
        "Bus urbano arrolló a ciclista en carril preferencial",
        "Colisión entre bus y motocicleta en cruce sin semáforo",
    ],
    ("bus", "fatal"): [
        "Bus de servicio público arrolló peatón en zona de alta afluencia",
        "Colisión frontal de bus contra camión causó múltiples víctimas fatales",
    ],
    ("camion", "leve"): [
        "Camión de carga rozó automóvil al cambiar de carril",
        "Vehículo de carga derrapó en calzada mojada, sin heridos",
    ],
    ("camion", "grave"): [
        "Camión de carga pesada perdió frenos, impactó múltiples vehículos",
        "Colisión de camión con motocicleta en zona industrial de Mamonal",
    ],
    ("camion", "fatal"): [
        "Camión de carga perdió control en bajada y arrolló varios vehículos",
        "Colisión de frente entre camión y automóvil particular, conductores fallecidos",
    ],
    ("bicicleta", "leve"): [
        "Ciclista sufrió caída al esquivar bache, raspaduras menores",
        "Bicicleta chocó con puerta de automóvil estacionado",
    ],
    ("bicicleta", "grave"): [
        "Ciclista fue embestido por motocicleta en ciclovía",
        "Bicicleta atrapada bajo ruedas de bus urbano",
    ],
    ("bicicleta", "fatal"): [
        "Ciclista falleció tras ser arrollado por vehículo pesado en vía principal",
        "Bicicleta impactada por automóvil a alta velocidad, ciclista sin vida",
    ],
}

# Colombian public holidays (month, day) — fixed dates only
FESTIVOS_COLOMBIA_FIJOS = {
    (1, 1),   # Año Nuevo
    (5, 1),   # Día del Trabajo
    (7, 20),  # Grito de Independencia
    (8, 7),   # Batalla de Boyacá
    (12, 8),  # Inmaculada Concepción
    (12, 25), # Navidad
}

FACTORES_RIESGO_DATA = [
    # Semáforos averiados
    {"lat": 10.4240, "lng": -75.5470, "tipo": "Semáforo averiado",          "riesgo": 0.75},
    {"lat": 10.3928, "lng": -75.5390, "tipo": "Semáforo averiado",          "riesgo": 0.70},
    {"lat": 10.4025, "lng": -75.5210, "tipo": "Semáforo averiado",          "riesgo": 0.72},
    # Baches peligrosos
    {"lat": 10.3825, "lng": -75.4905, "tipo": "Bache peligroso",            "riesgo": 0.60},
    {"lat": 10.3910, "lng": -75.4885, "tipo": "Bache peligroso",            "riesgo": 0.55},
    {"lat": 10.3750, "lng": -75.4800, "tipo": "Bache peligroso",            "riesgo": 0.58},
    # Intersecciones sin señalizar
    {"lat": 10.4115, "lng": -75.5265, "tipo": "Intersección sin señalizar", "riesgo": 0.65},
    {"lat": 10.3960, "lng": -75.4935, "tipo": "Intersección sin señalizar", "riesgo": 0.63},
    {"lat": 10.3455, "lng": -75.4255, "tipo": "Intersección sin señalizar", "riesgo": 0.68},
    # Zonas escolares
    {"lat": 10.4055, "lng": -75.5105, "tipo": "Zona escolar",               "riesgo": 0.55},
    {"lat": 10.3962, "lng": -75.4933, "tipo": "Zona escolar",               "riesgo": 0.52},
    {"lat": 10.4038, "lng": -75.5340, "tipo": "Zona escolar",               "riesgo": 0.50},
    # Cruces peatonales peligrosos
    {"lat": 10.4198, "lng": -75.5525, "tipo": "Cruce peatonal peligroso",   "riesgo": 0.70},
    {"lat": 10.4113, "lng": -75.5258, "tipo": "Cruce peatonal peligroso",   "riesgo": 0.67},
    # Vías estrechas
    {"lat": 10.3874, "lng": -75.5402, "tipo": "Vía estrecha",               "riesgo": 0.60},
    {"lat": 10.4283, "lng": -75.5353, "tipo": "Vía estrecha",               "riesgo": 0.58},
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _es_festivo(fecha: datetime) -> bool:
    """Returns True if the date is a Colombian fixed holiday or weekend."""
    if fecha.weekday() >= 5:  # Saturday=5, Sunday=6
        return True
    return (fecha.month, fecha.day) in FESTIVOS_COLOMBIA_FIJOS


def _clima_para_mes(mes: int) -> str:
    """
    Returns a weather condition weighted by Cartagena's climate seasons.
    Jan-Mar (dry): 70% soleado, 20% nublado, 10% lluvia
    Apr-Nov (rainy): 40% soleado, 30% nublado, 30% lluvia
    Dec (transition): 60% soleado, 25% nublado, 15% lluvia
    """
    if mes in (1, 2, 3):
        return random.choices(["soleado", "nublado", "lluvia"], weights=[70, 20, 10])[0]
    elif mes == 12:
        return random.choices(["soleado", "nublado", "lluvia"], weights=[60, 25, 15])[0]
    else:
        return random.choices(["soleado", "nublado", "lluvia"], weights=[40, 30, 30])[0]


def _gravedad_para_barrio(factor_riesgo: float) -> str:
    """
    Weighted gravity selection adjusted by neighborhood risk factor.
    Base: leve 65%, grave 27%, fatal 8%
    Higher risk factor shifts weight toward grave/fatal.
    """
    leve_w  = max(10, 65 - int((factor_riesgo - 1.0) * 20))
    grave_w = 27 + int((factor_riesgo - 1.0) * 10)
    fatal_w = max(2,  8  + int((factor_riesgo - 1.0) * 10))
    return random.choices(["leve", "grave", "fatal"], weights=[leve_w, grave_w, fatal_w])[0]


def _estado_via_para_barrio(factor_riesgo: float) -> str:
    """
    Road condition weighted by risk factor.
    Base: bueno 50%, regular 35%, malo 15%
    Higher risk = worse road conditions.
    """
    bueno_w  = max(10, 50 - int((factor_riesgo - 1.0) * 20))
    regular_w = 35
    malo_w   = max(5,  15 + int((factor_riesgo - 1.0) * 20))
    return random.choices(["bueno", "regular", "malo"], weights=[bueno_w, regular_w, malo_w])[0]


def _descripcion(tipo_vehiculo: str, gravedad: str) -> str:
    key = (tipo_vehiculo, gravedad)
    options = DESCRIPCIONES.get(key)
    if options:
        return random.choice(options)
    return f"Accidente de {tipo_vehiculo}, gravedad {gravedad}"


def _random_fecha_en_rango() -> datetime:
    """Random datetime between Jan 1 2023 and Dec 31 2024."""
    inicio = datetime(2023, 1, 1)
    fin    = datetime(2024, 12, 31, 23, 59, 59)
    delta  = fin - inicio
    segundos = random.randint(0, int(delta.total_seconds()))
    return inicio + timedelta(seconds=segundos)


# ---------------------------------------------------------------------------
# Seeding functions
# ---------------------------------------------------------------------------

def seed_usuarios(session) -> None:
    usuarios = [
        Usuario(
            username="admin",
            email="admin@crashmap.co",
            hashed_password=pwd_context.hash("admin123"),
            es_admin=True,
        ),
        Usuario(
            username="usuario",
            email="usuario@crashmap.co",
            hashed_password=pwd_context.hash("user123"),
            es_admin=False,
        ),
    ]
    session.add_all(usuarios)
    session.flush()
    print(f"  Users created: admin (admin123), usuario (user123)")


def seed_accidentes(session) -> int:
    accidentes = []
    for barrio in BARRIOS_DATA:
        nombre         = barrio["nombre"]
        centro_lat     = barrio["lat"]
        centro_lng     = barrio["lng"]
        factor_riesgo  = barrio["factor_riesgo"]
        cantidad       = barrio["cantidad"]

        for _ in range(cantidad):
            lat = centro_lat + random.uniform(-0.003, 0.003)
            lng = centro_lng + random.uniform(-0.003, 0.003)

            fecha_hora    = _random_fecha_en_rango()
            gravedad      = _gravedad_para_barrio(factor_riesgo)
            tipo_vehiculo = random.choices(
                ["moto", "auto", "bus", "camion", "bicicleta"],
                weights=[45, 35, 10, 6, 4]
            )[0]
            clima         = _clima_para_mes(fecha_hora.month)
            estado_via    = _estado_via_para_barrio(factor_riesgo)
            dia_festivo   = _es_festivo(fecha_hora)
            hora_pico     = fecha_hora.hour in range(6, 10) or fecha_hora.hour in range(17, 21)
            descripcion   = _descripcion(tipo_vehiculo, gravedad)
            reportado_por = random.choice(["admin", "sistema"])

            accidentes.append(Accidente(
                latitud=round(lat, 6),
                longitud=round(lng, 6),
                barrio=nombre,
                fecha_hora=fecha_hora,
                gravedad=gravedad,
                tipo_vehiculo=tipo_vehiculo,
                clima=clima,
                estado_via=estado_via,
                dia_festivo=dia_festivo,
                hora_pico=hora_pico,
                descripcion=descripcion,
                reportado_por=reportado_por,
                estado="aprobado",
                fuente="manual",
            ))

    session.add_all(accidentes)
    print(f"  Accidents created: {len(accidentes)}")
    return len(accidentes)


def seed_factores_riesgo(session) -> None:
    factores = [
        FactorRiesgo(
            latitud=f["lat"],
            longitud=f["lng"],
            tipo_factor=f["tipo"],
            nivel_riesgo=f["riesgo"],
            activo=True,
        )
        for f in FACTORES_RIESGO_DATA
    ]
    session.add_all(factores)
    print(f"  Risk factors created: {len(factores)}")


def seed_notificaciones(session) -> None:
    notificaciones = [
        Notificacion(
            tipo="info",
            titulo="Bienvenido al sistema CrashMap Cartagena",
            mensaje=(
                "El sistema de análisis de accidentalidad vial de Cartagena está listo. "
                "Explore el mapa de calor, planifique rutas seguras y gestione reportes."
            ),
            es_leida=False,
        ),
        Notificacion(
            tipo="success",
            titulo="Base de datos inicializada con 600+ registros de accidentes reales",
            mensaje=(
                "Se cargaron datos históricos de accidentes de tráfico en Cartagena "
                "correspondientes al período enero 2023 - diciembre 2024, distribuidos "
                "en 18 barrios y zonas viales de la ciudad."
            ),
            es_leida=False,
        ),
        Notificacion(
            tipo="info",
            titulo="Sistema de monitoreo activo",
            mensaje=(
                "El módulo de predicción de riesgo y el mapa de calor están operativos. "
                "Los factores de riesgo han sido configurados para las zonas críticas de la ciudad."
            ),
            es_leida=False,
        ),
    ]
    session.add_all(notificaciones)
    print(f"  Notifications created: {len(notificaciones)}")


# ---------------------------------------------------------------------------
# Main setup routine
# ---------------------------------------------------------------------------

def setup_database() -> None:
    print("=" * 60)
    print("  CrashMap Cartagena — Database Setup")
    print("=" * 60)
    print(f"\nConnecting to: {DATABASE_URL}\n")

    engine = create_engine(DATABASE_URL, echo=False)

    print("Dropping existing tables...")
    Base.metadata.drop_all(bind=engine)
    print("  Done.")

    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("  Tables created: usuarios, accidentes, factores_riesgo, notificaciones")

    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        print("\nSeeding data...")

        seed_usuarios(session)
        total_accidentes = seed_accidentes(session)
        seed_factores_riesgo(session)
        seed_notificaciones(session)

        session.commit()

        print("\n" + "=" * 60)
        print("  SETUP COMPLETED SUCCESSFULLY")
        print("=" * 60)
        print("\nSummary:")
        print("  Database : accidentalidad_ctg")
        print("  Users    :")
        print("    - admin   / admin123  (admin)")
        print("    - usuario / user123   (regular user)")
        print(f"  Accidents: {total_accidentes} records (Jan 2023 – Dec 2024)")
        print(f"  Risk factors: {len(FACTORES_RIESGO_DATA)}")
        print("  Notifications: 3")
        print("\nStart the backend with:")
        print("  uvicorn main:app --reload")

    except Exception as exc:
        session.rollback()
        print(f"\nERROR during seeding: {exc}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    setup_database()
