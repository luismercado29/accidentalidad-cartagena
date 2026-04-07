# MANUAL DE API REST
## CrashMap Cartagena — Referencia de Endpoints
### Versión 4.0 · Marzo 2026

---

**URL Base:** `http://localhost:8000`
**Documentación interactiva:** `http://localhost:8000/docs` (Swagger UI)
**Formato de respuesta:** JSON
**Autenticación:** Bearer Token (JWT)

---

## AUTENTICACIÓN

La mayoría de endpoints requieren un token JWT en el header:

```
Authorization: Bearer <access_token>
```

### Obtener token

**POST** `/api/auth/login`

Request:
```json
{
  "username": "admin",
  "password": "1234"
}
```

Response `200 OK`:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "es_admin": true,
  "username": "admin"
}
```

Errores:
- `401` — Credenciales incorrectas

---

### Registrar usuario

**POST** `/api/auth/register`

Request:
```json
{
  "username": "nuevo_usuario",
  "password": "contraseña123"
}
```

Response `201 Created`:
```json
{
  "id": 5,
  "username": "nuevo_usuario",
  "es_admin": false
}
```

> Los nuevos registros SIEMPRE crean usuarios normales (`es_admin: false`).

---

## ACCIDENTES

### Listar accidentes

**GET** `/api/accidentes`

Headers: `Authorization: Bearer <token>`

Query params opcionales:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `barrio` | string | Filtrar por barrio |
| `gravedad` | string | fatal / grave / leve |
| `anio` | integer | Año del accidente |
| `mes` | integer | Mes (1-12) |

Response `200 OK`:
```json
[
  {
    "id": 1,
    "latitud": 10.3912,
    "longitud": -75.4821,
    "barrio": "Bocagrande",
    "fecha_hora": "2025-03-15T08:30:00",
    "gravedad": "grave",
    "tipo_vehiculo": "moto",
    "clima": "soleado",
    "estado_via": "bueno",
    "dia_festivo": false,
    "hora_pico": true,
    "descripcion": "Colisión en intersección",
    "estado": "aprobado",
    "fuente": "manual",
    "created_at": "2025-03-15T09:00:00"
  }
]
```

---

### Crear accidente (admin)

**POST** `/api/accidentes`

Headers: `Authorization: Bearer <token>` (admin)

Request:
```json
{
  "latitud": 10.3912,
  "longitud": -75.4821,
  "barrio": "Bocagrande",
  "fecha_hora": "2025-03-15T08:30:00",
  "gravedad": "grave",
  "tipo_vehiculo": "moto",
  "clima": "soleado",
  "estado_via": "bueno",
  "dia_festivo": false,
  "hora_pico": true,
  "descripcion": "Descripción del accidente"
}
```

Response `201 Created`: objeto del accidente creado

---

### Reportar accidente (usuario normal)

**POST** `/api/reportes/ciudadano`

Headers: `Authorization: Bearer <token>`

Request: misma estructura que crear accidente

Response `201 Created`:
```json
{
  "id": 25,
  "estado": "pendiente",
  "mensaje": "Reporte enviado. Pendiente de revisión."
}
```

> Los reportes ciudadanos quedan en estado `pendiente` hasta ser aprobados.

---

### Obtener accidente por ID

**GET** `/api/accidentes/{id}`

Response `200 OK`: objeto del accidente

---

### Actualizar accidente

**PUT** `/api/accidentes/{id}`

Headers: `Authorization: Bearer <token>` (admin)

Request: campos a actualizar (parcial)

Response `200 OK`: objeto actualizado

---

### Eliminar accidente

**DELETE** `/api/accidentes/{id}`

Headers: `Authorization: Bearer <token>` (admin)

Response `200 OK`:
```json
{ "mensaje": "Accidente eliminado" }
```

---

### Obtener reportes pendientes

**GET** `/api/reportes/pendientes`

Headers: `Authorization: Bearer <token>` (admin)

Response: lista de accidentes con `estado = "pendiente"`

---

### Aprobar reporte

**POST** `/api/reportes/{id}/aprobar`

Headers: `Authorization: Bearer <token>` (admin)

Response `200 OK`:
```json
{ "mensaje": "Reporte aprobado" }
```

---

### Rechazar reporte

**POST** `/api/reportes/{id}/rechazar`

Headers: `Authorization: Bearer <token>` (admin)

Response `200 OK`:
```json
{ "mensaje": "Reporte rechazado" }
```

---

## MÉTRICAS Y ESTADÍSTICAS

### Dashboard principal

**GET** `/api/metricas/dashboard`

Headers: `Authorization: Bearer <token>`

Response `200 OK`:
```json
{
  "total": 1250,
  "fatales": 45,
  "graves": 320,
  "leves": 885,
  "este_mes": 78,
  "hoy": 3
}
```

---

### Tendencia mensual

**GET** `/api/metricas/tendencia-mensual`

Response:
```json
[
  { "mes": "Ene 2025", "total": 85, "fatales": 3, "graves": 22 },
  { "mes": "Feb 2025", "total": 72, "fatales": 2, "graves": 18 }
]
```

---

### Accidentes por hora

**GET** `/api/metricas/por-hora`

Response:
```json
[
  { "hora": 0, "total": 12 },
  { "hora": 7, "total": 89 },
  { "hora": 8, "total": 102 }
]
```

---

### Accidentes por barrio

**GET** `/api/metricas/por-barrio`

Response:
```json
[
  { "barrio": "Bocagrande", "total": 145 },
  { "barrio": "El Centro", "total": 132 }
]
```

---

### Estadísticas completas

**GET** `/api/metricas/estadisticas`

Response: objeto con distribución por gravedad, tipo de vehículo, clima, estado de vía, correlaciones

---

### Comparativo interanual

**GET** `/api/metricas/comparativo-interanual?anio1=2024&anio2=2025`

Response:
```json
{
  "anio1": 2024,
  "anio2": 2025,
  "totales": { "2024": 980, "2025": 1050 },
  "variacion_anual_pct": 7.1,
  "tendencia": "aumento",
  "labels": ["Enero", "Febrero", ...],
  "series": [
    {
      "mes": "Enero",
      "2024": 75,
      "2024_fatales": 2,
      "2025": 82,
      "2025_fatales": 3,
      "variacion_pct": 9.3
    }
  ]
}
```

---

## INCIDENTES ACTIVOS

### Listar incidentes activos

**GET** `/api/incidentes`

Headers: `Authorization: Bearer <token>` (admin)

Response:
```json
[
  {
    "id": 1,
    "tipo": "Colisión múltiple",
    "descripcion": "Choque en semáforo",
    "estado": "en_atencion",
    "sla_minutos": 30,
    "operario": "Juan Pérez",
    "created_at": "2025-03-17T14:30:00",
    "minutos_transcurridos": 12,
    "vencido": false
  }
]
```

---

### Crear incidente

**POST** `/api/incidentes`

Headers: `Authorization: Bearer <token>` (admin)

Request:
```json
{
  "tipo": "Accidente con heridos",
  "descripcion": "Moto vs carro en Av. Pedro de Heredia",
  "gravedad": "grave",
  "barrio": "El Cabrero",
  "sla_minutos": 30
}
```

Response `201 Created`: objeto del incidente

---

### Marcar en atención

**PUT** `/api/incidentes/{id}/en-atencion`

Request:
```json
{ "operario": "Nombre del operario" }
```

Response `200 OK`: objeto actualizado

---

### Cerrar incidente

**PUT** `/api/incidentes/{id}/cerrar`

Request:
```json
{ "notas_cierre": "Incidente atendido. Vía despejada." }
```

Response `200 OK`:
```json
{
  "id": 1,
  "estado": "cerrado",
  "whatsapp_enviado": true
}
```

> Al cerrar, se envía automáticamente una notificación WhatsApp al supervisor si Twilio está configurado.

---

### Historial de incidentes

**GET** `/api/incidentes/historial`

Response: lista de incidentes cerrados con métricas de SLA

---

## PANEL DE TURNO

### Datos del panel (público, sin auth)

**GET** `/api/panel-turno/datos`

Response:
```json
{
  "timestamp": "2025-03-17T15:00:00",
  "kpis": {
    "total_hoy": 8,
    "fatales_hoy": 0,
    "graves_hoy": 2,
    "incidentes_activos": 3,
    "incidentes_vencidos": 1
  },
  "puntos_activos": [
    {
      "lat": 10.3912,
      "lng": -75.4821,
      "barrio": "Bocagrande",
      "gravedad": "grave",
      "descripcion": "Colisión",
      "hace_min": 45
    }
  ],
  "semaforo_zonas": [
    { "barrio": "Bocagrande", "accidentes_2h": 3, "nivel": "rojo" },
    { "barrio": "El Centro",  "accidentes_2h": 1, "nivel": "verde" }
  ],
  "incidentes_activos": [
    { "id": 1, "estado": "en_atencion", "minutos": 12, "sla": 30, "vencido": false }
  ]
}
```

---

## ALERTAS POR ZONA

### Listar configuraciones de alertas

**GET** `/api/alertas/config`

Headers: `Authorization: Bearer <token>` (admin)

Response: lista de configuraciones de alertas

---

### Crear alerta

**POST** `/api/alertas/config`

Request:
```json
{
  "nombre": "Alerta Bocagrande",
  "lat": 10.3950,
  "lng": -75.5500,
  "radio_km": 1.5,
  "max_accidentes": 3,
  "ventana_minutos": 60,
  "email_alerta": "supervisor@movilidad.gov.co"
}
```

---

### Activar/Desactivar alerta

**PUT** `/api/alertas/config/{id}`

Request:
```json
{ "activa": false }
```

---

### Eliminar alerta

**DELETE** `/api/alertas/config/{id}`

---

### Verificar alertas manualmente

**POST** `/api/alertas/verificar`

Dispara la verificación de todas las alertas activas manualmente.

---

## INFORMES

### Descargar informe PDF mensual

**GET** `/api/informes/pdf-mensual?anio=2025&mes=3`

Headers: `Authorization: Bearer <token>` (admin)

Response: archivo PDF (streaming)
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="informe_2025_03.pdf"
```

