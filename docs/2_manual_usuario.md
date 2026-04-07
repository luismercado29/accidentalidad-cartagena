# MANUAL DE USUARIO
## CrashMap Cartagena — Sistema de Gestión de Accidentalidad Vial
### Versión 4.0 · Marzo 2026

---

## CONTENIDO

1. Introducción
2. Acceso al sistema
3. Módulos para todos los usuarios
4. Módulos para administradores
5. Notificaciones
6. Perfil de usuario
7. Aplicación móvil (PWA)
8. Preguntas frecuentes

---

## 1. INTRODUCCIÓN

CrashMap Cartagena es una plataforma web para la gestión y análisis de la accidentalidad vial en Cartagena de Indias. Este manual explica paso a paso cómo usar cada función del sistema.

**Acceso:** Abrir el navegador y entrar a `http://localhost:3000`

---

## 2. ACCESO AL SISTEMA

### 2.1 Iniciar sesión

1. En la pantalla de inicio escriba su **usuario** y **contraseña**
2. Haga clic en **Ingresar**
3. Si sus credenciales son correctas, el sistema lo llevará automáticamente al panel principal

### 2.2 Registro de nuevo usuario

1. En la pantalla de login, haga clic en **Registrarse**
2. Complete: nombre de usuario, contraseña
3. Los nuevos registros tienen acceso de **usuario normal** (no administrador)
4. Un administrador puede elevar permisos desde el panel

### 2.3 Cerrar sesión

- Haga clic en el botón **⏏ Salir** en la esquina superior derecha
- Su sesión quedará cerrada y el token eliminado

> **Nota:** La sesión se mantiene activa aunque cierre el navegador. Para mayor seguridad, cierre sesión cuando termine de usar el sistema.

---

## 3. MÓDULOS PARA TODOS LOS USUARIOS

### 3.1 🔥 Mapa de Calor

El mapa de calor muestra la distribución geográfica de los accidentes en Cartagena.

**Cómo usarlo:**

1. En el menú lateral, haga clic en **Mapa de Calor**
2. Verá el mapa de Cartagena con zonas coloreadas según la densidad de accidentes
   - Rojo intenso = alta concentración de accidentes
   - Amarillo = concentración media
   - Verde = baja concentración

**Filtros disponibles:**
- **Año / Mes:** Seleccione el período a visualizar
- **Gravedad:** Mostrar solo fatal, grave o leve
- **Tipo de vehículo:** Moto, carro, bus, bicicleta, peatón
- **Barrio:** Filtrar por zona específica
- **Clima:** Ver accidentes según condición climática

**Ver detalles de un accidente:**
- Cambie la vista a "Marcadores" (botón en el panel)
- Haga clic sobre cualquier punto en el mapa
- Aparecerá un popup con: barrio, fecha, gravedad, tipo de vehículo, descripción

**Exportar datos:**
- Haga clic en el botón **Exportar Excel**
- Se descargará un archivo .xlsx con todos los datos filtrados

---

### 3.2 🗺️ Ruta Segura

Permite planificar una ruta entre dos puntos evaluando el riesgo de accidentalidad.

**Cómo trazar una ruta:**

1. Haga clic en **Ruta Segura** en el menú
2. Haga clic en el mapa para seleccionar el **punto de origen** (marcador verde)
3. Haga clic en otro punto para seleccionar el **destino** (marcador rojo)
4. El sistema calculará la ruta y mostrará:
   - Trazado de la ruta en el mapa
   - Nivel de riesgo del trayecto
   - Puntos peligrosos sobre la ruta
   - Sugerencia de ruta alternativa más segura si existe

---

### 3.3 📝 Reportar Accidente *(usuarios de campo)*

Permite reportar un accidente desde el lugar de los hechos.

**Pasos para reportar:**

1. Haga clic en **Reportar Accidente** en el menú
2. Complete el formulario:

| Campo | Descripción |
|-------|-------------|
| Barrio | Barrio donde ocurrió el accidente |
| Fecha y hora | Fecha y hora exacta del incidente |
| Gravedad | Fatal / Grave / Leve |
| Tipo de vehículo | Moto, carro, bus, camión, bicicleta, peatón |
| Clima | Condición climática al momento |
| Estado de la vía | Bueno, mojado, deteriorado |
| Día festivo | Marcar si aplica |
| Hora pico | Marcar si aplica |
| Descripción | Descripción detallada del evento |

