#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Initialize the Neon PostgreSQL database for Vercel deployment.
Run this ONCE after setting DATABASE_URL in Vercel settings.

Usage:
    python init_neon_db.py

This script will:
1. Read DATABASE_URL from environment
2. Create all database tables
3. Seed with initial admin user
"""

import os
import sys
from datetime import datetime, timedelta
import random

from dotenv import load_dotenv

# Load environment variables from .env.local (Vercel CLI creates this)
load_dotenv(".env.local")

try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from passlib.context import CryptContext
except ImportError:
    print("ERROR: Required packages not installed")
    print("pip install sqlalchemy psycopg2-binary passlib python-dotenv")
    sys.exit(1)

# Get database URL from environment (Neon)
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in environment")
    print("Please ensure .env.local exists with DATABASE_URL from Neon")
    sys.exit(1)

# Extract host for display
try:
    host = DATABASE_URL.split('@')[1].split('/')[0] if '@' in DATABASE_URL else 'unknown'
    print(f"[OK] Connecting to: {host}")
except:
    pass

print("[INFO] Initializing Neon database...")

try:
    # Import models directly from backend main
    from backend.main import Base, Usuario, Accidente, FactorRiesgo, Notificacion, Geocerca
    
    # Create engine with SSL and pooling for Neon
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        pool_pre_ping=True,  # Test connections before using
        pool_size=5,
        max_overflow=10,
        connect_args={
            "connect_timeout": 15,
            "keepalives": 1,
            "keepalives_idle": 30,
        }
    )
    
    # Test connection
    print("[INFO] Testing database connection...")
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        print("[OK] Database connection successful")
    
    # Create all tables
    print("[INFO] Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("[OK] Database tables created successfully")
    
    # Create session for seeding
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    
    # Create password hasher
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    
    # Check if admin already exists
    existing_admin = session.query(Usuario).filter(Usuario.username == "admin").first()
    if not existing_admin:
        # Create default admin user
        admin_password_hash = pwd_context.hash("admin123456")
        admin_user = Usuario(
            username="admin",
            email="admin@accidentalidad-cartagena.local",
            hashed_password=admin_password_hash,
            es_admin=True,
        )
        session.add(admin_user)
        session.commit()
        print("[OK] Admin user created")
        print("   Username: admin")
        print("   Password: admin123456")
        print("   [WARN] Change password immediately in production!")
    else:
        print("[INFO] Admin user already exists, skipping creation")
    
    # Check if we need to seed test data
    existing_data = session.query(Accidente).count()
    if existing_data == 0:
        print("[INFO] Creating sample accident data...")
        # Sample neighborhoods  
        barrios = [
            {"nombre": "Bocagrande", "lat": 10.3922, "lng": -75.5386},
            {"nombre": "Centro Historico", "lat": 10.4236, "lng": -75.5472},
            {"nombre": "Getsemani", "lat": 10.4195, "lng": -75.5520},
            {"nombre": "Manga", "lat": 10.4020, "lng": -75.5205},
            {"nombre": "El Laguito", "lat": 10.3980, "lng": -75.5481},
        ]
        
        for i, barrio in enumerate(barrios):
            accident = Accidente(
                latitud=barrio["lat"] + random.uniform(-0.01, 0.01),
                longitud=barrio["lng"] + random.uniform(-0.01, 0.01),
                barrio=barrio["nombre"],
                fecha_hora=datetime.utcnow() - timedelta(days=random.randint(0, 30)),
                gravedad=random.choice(["leve", "grave", "fatal"]),
                tipo_vehiculo=random.choice(["automovil", "motocicleta", "autobus"]),
                clima=random.choice(["soleado", "nublado", "lluvia"]),
                estado_via=random.choice(["bueno", "regular", "malo"]),
                dia_festivo=random.choice([True, False]),
                hora_pico=random.choice([True, False]),
                descripcion=f"Accidente de prueba en {barrio['nombre']}",
                estado="aprobado",
                fuente="seed"
            )
            session.add(accident)
        
        session.commit()
        print(f"[OK] Sample data created: {len(barrios)} accidents")
    else:
        print(f"[INFO] Database already has {existing_data} accidents, skipping seed data")
    
    session.close()
    
    print("\n" + "="*60)
    print("[SUCCESS] Database initialization COMPLETE!")
    print("="*60)
    print(f"\nApp URL: https://accidentalidad-cartagena.vercel.app")
    print(f"Host: {host}")
    print(f"\nAdmin credentials:")
    print(f"   Username: admin")
    print(f"   Password: admin123456")
    print(f"\nIMPORTANT:")
    print(f"1. Change admin password after first login")
    print(f"2. Ensure SECRET_KEY is set in Vercel environment")
    print(f"3. Test login at the app URL to verify everything works")
    
except Exception as e:
    print(f"\n[ERROR] {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
    print("\n[HELP] Troubleshooting:")
    print("1. Verify .env.local exists with DATABASE_URL from Neon")
    print("2. Ensure Neon database is accessible from your network")
    print("3. Check that all required packages are installed")
    print("4. Verify the database credentials are correct")
    sys.exit(1)