---

## PUNTOS NEGROS

### Listar puntos negros

**GET** `/api/puntos-negros`

Headers: `Authorization: Bearer <token>`

Response:
```json
[
  {
    "id": 1,
    "nombre": "Cluster zona 1",
    "lat": 10.3912,
    "lng": -75.4821,
    "barrio": "Bocagrande",
    "total_accidentes": 45,
    "fatales": 3,
    "score_peligro": 0.87,
    "ranking": 1,
    "estado_intervencion": "sin_intervenir",
    "notas": null,
    "foto_url": null
  }
]
```

---

### Sincronizar (recalcular) puntos negros

**POST** `/api/puntos-negros/sincronizar`

Headers: `Authorization: Bearer <token>` (admin)

Response:
```json
{ "sincronizados": 18, "mensaje": "Puntos negros calculados exitosamente" }
```

---

### Actualizar estado de intervención

**PUT** `/api/puntos-negros/{id}/estado`

Request:
```json
{
  "estado_intervencion": "intervenido",
  "notas": "Semáforo instalado. Obra finalizada Marzo 2025."
}
```

Valores válidos para `estado_intervencion`:
- `sin_intervenir`
- `en_proceso`
- `intervenido`

---

### Subir foto de intervención

**POST** `/api/puntos-negros/{id}/foto`