3. **Ubicar en el mapa:**
   - Opción A: Haga clic en **📍 GPS** para usar su ubicación actual
   - Opción B: Haga clic en **Seleccionar en el mapa** y toque el lugar exacto
   - Opción C: Ingrese manualmente latitud y longitud

4. Haga clic en **Enviar Reporte**
5. El reporte quedará en estado **Pendiente** hasta que un administrador lo revise

---

## 4. MÓDULOS PARA ADMINISTRADORES

### 4.1 🏠 Dashboard

Panel principal de gestión con tres secciones:

#### Sub-sección: Métricas

Muestra estadísticas globales del sistema:

- **KPIs superiores:** Total accidentes, fatales, graves, leves del período
- **Gráfico de tendencia mensual:** Evolución de accidentes mes a mes
- **Accidentes por hora:** En qué horas del día ocurren más accidentes
- **Por barrio:** Los 10 barrios con más accidentes
- **Por gravedad:** Distribución porcentual
- **Por tipo de vehículo:** Participación de cada tipo
- **Por clima:** Relación entre condiciones climáticas y accidentes
- **Widget de clima:** Temperatura, humedad y viento actuales en Cartagena

**Modelo ML:**
- El panel muestra si el modelo de predicción está entrenado o no
- Botón **Entrenar modelo** para actualizar el modelo con los datos más recientes
- El entrenamiento puede tardar unos minutos según el volumen de datos

**Exportar:**
- **Excel:** Descarga todos los datos del período seleccionado
- **Informe PDF:** Genera un informe oficial con membrete de la Secretaría de Movilidad

#### Sub-sección: Reportes

**Tab Pendientes:**
- Lista de reportes enviados por ciudadanos/agentes pendientes de revisión
- Cada tarjeta muestra: barrio, gravedad, vehículo, clima, descripción
- Acciones disponibles:
  - ✅ **Aprobar:** El reporte pasa a estado "aprobado" y aparece en estadísticas
  - ✏️ **Editar:** Corregir datos antes de aprobar
  - ✖ **Rechazar:** Descartar el reporte si es incorrecto o duplicado

**Tab Todos los Registros:**
- Tabla completa de todos los accidentes con filtros:
  - Buscar por ID, barrio o descripción
  - Filtrar por gravedad, estado, fuente, tipo de vehículo
  - Filtrar por rango de fechas (desde/hasta)
- El contador muestra en tiempo real cuántos registros coinciden
- Botón **✕ Limpiar filtros** para resetear
- Acciones por registro: ✏️ Editar | 🗑️ Eliminar

---

### 4.2 🚨 Gestión de Incidentes

Módulo para el manejo de incidentes activos en tiempo real.

#### Crear un incidente

1. Haga clic en **+ Nuevo Incidente**
2. Complete:
   - Tipo de incidente
   - Ubicación (barrio/dirección)
   - Nivel de gravedad
   - Descripción
   - SLA (tiempo máximo de atención en minutos, por defecto 30)
3. Clic en **Crear**

#### Estados del incidente

```
PENDIENTE ──► EN ATENCIÓN ──► CERRADO
```

- **Pendiente:** Recién creado, sin operario asignado
- **En atención:** Operario asignado y atendiendo
- **Cerrado:** Incidente resuelto

#### Cronómetro SLA

Cada incidente muestra un cronómetro en tiempo real:
- 🟢 **Verde:** Dentro del tiempo límite (menos del 50% del SLA)
- 🟡 **Amarillo:** En riesgo (entre 50% y 100% del SLA)
- 🔴 **Rojo / VENCIDO:** Se superó el tiempo de SLA

#### Atender un incidente

1. Haga clic en el incidente en estado Pendiente
2. Clic en **Atender**
3. El sistema registra el operario asignado y la hora de inicio

#### Cerrar un incidente

1. Haga clic en el incidente en atención
2. Clic en **Cerrar incidente**
3. Agregue notas de resolución
4. Al cerrar, el sistema enviará automáticamente una notificación por **WhatsApp** al supervisor

#### Historial

La pestaña **Historial** muestra incidentes cerrados con:
- Tiempo de respuesta
- Cumplimiento de SLA (Sí/No)
- Operario que atendió
- Notas de resolución

---

### 4.3 📺 Panel de Turno

Pantalla diseñada para ser proyectada en la **sala de control** en una TV o monitor grande.

