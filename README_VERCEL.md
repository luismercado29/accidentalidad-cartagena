# 🚨 CRASHMAP - Cartagena Accident Prevention System

Aplicación full-stack desplegada en **Vercel** con React frontend, FastAPI backend, y PostgreSQL.

## 🚀 Deployment Status

✅ **Frontend**: Desplegado en Vercel  
✅ **Backend API**: Corriendo en Vercel Functions  
⏳ **Database**: Pendiente de configuración  

**URL Viva**: https://accidentalidad-cartagena.vercel.app

---

## 🔧 Setup Rápido en Vercel

### 1️⃣ Crear Base de Datos PostgreSQL

Elige UNA opción:

**Opción A: Vercel Postgres (RECOMENDADO)**
```bash
# En https://vercel.com/dashboard
# → Proyecto → Storage → Create Postgres
# Copiar DATABASE_URL
```

**Opción B: Supabase (Gratis)**
```bash
# https://supabase.com
# Crear proyecto → Settings → Database → Connection string
```

**Opción C: Railway**
```bash
# https://railway.app → New Project → PostgreSQL
```

### 2️⃣ Configurar Variables de Entorno en Vercel

```bash
# https://vercel.com/dashboard/projects/accidentalidad-cartagena/settings/environment-variables

DATABASE_URL=postgresql+psycopg2://usuario:password@host:5432/accidentalidad_ctg
SECRET_KEY=tu-clave-super-segura-aqui
ACCESS_TOKEN_EXPIRE_HOURS=24
MODEL_PATH=backend/modelo_riesgo.pt
```

### 3️⃣ Inicializar La Base de Datos

```bash
# En tu máquina local
python init_remote_db.py

# Esto creará tablas e insertará usuario admin
```

### 4️⃣ Verificar que Funciona

```bash
# Probar API
curl https://accidentalidad-cartagena.vercel.app/api/health

# Ver logs en Vercel
# Dashboard → Deployments → Logs
```

---

## 📦 Estructura del Proyecto

```
accidentalidad-cartagena/
├── frontend/                  # React app
│   ├── src/components/        # Componentes React
│   ├── package.json
│   └── build/                 # Build output (deployado a Vercel)
│
├── backend/                   # FastAPI server
│   ├── main.py               # App principal + endpoints
│   ├── setup_database.py     # Script de setup
│   ├── requirements.txt       # Dependencias Python
│   └── modelo_riesgo.pt      # ML model
│
├── api/                       # Vercel Functions
│   ├── index.py              # Entry point
│   └── requirements.txt       # Dependencias
│
├── vercel.json               # Config de Vercel
├── init_remote_db.py         # Script para init DB remota
└── .env.example              # Ejemplo de variables

```

---

## 🔌 Endpoints del Backend

### Health Check
```bash
GET /api/health
```

### Autenticación
```bash
POST /api/login        # Login usuario
POST /api/signup       # Registrar usuario
```

### Accidentes
```bash
GET /api/accidentes           # Listar accidentes
POST /api/accidentes          # Crear accidente
GET /api/accidentes/{id}      # Detalles
PUT /api/accidentes/{id}      # Actualizar
DELETE /api/accidentes/{id}   # Eliminar
```

### Predicción de Riesgo
```bash
POST /api/predecir-riesgo     # Predicción ML
GET /api/puntos-negros        # Puntos peligrosos
GET /api/mapas-calor          # Mapas de densidad
```

---

## 🛠️ Desarrollo Local

### Requisitos
- Python 3.9+
- Node.js 18+
- PostgreSQL 12+ (local)

### Instalación

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend  
cd ../frontend
npm install

# Database
python ../backend/setup_database.py
```

### Ejecutar Localmente

```bash
# Terminal 1 - Backend
cd backend
python -m uvicorn main:app --reload

# Terminal 2 - Frontend
cd frontend
npm start
```

Abre http://localhost:3000

---

## 📊 Base de Datos

**Tablas Principales:**
- `usuarios` - Usuarios del sistema
- `accidentes` - Base de accidentes
- `factores_riesgo` - Factores de riesgo identificados
- `notificaciones` - Notificaciones del sistema
- `geocercas` - Polígonos de vigilancia

Schema está en: [backend/actualizar_bd.sql](backend/actualizar_bd.sql)

---

## 🤖 Modelo de ML

El modelo `modelo_riesgo.pt` predice el riesgo de accidente basado en:
- Ubicación geográfica
- Hora del día
- Clima
- Tipo de vehículo
- Estado de la vía

---

## 🔐 Seguridad

- JWT tokens para autenticación
- Passwords hasheadas con bcrypt
- CORS habilitado para acceso frontend
- Variables sensibles en environment variables
- HTTPS en Vercel

---

## 📈 Performance

- Frontend cacheado en Vercel CDN
- Backend optimizado con async/await
- Queries a BD indexadas
- Compresión de assets

---

## 🐛 Troubleshooting

### Backend devuelve 500
```bash
# Revisar logs en Vercel
# Dashboard → Deployments → Logs
# Verificar DATABASE_URL está configurada
```

### Frontend no se conecta al API
```bash
# Revisar REACT_APP_API_URL en .env.example
# Debe apuntar a: https://accidentalidad-cartagena.vercel.app/api
```

### Base de datos no inicializa
```bash
# Ejecutar nuevamente
python init_remote_db.py

# O manual via SQL client
psql postgresql+psycopg2://user:pass@host/db
\i backend/actualizar_bd.sql
```

---

## 📚 Documentación

- [Manual del Usuario](docs/2_manual_usuario.md)
- [Manual del Programador](docs/3_manual_programador.md)
- [API Reference](docs/4_manual_api.md)
- [Guía de Instalación](docs/7_guia_instalacion.md)

---

## 👨‍💻 Equipo

Desarrollado con ❤️ para reducir accidentalidad en Cartagena

---

## 📄 Licencia

MIT

---

**¿Preguntas?** Ver documentación en carpeta `docs/`