Headers: `Authorization: Bearer <token>` (admin)

Body: `multipart/form-data`
```
foto: <archivo imagen>
```

Response:
```json
{ "foto_url": "/uploads/punto_negro_1_foto.jpg" }
```

---

## CÁMARAS DE TRÁNSITO

### Listar cámaras

**GET** `/api/camaras`

Response:
```json
[
  {
    "id": 1,
    "nombre": "Cámara Bocagrande 1",
    "lat": 10.3950,
    "lng": -75.5490,
    "url_stream": "http://192.168.1.10:8080/video",
    "descripcion": "Intersección Av. del Retorno con Cra. 1",
    "activa": true
  }
]
```

---

### Crear cámara

**POST** `/api/camaras`

Headers: `Authorization: Bearer <token>` (admin)

Request:
```json
{
  "nombre": "Cámara Centro 1",
  "lat": 10.4235,
  "lng": -75.5500,
  "url_stream": "http://192.168.1.20:8080/video",
  "descripcion": "Calle Larga con Av. Venezuela"
}
```

---

### Actualizar cámara

**PUT** `/api/camaras/{id}`

---

### Eliminar cámara

**DELETE** `/api/camaras/{id}`

---

### Cámara más cercana

**GET** `/api/camaras/cercana?lat=10.391&lng=-75.479`