**Características:**
- No requiere login adicional
- Se actualiza automáticamente cada 30 segundos
- Botón **⛶ Pantalla completa** para modo TV

**Qué muestra:**
- Hora actual en tiempo real
- KPIs del día: accidentes, fatales, graves, incidentes activos, SLA vencidos
- Mapa con puntos animados (pulso) por gravedad:
  - 🔴 Rojo grande = Fatal
  - 🟠 Naranja mediano = Grave
  - 🟢 Verde pequeño = Leve
- **Semáforo de zonas (2h):** Los barrios con actividad en las últimas 2 horas
  - 🔴 Rojo = 3 o más accidentes (zona crítica)
  - 🟡 Amarillo = 2 accidentes (zona de alerta)
  - 🟢 Verde = 1 accidente (zona de atención)
- Barras de progreso de SLA por incidente activo

---

### 4.4 ⚡ Alertas por Zona

Configura notificaciones automáticas cuando una zona supera un umbral de accidentes.

#### Crear una alerta

1. Haga clic en **+ Nueva Alerta**
2. Complete:
   - **Nombre:** Ej. "Alerta Bocagrande"
   - **Latitud y Longitud:** Centro de la zona a monitorear
   - **Radio (km):** Área de cobertura de la alerta
   - **Máx. accidentes:** Número que dispara la alerta
   - **Ventana de tiempo (min):** Período de análisis (Ej: 60 = última hora)
   - **Email del supervisor:** A quién enviar la alerta
3. Clic en **Guardar**

#### Cómo funciona

El sistema verifica cada **5 minutos** si alguna zona superó el umbral configurado. Si se supera, envía un email automático al supervisor.

#### Activar / Desactivar

- Use el botón de toggle en cada alerta para activarla o desactivarla sin eliminarla

---

### 4.5 🔴 Puntos Negros

Identifica y gestiona las intersecciones y tramos más peligrosos de Cartagena.

#### Sincronizar puntos negros

1. Haga clic en **⟳ Sincronizar desde DB**
2. Confirme la operación
3. El sistema ejecutará el algoritmo de clustering (KMeans) sobre todos los accidentes
4. Los resultados se mostrarán ordenados por peligrosidad (score de riesgo)

> Este proceso puede tardar unos segundos dependiendo del volumen de datos.

#### Mapa de puntos negros

- Cada punto aparece con su número de ranking (1 = más peligroso)
- Color según estado de intervención:
  - 🔴 Rojo = Sin intervenir
  - 🟡 Amarillo = En proceso
  - 🟢 Verde = Intervenido

#### Gestionar un punto negro

1. Haga clic en un punto en la lista o en el mapa
2. Las acciones disponibles son:
   - **✏ Editar estado:** Cambiar el estado de intervención y agregar notas
   - **📷 Subir foto:** Adjuntar evidencia fotográfica
   - **👁 Ver foto:** Ver la foto subida anteriormente

#### Estados de intervención

| Estado | Significado |
|--------|-------------|
| Sin Intervenir | La zona peligrosa no ha sido atendida |
| En Proceso | Se están ejecutando obras o medidas |
| Intervenido | La intervención fue completada |

---

### 4.6 📊 Comparativo Interanual

Compara la accidentalidad entre dos años para medir el impacto de las intervenciones.

**Cómo usar:**

1. Seleccione el **Año base** (Ej: 2024)
2. Seleccione el **Año actual** (Ej: 2025)
3. Haga clic en **Comparar**

**Resultados:**
- KPIs: total de cada año y variación porcentual
  - ▼ Verde = reducción de accidentes (positivo)
  - ▲ Rojo = aumento de accidentes (negativo)
- Gráfico de barras mes a mes con línea de variación %
- Tabla detallada con datos de fatales por mes

---

### 4.7 🔮 Predicción de Riesgo

Predice qué zonas tendrán mayor riesgo de accidentes en un día y horario determinado.

**Cómo usar:**

1. Seleccione el **Día de la semana**
2. Defina el rango horario (hora inicio / hora fin)
   - O use los botones de **horario rápido:** Mañana, Almuerzo, Tarde, Noche
3. Haga clic en **🔮 Predecir**

**Resultados:**
- Mapa con círculos por barrio (tamaño proporcional al riesgo)
  - 🔴 Rojo = Alto riesgo
  - 🟡 Naranja = Riesgo medio
  - 🟢 Verde = Riesgo bajo
