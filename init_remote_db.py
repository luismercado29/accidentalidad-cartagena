#!/usr/bin/env python
"""
Initialize the remote PostgreSQL database on Vercel.
Run this ONCE after setting DATABASE_URL in Vercel settings.

Usage:
    python init_remote_db.py

This script will:
1. Read DATABASE_URL from environment
2. Create all database tables
3. Seed with initial data
"""

import os
import sys
from datetime import datetime, timedelta
import random

from dotenv import load_dotenv

# Load environment variables from .env or Vercel
load_dotenv()

try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import declarative_base, sessionmaker
    from passlib.context import CryptContext
except ImportError:
    print("Please install required packages:")
    print("pip install -r api/requirements.txt")
    sys.exit(1)

# Get database URL from environment
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:1234@localhost/accidentalidad_ctg"
)

print(f"🔗 Connecting to: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'localhost'}")
print("⏳ Initializing database...")

try:
    # Import models from backend
    from backend.setup_database import Base, Usuario, Accidente, FactorRiesgo, Notificacion
    
    # Create engine
    engine = create_engine(DATABASE_URL)
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created successfully")
    
    # Create session for seeding
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    
    # Create default admin user
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    admin_password = pwd_context.hash("admin123")  # Change this!
    
    admin_user = Usuario(
        username="admin",
        email="admin@crashmap.local",
        hashed_password=admin_password,
        es_admin=True,
    )
    
    session.add(admin_user)
    session.commit()
    print("✅ Admin user created (username: admin, password: admin123)")
    print("   ⚠️  Change password in production!")
    
    # Seed sample data - neighborhoods
    sample_neighborhoods = [
        {"nombre": "Bocagrande", "lat": 10.3922, "lng": -75.5386},
        {"nombre": "Centro Histórico", "lat": 10.4236, "lng": -75.5472},
        {"nombre": "Getsemaní", "lat": 10.4195, "lng": -75.5520},
        {"nombre": "Manga", "lat": 10.4020, "lng": -75.5205},
    ]
    
    # Create a few sample accidents
    for i, barrio in enumerate(sample_neighborhoods[:3]):
        accident = Accidente(
            latitud=barrio["lat"],
            longitud=barrio["lng"],
            barrio=barrio["nombre"],
            fecha_hora=datetime.utcnow() - timedelta(days=i),
            gravedad=random.choice(["leve", "grave", "fatal"]),
            tipo_vehiculo=random.choice(["auto", "moto", "bus"]),
            clima=random.choice(["soleado", "nublado", "lluvia"]),
            estado_via=random.choice(["bueno", "regular", "malo"]),
            dia_festivo=False,
            hora_pico=True,
            descripcion=f"Accidente de muestra en {barrio['nombre']}",
            estado="aprobado",
            fuente="seed"
        )
        session.add(accident)
    
    session.commit()
    print("✅ Sample data seeded successfully")
    print(f"\n🎉 Database initialized for Vercel deployment!")
    print(f"📊 App is ready at: https://accidentalidad-cartagena.vercel.app")
    
    session.close()
    
except Exception as e:
    print(f"❌ Error: {e}")
    print("\n💡 Troubleshooting:")
    print("1. Check that DATABASE_URL is set correctly in Vercel Settings")
    print("2. Ensure PostgreSQL is accessible from your current location")
    print("3. Run this script from your personal computer, not from Vercel")
    sys.exit(1)