Response: objeto de la cámara más cercana a las coordenadas dadas

---

## PREDICCIÓN DE RIESGO

### Mapa de calor predictivo

**GET** `/api/predicciones/mapa-calor-predictivo?dia_semana=1&hora_inicio=7&hora_fin=9`

Parámetros:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `dia_semana` | integer | 0=Lunes, 1=Martes, ..., 6=Domingo |
| `hora_inicio` | integer | Hora de inicio (0-23) |
| `hora_fin` | integer | Hora de fin (0-23) |

Response:
```json
{
  "dia_nombre": "Martes",
  "hora_inicio": 7,
  "hora_fin": 9,
  "total_historicos": 145,
  "modelo_entrenado": true,
  "puntos_historicos": [
    { "lat": 10.3912, "lng": -75.4821 }
  ],
  "predicciones_por_barrio": [
    {
      "barrio": "Bocagrande",
      "lat": 10.3950,
      "lng": -75.5490,
      "densidad_historica": 45,
      "riesgo_ml": 0.82,
      "riesgo_combinado": 0.78,
      "nivel": "alto"
    }
  ]
}
```

Niveles de riesgo:
- `alto`: riesgo_combinado >= 0.6
- `medio`: riesgo_combinado >= 0.3
- `bajo`: riesgo_combinado < 0.3

---

## MACHINE LEARNING

### Entrenar modelo

**POST** `/api/ml/entrenar`

Headers: `Authorization: Bearer <token>` (admin)

Response:
```json
{
  "mensaje": "Modelo entrenado exitosamente",
  "accuracy": 0.847,
  "registros_entrenamiento": 1150
}
```

---

### Estado del modelo

**GET** `/api/ml/estado`

Response:
```json
{
  "entrenado": true,
  "registros": 1150,
  "ultima_actualizacion": "2025-03-15T10:30:00"
}
```

---

## NOTIFICACIONES

### Obtener notificaciones

**GET** `/api/notificaciones`

Headers: `Authorization: Bearer <token>`

Response: lista de notificaciones del usuario

---

### Contador de no leídas

**GET** `/api/notificaciones/no-leidas`

Response:
```json
{ "count": 5 }
```

---

### Marcar todas como leídas

**POST** `/api/notificaciones/marcar-leidas`

Response `200 OK`

---

## WEBSOCKET

### Conexión en tiempo real

**WS** `/ws/notificaciones`

Headers: requiere token de autenticación

Mensajes recibidos:
```json
{ "tipo": "nuevo_accidente", "barrio": "Bocagrande" }
{ "tipo": "reporte_aprobado", "id": 25 }
{ "tipo": "incidente_creado", "id": 8 }
```

---

## CÓDIGOS DE ESTADO HTTP

| Código | Significado |
|--------|-------------|
| `200` | Éxito |
| `201` | Recurso creado |
| `400` | Error en los datos enviados |
| `401` | No autenticado (token inválido o expirado) |
| `403` | Sin permisos (se requiere admin) |
| `404` | Recurso no encontrado |
| `422` | Error de validación (campos faltantes o tipo incorrecto) |
| `500` | Error interno del servidor |

---

## ESTRUCTURA DE ERRORES

Todos los errores siguen este formato:

```json
{
  "detail": "Descripción del error"
}
```

---

*Manual de API — CrashMap Cartagena v4.0 · Marzo 2026*
