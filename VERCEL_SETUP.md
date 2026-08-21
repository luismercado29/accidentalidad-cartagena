# Despliegue en Vercel + Neon

Guia de referencia para desplegar este proyecto. Reemplaza a las instrucciones
anteriores, que describian una configuracion que no funcionaba.

## Que estaba fallando

El despliegue respondia HTTP 200, pero la aplicacion no servia para nada:

1. **La API nunca respondia.** El `vercel.json` anterior terminaba con la regla
   `{"src": "/(.*)", "dest": "/index.html"}`, que capturaba tambien `/api/*`.
   Una llamada a `/api/health` devolvia el HTML de la pagina en lugar de JSON,
   asi que el frontend no podia traer ningun dato.

2. **El frontend servido estaba viejo.** No habia `buildCommand`, por lo que
   Vercel nunca recompilaba: publicaba la carpeta `public/` de la raiz, una
   copia manual y desactualizada del build. En produccion se servia
   `main.a1a99712.js` mientras el codigo fuente generaba `main.a8a0b035.js`.

3. **La funcion de Python no cabia.** `api/requirements.txt` incluia
   `scikit-learn`, que arrastra `scipy`. Con eso las dependencias pesaban
   369 MB y el limite de una funcion serverless de Vercel es 250 MB
   descomprimidos.

## Como quedo configurado

`vercel.json` ahora:

- Compila el frontend en cada despliegue (`buildCommand`) y publica
  `frontend/build`, por lo que no puede volver a quedar desactualizado.
- Usa `rewrites` con `/((?!api/).*)`, que deja pasar `/api/*` hacia la funcion
  de Python y manda el resto a `index.html` para el enrutado del SPA.

La carpeta `public/` de la raiz se elimino por ser una copia obsoleta del
build. Ojo: `frontend/public/` es distinta, es la plantilla de origen de
Create React App y debe conservarse.

`frontend/build/` y `backend/accidentes.db` ya no se versionan.

## Variables de entorno en Vercel

En Settings -> Environment Variables:

| Variable | Obligatoria | Notas |
|---|---|---|
| `DATABASE_URL` | Si | Cadena de Neon. Ver formato abajo. |
| `SECRET_KEY` | Si | Firma los JWT. Generar una nueva, no reutilizar ninguna anterior. |
| `ACCESS_TOKEN_EXPIRE_HOURS` | No | Por defecto 24. |
| `OPENWEATHER_API_KEY` | No | Sin ella se desactiva el clima. |
| `ANTHROPIC_API_KEY` | No | Sin ella se desactiva el chat con IA. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | No | Sin ellas se desactiva WhatsApp. |

Generar `SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Formato de DATABASE_URL para Neon

El backend usa SQLAlchemy con psycopg2, asi que el prefijo debe ser
`postgresql+psycopg2://` y no el `postgresql://` que entrega Neon por defecto:

```
postgresql+psycopg2://USUARIO:PASSWORD@HOST.neon.tech/BASEDATOS?sslmode=require
```

Neon exige `sslmode=require`.

## Funcionalidad reducida en Vercel

Para que la funcion cupiera en 250 MB se quito `scikit-learn` de
`api/requirements.txt`. `backend/main.py` importa las dependencias pesadas
dentro de `try/except`, asi que el arranque no se rompe, pero estos dos
endpoints responden con un mensaje explicito en vez de calcular:

- clustering de accidentes
- recalculo de puntos negros

El resto de la aplicacion funciona igual. Para tener esos dos endpoints hay
que desplegar el backend en un host sin ese limite de tamano (Render, Railway,
Fly) instalando `backend/requirements.txt`, que si incluye scikit-learn y torch.

## Desarrollo local

```powershell
# Backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r api\requirements.txt
copy backend\.env.example backend\.env    # y rellenar SECRET_KEY
cd backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000

# Frontend, en otra terminal
cd frontend
npm install --legacy-peer-deps
npm start
```

Sin `DATABASE_URL` el backend usa el SQLite local `backend/accidentes.db`.

## Inicializar la base de datos en Neon

```powershell
$env:DATABASE_URL = "postgresql+psycopg2://..."
.\.venv\Scripts\python.exe backend\setup_database.py
```

## Nota de seguridad

El historial de este repositorio se reescribio para eliminar un archivo
`backend/.env` y un documento que exponian credenciales de Neon. Cualquier
credencial que haya estado en ese historial debe considerarse comprometida y
rotarse, aunque ya no aparezca en los commits.
