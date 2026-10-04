# Pulso Vial · Siniestralidad vial de Cartagena

Observatorio y sistema de gestión de la siniestralidad vial en Cartagena de Indias. Iniciativa independiente: no representa a ninguna entidad oficial.

## Módulos

**Ciudadanía (sin cuenta)**
- **Portada** con cifras del año, mapa de calor y barrios críticos.
- **Mapa de calor** con filtros (periodo, gravedad, clase, vehículo, franja horaria) y capas: puntos, puntos negros y novedades en la vía.
- **Ruta segura**: compara alternativas de recorrido (Mapbox Directions u OSRM) según los siniestros registrados cerca de cada tramo y a la hora del viaje.
- **Reportar un siniestro** desde la web o un **código QR** de paradero, con código de seguimiento; también por **WhatsApp** (webhook compatible con Twilio).
- **Datos abiertos** con descarga CSV agregada y anónima; **asistente IA** para preguntas sobre los datos.

**Consola del equipo** (roles: administración, supervisión, operación, análisis)
- **Operación**: resumen, panel de turno en vivo, incidentes (de la apertura al cierre con tiempo máximo de llegada), bandeja de reportes ciudadanos, unidades y alertas por zona.
- **Registro**: siniestros (alta, edición, búsqueda y exportación), importación de históricos CSV o Excel, y fuentes externas (noticias RSS y publicaciones de redes cargadas a mano).
- **Análisis**: mapa de calor, puntos negros (DBSCAN + índice EPDO), comparativo anual, predicción de riesgo (modelo de Poisson validado con PAI) e informes imprimibles.
- **Territorio**: geocercas, cámaras (integración futura con la red de la ciudad), novedades en la vía y códigos QR.
- **Administración**: usuarios, auditoría y ajustes (modo demostración).

Todas las vistas con fechas comparten el **filtro de tiempo**:
- atajos: hoy, 7/30/90 días, este mes, mes anterior, este año, 12 meses, año anterior, «hace un año» y todo el historial;
- cualquier año concreto;
- un rango exacto de fechas.

El filtro vive en la URL, así que la consulta se puede compartir.

## Tecnología

- Next.js 16 (App Router, Server Actions), React 19, TypeScript y Tailwind CSS 4.
- Drizzle ORM sobre Postgres (Neon en producción; PGlite embebido en desarrollo).
- Leaflet con teselas de Mapbox (respaldo OpenStreetMap), GSAP y Lenis solo en la portada, y AI SDK 7 vía Vercel AI Gateway (con modo de respaldo por reglas).
- Diseño basado en la skill `diseno-editorial-aula`, auditado con axe-core (WCAG 2.2 AA) en escritorio y móvil.

## Desarrollo

```bash
npm install
npm run db:reset   # base local en .pglite/: migra y carga datos (cuentas en credenciales-local.local)
npm run dev
npm test           # pruebas de analitica, tiempo, fuentes, importacion y asistente
```

Variables de entorno: ver `.env.example`.

## Datos

- Las tablas viven en el esquema `vial`.
- Al desplegar (`npm run vercel-build`) se ejecutan las migraciones y `src/db/preparar.ts`:
  - copia los datos de la versión anterior (esquema `public`) sin modificarlos;
  - crea las cuentas del equipo con las claves de las variables `CLAVE_*`;
  - carga los catálogos iniciales;
  - en modo demostración, completa el histórico con siniestros simulados, marcados como `simulado` y borrables desde Ajustes.
