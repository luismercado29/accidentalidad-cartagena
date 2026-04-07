# INFORME EJECUTIVO
## Sistema de Gestión y Análisis de Accidentalidad Vial
## CrashMap Cartagena

---

**Entidad:** Secretaría de Movilidad — Distrito de Cartagena de Indias
**Versión del sistema:** 4.0
**Fecha de elaboración:** Marzo 2026
**Clasificación:** Uso interno

---

## 1. RESUMEN EJECUTIVO

CrashMap Cartagena es una plataforma tecnológica integral desarrollada para la Secretaría de Movilidad del Distrito de Cartagena de Indias, con el propósito de centralizar, analizar y gestionar en tiempo real la información sobre accidentalidad vial en el territorio municipal.

El sistema consolida datos históricos, permite el reporte ciudadano en campo, facilita la toma de decisiones operativas mediante inteligencia artificial y machine learning, y provee herramientas de seguimiento y control a los operadores de turno.

---

## 2. JUSTIFICACIÓN

La accidentalidad vial en Cartagena representa uno de los principales problemas de seguridad pública y movilidad urbana. La falta de una herramienta centralizada y en tiempo real dificultaba la identificación oportuna de zonas críticas, el seguimiento de intervenciones y la medición del impacto de las políticas de movilidad.

CrashMap nace como respuesta a esta necesidad, integrando tecnologías modernas de análisis de datos geoespaciales, machine learning y comunicación en tiempo real.

---

## 3. ALCANCE DEL SISTEMA

El sistema cubre los siguientes procesos:

- **Registro y validación** de accidentes viales (manual, móvil, importación masiva)
- **Visualización geoespacial** mediante mapas de calor y marcadores interactivos
- **Análisis estadístico** con gráficos de tendencias, distribución por hora, barrio, gravedad y tipo de vehículo
- **Gestión de incidentes activos** con control de SLA y notificaciones
- **Identificación de puntos negros** mediante algoritmos de clustering (KMeans)
- **Predicción de riesgo** por franja horaria y día usando modelo de machine learning (PyTorch)
- **Panel de control en tiempo real** para sala de operaciones
- **Alertas automáticas** por zona cuando se supera un umbral de accidentes
- **Análisis comparativo interanual** para medir impacto de intervenciones
- **Monitoreo de cámaras** de tránsito con feeds en tiempo real

---

## 4. MÓDULOS DEL SISTEMA

### 4.1 Módulos de Acceso General

| Módulo | Descripción |
|--------|-------------|
| Mapa de Calor | Visualización geoespacial con filtros avanzados |
| Ruta Segura | Planificador de rutas con análisis de riesgo |
| Asistente IA | Chat inteligente sobre accidentalidad |
| Panel Público | Estadísticas abiertas a la ciudadanía |
| Reportar Accidente | App móvil PWA para reporte en campo |

### 4.2 Módulos de Operaciones (Administrador)

| Módulo | Descripción |
|--------|-------------|
| Dashboard | Panel principal con métricas, gestión y herramientas |
| Gestión de Incidentes | Control de incidentes activos con cronómetro SLA |
| Panel de Turno | Pantalla de control para sala de operaciones (TV) |
| Alertas por Zona | Configuración de alertas automáticas por umbral |

### 4.3 Módulos de Análisis (Administrador)

| Módulo | Descripción |
|--------|-------------|
| Puntos Negros | Identificación y gestión de zonas críticas |
| Comparativo Interanual | Análisis de tendencias año a año |
| Predicción de Riesgo | Mapa predictivo con ML + datos históricos |

### 4.4 Módulos de Configuración (Administrador)

| Módulo | Descripción |
|--------|-------------|
| Cámaras de Tránsito | Gestión y visualización de feeds MJPEG |
| Importar Datos | Carga masiva desde archivos Excel |
| Fuentes Externas | Integración con sistemas externos |
| Geocercas | Zonas virtuales de monitoreo |
| Códigos QR | Generación de QR para reportes rápidos |

---

## 5. TECNOLOGÍAS UTILIZADAS

| Componente | Tecnología |
|-----------|-----------|
| Backend | Python 3.x + FastAPI |
| Base de datos | SQLite (producción: PostgreSQL) |
| ORM | SQLAlchemy |
| Autenticación | JWT (python-jose) |
| Machine Learning | PyTorch + Scikit-learn (KMeans) |
| Notificaciones | Twilio (WhatsApp) + SMTP (Email) |
| Reportes PDF | ReportLab |
| Frontend | React 18 |
| Mapas | Leaflet.js + OpenStreetMap |
| Gráficos | Chart.js |
| App Móvil | PWA (Service Worker + Web App Manifest) |

---

## 6. INFRAESTRUCTURA REQUERIDA

| Componente | Especificación mínima |
|-----------|----------------------|
| Servidor | 4 GB RAM, 2 núcleos CPU, 50 GB almacenamiento |
| Sistema operativo | Windows 10/11 o Ubuntu 20.04+ |
| Python | 3.9 o superior |
| Node.js | 16 o superior |
| Navegador | Chrome 90+, Firefox 88+, Edge 90+ |
| Conectividad | Internet para mapas y notificaciones externas |

---

## 7. USUARIOS DEL SISTEMA

### Administradores
- Funcionarios de la Secretaría de Movilidad
- Operadores de sala de control
- Analistas de datos viales
- Coordinadores de atención de incidentes

### Usuarios de Campo
- Agentes de tránsito
- Policías de movilidad
- Personal de emergencias

### Usuarios Públicos
- Ciudadanía en general (Panel Público)

---

## 8. INDICADORES DE IMPACTO

El sistema permite medir:

- **Reducción de tiempo de respuesta** a incidentes (SLA)
- **Variación interanual** de accidentes por zona
- **Efectividad de intervenciones** en puntos negros (cambio de estado: sin intervenir → intervenido)
- **Cobertura de reporte ciudadano** (accidentes reportados vs. total)
- **Cumplimiento de SLA** por operador

---

## 9. CONCLUSIONES

CrashMap Cartagena representa un avance significativo en la gestión de la accidentalidad vial del Distrito. La integración de tecnologías de visualización geoespacial, machine learning y comunicación en tiempo real posiciona a Cartagena como referente en el uso de datos para la toma de decisiones en movilidad urbana.

El sistema está diseñado para escalar progresivamente, integrando nuevas fuentes de datos, mejorando los modelos predictivos con más información histórica y ampliando la cobertura de cámaras y sensores viales.

---

*Documento generado por el equipo de desarrollo de CrashMap Cartagena · Marzo 2026*
