# GUÍA DE INSTALACIÓN Y DESPLIEGUE
## CrashMap Cartagena
### Versión 4.0 · Marzo 2026

---

## PASO 1 — REQUISITOS PREVIOS

Instalar en el servidor o equipo:

| Software | Versión | Descarga |
|----------|---------|----------|
| Python | 3.9 o superior | python.org |
| Node.js | 16 o superior | nodejs.org |
| Git | Cualquier versión | git-scm.com |

Verificar instalación:
```bash
python --version
node --version
npm --version
```

---

## PASO 2 — CLONAR EL PROYECTO

```bash
git clone <url-del-repositorio>
cd accidentalidad-cartagena
```

O simplemente copiar la carpeta del proyecto al servidor.

---

## PASO 3 — CONFIGURAR EL BACKEND

```bash
cd backend

# 1. Crear entorno virtual
python -m venv venv

# 2. Activar entorno virtual
# Windows:
venv\Scripts\activate
# Linux / Mac:
source venv/bin/activate

# 3. Instalar dependencias
pip install -r requirements.txt
```

### Crear archivo de configuración

Crear el archivo `backend/.env` con el siguiente contenido:

```env
# ── Base de datos ──────────────────────────────────
# SQLite (desarrollo local):
DATABASE_URL=sqlite:///./accidentes.db

# PostgreSQL (producción):
# DATABASE_URL=postgresql+psycopg2://postgres:contraseña@localhost/accidentalidad_ctg

# ── Seguridad JWT ──────────────────────────────────
SECRET_KEY=cambia_esto_por_una_clave_larga_y_aleatoria_minimo_32_caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# ── Twilio WhatsApp (opcional) ─────────────────────
# Dejar vacío si no se usa WhatsApp
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+573001234567

# ── Email SMTP (opcional) ──────────────────────────
# Dejar vacío si no se usa email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# ── OpenWeather (opcional) ─────────────────────────
OPENWEATHER_API_KEY=
```

> **Importante:** Cambiar `SECRET_KEY` por una cadena aleatoria larga. Nunca usar el valor de ejemplo en producción.

### Iniciar el backend

```bash
# Dentro de la carpeta backend, con el venv activado:
python main.py
```

El backend estará disponible en: `http://localhost:8000`
Documentación interactiva: `http://localhost:8000/docs`

---

## PASO 4 — CONFIGURAR EL FRONTEND

```bash
cd frontend

# 1. Instalar dependencias
npm install

# 2. Crear archivo de configuración
# Crear frontend/.env con:
REACT_APP_API_URL=http://localhost:8000
```

### Iniciar el frontend (modo desarrollo)

```bash
npm start
```

La aplicación estará disponible en: `http://localhost:3000`

---

## PASO 5 — CREAR EL PRIMER ADMINISTRADOR

Al iniciar el sistema por primera vez, registrar el usuario administrador **directamente en la base de datos** (el registro público solo crea usuarios normales).

**Opción A — Usando la API (recomendado):**

```bash
# 1. Primero registrar un usuario normal
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "contraseña_segura"}'

# 2. Luego actualizar manualmente es_admin en la DB
```

**Opción B — SQLite directo:**

Abrir `backend/accidentes.db` con DB Browser for SQLite y ejecutar:

```sql
UPDATE usuarios SET es_admin = 1 WHERE username = 'admin';
```

**Opción C — Si hay un endpoint de setup inicial:**

```bash
curl -X POST http://localhost:8000/api/setup/primer-admin \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "contraseña_segura", "setup_key": "SETUP_KEY_del_env"}'
```

---

## PASO 6 — VERIFICAR EL SISTEMA

1. Abrir `http://localhost:3000`
2. Iniciar sesión con las credenciales del administrador
3. Verificar que el Dashboard cargue correctamente
4. Probar el mapa de calor
5. Crear un accidente de prueba

---

## DESPLIEGUE EN PRODUCCIÓN

### Backend con Gunicorn

```bash
pip install gunicorn

# Ejecutar con múltiples workers
gunicorn main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile access.log \
  --error-logfile error.log
```

### Frontend — Compilar para producción

```bash
cd frontend
npm run build
# Los archivos estáticos quedan en frontend/build/
```

### Configurar Nginx

```nginx
server {
    listen 80;
    server_name crashmap.cartagena.gov.co;

    # Redirigir HTTP a HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name crashmap.cartagena.gov.co;

    ssl_certificate     /etc/ssl/certs/crashmap.crt;
    ssl_certificate_key /etc/ssl/private/crashmap.key;

    # Frontend (archivos estáticos)
    location / {
        root /var/www/crashmap/build;
        try_files $uri /index.html;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Archivos subidos (fotos)
    location /uploads/ {
        alias /var/www/crashmap/backend/uploads/;
    }
}
```

### Servicio systemd (Linux)

Crear `/etc/systemd/system/crashmap.service`:

```ini
[Unit]
Description=CrashMap Cartagena Backend
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/crashmap/backend
Environment=PATH=/var/www/crashmap/backend/venv/bin
ExecStart=/var/www/crashmap/backend/venv/bin/gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable crashmap
systemctl start crashmap
systemctl status crashmap
```

---

## BACKUPS

### SQLite (desarrollo)

```bash
# Backup manual
cp backend/accidentes.db backups/accidentes_$(date +%Y%m%d_%H%M).db

# Backup automático diario (cron)
0 2 * * * cp /ruta/backend/accidentes.db /backups/accidentes_$(date +\%Y\%m\%d).db
```

### PostgreSQL (producción)

```bash
# Backup completo
pg_dump -U postgres accidentalidad_ctg > backup_$(date +%Y%m%d).sql

# Restaurar
psql -U postgres accidentalidad_ctg < backup_20260315.sql
```

---

## SCRIPTS DE INICIO RÁPIDO (Windows)

Los archivos .bat incluidos en la raíz del proyecto:

| Archivo | Función |
|---------|---------|
| `instalar_dependencias.bat` | Instala todas las dependencias (Python + Node) |
| `iniciar_backend.bat` | Inicia el servidor FastAPI |
| `iniciar_frontend.bat` | Inicia la app React |
| `iniciar_db_y_datos.bat` | Inicializa la DB y carga datos de ejemplo |

**Uso:**
1. Ejecutar `instalar_dependencias.bat` (solo la primera vez)
2. Ejecutar `iniciar_backend.bat` en una ventana
3. Ejecutar `iniciar_frontend.bat` en otra ventana
4. Abrir `http://localhost:3000`

---

## SOLUCIÓN DE PROBLEMAS COMUNES

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| "Module not found: leaflet" | npm install incompleto | `cd frontend && npm install` |
| "Cannot connect to database" | SQLite bloqueado o ruta incorrecta | Verificar que no hay otra instancia del backend corriendo |
| El mapa no carga | Sin conexión a internet | OpenStreetMap requiere internet para los tiles del mapa |
| "401 Unauthorized" en la API | Token expirado o inválido | Cerrar sesión y volver a iniciar |
| La app no muestra datos | Backend no está corriendo | Verificar que `python main.py` está activo |
| "Port 8000 already in use" | Puerto ocupado | Cambiar el puerto en main.py o matar el proceso |
| WhatsApp no se envía | Twilio no configurado | Agregar credenciales Twilio en .env |

---

*Guía de Instalación — CrashMap Cartagena v4.0 · Marzo 2026*