- Puntos azules pequeños = accidentes históricos reales en ese horario
- Lista ranking de zonas más riesgosas con porcentaje

> Si el modelo ML no ha sido entrenado, la predicción se basa solo en densidad histórica. Para mayor precisión, entréname el modelo desde Dashboard → Métricas.

---

### 4.8 📹 Cámaras de Tránsito

Gestiona y visualiza los feeds de las cámaras de tránsito.

**Agregar una cámara:**

1. Haga clic en **+ Agregar cámara**
2. Complete:
   - Nombre de la cámara
   - URL del stream MJPEG (Ej: `http://192.168.1.10:8080/video`)
   - Latitud y longitud de la cámara
   - Descripción (Ej: "Intersección Av. Pedro de Heredia con Cra. 21")
3. Clic en **Guardar**

**Ver una cámara:**
- Haga clic en una cámara de la lista de la izquierda
- El feed aparecerá en el panel principal
- Clic en **↗ Abrir en nueva pestaña** para ver en pantalla completa

**Vista mosaico:**
- Si hay más de una cámara, en la parte inferior aparece la vista mosaico
- Muestra hasta 6 cámaras simultáneamente

---

## 5. NOTIFICACIONES

El ícono de campana 🔔 en la barra superior muestra las notificaciones del sistema.

- El número rojo indica notificaciones **no leídas**
- Haga clic en la campana para ver el listado
- Haga clic en **Marcar todas leídas** para limpiar el contador
- Las notificaciones se actualizan en tiempo real (WebSocket) y cada 30 segundos

**Tipos de notificaciones:**
- 🔵 Informativa: nuevo accidente registrado
- 🟢 Éxito: reporte ciudadano aprobado
- 🟡 Alerta: SLA próximo a vencer
- 🔴 Error o urgente: SLA vencido, incidente crítico

---

## 6. PERFIL DE USUARIO

Haga clic en su nombre en la esquina superior derecha para abrir el panel de perfil.

Desde aquí puede:
- Ver su información de usuario y rol
- Cambiar su contraseña
- Ajustar preferencias del sistema

---

## 7. APLICACIÓN MÓVIL (PWA)

CrashMap está disponible como aplicación instalable en su celular.

**Instalar en Android (Chrome):**
1. Abra `http://[dirección-del-servidor]:3000` en Chrome
2. Toque el menú ⋮ → "Agregar a pantalla de inicio"
3. La app aparecerá con ícono en su pantalla de inicio

**Instalar en iPhone (Safari):**
1. Abra la URL en Safari
2. Toque el botón compartir (cuadrado con flecha)
3. Seleccione "Agregar a pantalla de inicio"

**Ventajas de la app instalada:**
- Funciona sin conexión (datos en caché)
- Los reportes se guardan localmente y se envían cuando vuelve la conexión
- Acceso rápido con ícono en pantalla de inicio
- Experiencia similar a una app nativa

---

## 8. PREGUNTAS FRECUENTES

**¿Por qué mi reporte no aparece en las estadísticas?**
Los reportes de usuarios normales quedan en estado "Pendiente" hasta ser aprobados por un administrador. Una vez aprobados, se incluyen en todas las métricas y mapas.

**¿Con qué frecuencia se actualiza el Panel de Turno?**
Se actualiza automáticamente cada 30 segundos.

**¿Qué significa el semáforo de zonas en el Panel de Turno?**
Muestra los barrios con accidentes en las últimas 2 horas. Rojo = 3 o más accidentes, Amarillo = 2, Verde = 1.

**¿Cada cuánto se verifican las alertas por zona?**
El sistema verifica las alertas configuradas cada 5 minutos automáticamente.

**¿Cómo mejora la predicción de riesgo con el tiempo?**
El modelo de machine learning mejora cada vez que se entrena con más datos. Se recomienda entrenar el modelo periódicamente desde Dashboard → Métricas → Entrenar modelo ML.

**¿Se pueden recuperar accidentes eliminados?**
No. La eliminación es permanente. Se recomienda usar la opción "Rechazar" en lugar de eliminar cuando un reporte es incorrecto.

**¿Qué navegador debo usar?**
Se recomienda Google Chrome (versión 90 o superior). También funciona en Firefox y Edge.

---

*Manual de Usuario — CrashMap Cartagena v4.0 · Secretaría de Movilidad · Marzo 2026*
