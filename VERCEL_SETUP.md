# Setup de Vercel para Accidentalidad Cartagena

## ✅ Estado Actual
- **Frontend**: Desplegado en Vercel ✅
- **Backend API**: Configurado pero requiere base de datos
- **URL**: https://accidentalidad-cartagena.vercel.app

## 🔧 Pasos para Completar el Setup

### Paso 1: Configurar Base de Datos PostgreSQL en la Nube

Elige UNA de estas opciones:

#### Opción A: Vercel Postgres (Recomendado)
1. Ve a https://vercel.com/dashboard
2. Selecciona el proyecto "accidentalidad-cartagena"
3. Ir a "Storage" → "Create Database" → Postgres
4. Seguir las instrucciones para crear la BD
5. Copiar la `DATABASE_URL` del panel

#### Opción B: Supabase (Alternativa Gratis)
1. Ir a https://supabase.com
2. Crear una cuenta gratuita
3. Crear un nuevo proyecto
4. En "Settings" → "Database" → copiar la URL de conexión
5. Asegurarse que el puerto sea 5432

#### Opción C: Railway.app
1. Ir a https://railway.app
2. Crear cuenta
3. Nuevo proyecto → Add service → PostgreSQL
4. Copiar `DATABASE_URL` desde variables

### Paso 2: Agregar Variables de Entorno a Vercel

En Vercel Dashboard:
1. Ir a proyecto → Settings → Environment Variables
2. Agregar estas variables:

```
DATABASE_URL = postgresql+psycopg2://usuario:password@host:5432/accidentalidad_ctg
SECRET_KEY = tu-clave-secreta-muy-segura
ACCESS_TOKEN_EXPIRE_HOURS = 24
MODEL_PATH = backend/modelo_riesgo.pt
OPENWEATHER_API_KEY = tu-api-key
ANTHROPIC_API_KEY = tu-api-key
TWILIO_ACCOUNT_SID = tu-sid
TWILIO_AUTH_TOKEN = tu-token
```

### Paso 3: Inicializar la Base de Datos en Vercel

Una vez agregadas las variables, ejecuta:

```bash
# Opción 1: Ejecutar script de setup remoto
npx vercel env pull
python backend/setup_database.py

# Opción 2: Usar curl para ejecutar endpoint de setup
curl https://accidentalidad-cartagena.vercel.app/api/health
```

### Paso 4: Verificar que Todo Funciona

```bash
# Verificar backend
curl https://accidentalidad-cartagena.vercel.app/api/health

# Ver logs en Vercel Dashboard
# Proyecto → Deployments → Logs
```

## 🚀 Cómo Funciona Ahora

- **Frontend React**: Servido como sitio estático desde Vercel
- **Backend FastAPI**: Corriendo en Vercel Functions (Python)
- **Base de Datos**: PostgreSQL en la nube
- **API Routes**: `/api/*` se enruta a los endpoints del backend

## 📝 Notas Importantes

- El modelo de ML (`modelo_riesgo.pt`) debe estar disponible en el backend
- Las variables de entorno se pueden actualizar sin redeploy
- Vercel Functions tienen límite de 10 segundos por request (suficiente para la mayoría de operaciones)
- Los archivos estáticos se cachean en Vercel's CDN

## 🔗 URLs Útiles

- Dashboard: https://vercel.com/dashboard
- Proyecto: https://vercel.com/dashboard/projects/accidentalidad-cartagena
- App: https://accidentalidad-cartagena.vercel.app
- API: https://accidentalidad-cartagena.vercel.app/api

