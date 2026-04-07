-- ================================================
-- SCRIPT DE ACTUALIZACIÓN DE BASE DE DATOS
-- Sistema de Accidentalidad Cartagena v2.0
-- ================================================

-- 1. Agregar columna 'estado' a la tabla accidentes
ALTER TABLE accidentes 
ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'aprobado';

-- 2. Actualizar registros existentes (todos como aprobados)
UPDATE accidentes 
SET estado = 'aprobado' 
WHERE estado IS NULL;

-- 3. Crear índice para mejorar consultas por estado
CREATE INDEX IF NOT EXISTS idx_accidentes_estado 
ON accidentes(estado);

-- 4. Verificar la estructura actualizada
SELECT 
    column_name, 
    data_type, 
    column_default
FROM information_schema.columns
WHERE table_name = 'accidentes';

-- 5. Verificar datos
SELECT 
    COUNT(*) as total_accidentes,
    SUM(CASE WHEN estado = 'aprobado' THEN 1 ELSE 0 END) as aprobados,
    SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) as pendientes,
    SUM(CASE WHEN estado = 'rechazado' THEN 1 ELSE 0 END) as rechazados
FROM accidentes;

-- ================================================
-- CONSULTAS ÚTILES PARA ADMINISTRACIÓN
-- ================================================

-- Ver todos los reportes pendientes
SELECT 
    id,
    latitud,
    longitud,
    fecha_hora,
    gravedad,
    tipo_vehiculo,
    estado,
    created_at
FROM accidentes
WHERE estado = 'pendiente'
ORDER BY created_at DESC;

-- Ver estadísticas por estado
SELECT 
    estado,
    COUNT(*) as cantidad,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM accidentes), 2) as porcentaje
FROM accidentes
GROUP BY estado;

-- Ver accidentes por gravedad (solo aprobados)
SELECT 
    gravedad,
    COUNT(*) as cantidad
FROM accidentes
WHERE estado = 'aprobado'
GROUP BY gravedad;

-- Ver reportes recientes (últimas 24 horas)
SELECT 
    id,
    fecha_hora,
    gravedad,
    estado,
    created_at
FROM accidentes
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- ================================================
-- DATOS DE PRUEBA (OPCIONAL)
-- ================================================

-- Insertar algunos accidentes de prueba con diferentes estados
INSERT INTO accidentes (
    latitud, 
    longitud, 
    fecha_hora, 
    gravedad, 
    tipo_vehiculo, 
    clima, 
    estado_via, 
    dia_festivo, 
    hora_pico, 
    descripcion,
    estado
) VALUES 
-- Accidentes aprobados
(10.3910, -75.4794, '2025-10-15 08:30:00', 'leve', 'automovil', 'soleado', 'bueno', false, true, 'Choque menor en intersección', 'aprobado'),
(10.4236, -75.5478, '2025-10-16 14:20:00', 'grave', 'moto', 'lluvia', 'regular', false, false, 'Accidente con heridos', 'aprobado'),
(10.3977, -75.5515, '2025-10-17 19:45:00', 'fatal', 'bus', 'nublado', 'malo', false, true, 'Accidente fatal en vía principal', 'aprobado'),

-- Reportes pendientes (simulando reportes de usuarios)
(10.4089, -75.5236, '2025-10-20 10:15:00', 'leve', 'automovil', 'soleado', 'bueno', false, false, 'Reporte de usuario - choque leve', 'pendiente'),
(10.4424, -75.5130, '2025-10-21 16:30:00', 'grave', 'camion', 'lluvia', 'regular', false, true, 'Reporte de usuario - camión volcado', 'pendiente'),

-- Reportes rechazados
(10.4000, -75.5000, '2025-10-18 12:00:00', 'leve', 'bicicleta', 'soleado', 'bueno', false, false, 'Reporte duplicado o incorrecto', 'rechazado');

-- ================================================
-- RESPALDO Y RESTAURACIÓN
-- ================================================

-- Crear respaldo de la tabla antes de modificaciones
CREATE TABLE accidentes_backup AS 
SELECT * FROM accidentes;

-- Restaurar desde respaldo (si es necesario)
-- TRUNCATE accidentes;
-- INSERT INTO accidentes SELECT * FROM accidentes_backup;

-- ================================================
-- LIMPIEZA (Usar con precaución)
-- ================================================

-- Eliminar todos los reportes pendientes (CUIDADO)
-- DELETE FROM accidentes WHERE estado = 'pendiente';

-- Eliminar todos los reportes rechazados
-- DELETE FROM accidentes WHERE estado = 'rechazado';

-- Aprobar todos los reportes pendientes
-- UPDATE accidentes SET estado = 'aprobado' WHERE estado = 'pendiente';

-- ================================================
-- ESTADÍSTICAS AVANZADAS
-- ================================================

-- Resumen completo de accidentes
SELECT 
    'Total General' as categoria,
    COUNT(*) as cantidad
FROM accidentes
UNION ALL
SELECT 
    CONCAT('Estado: ', estado) as categoria,
    COUNT(*) as cantidad
FROM accidentes
GROUP BY estado
UNION ALL
SELECT 
    CONCAT('Gravedad: ', gravedad, ' (aprobados)') as categoria,
    COUNT(*) as cantidad
FROM accidentes
WHERE estado = 'aprobado'
GROUP BY gravedad
UNION ALL
SELECT 
    CONCAT('Clima: ', clima, ' (aprobados)') as categoria,
    COUNT(*) as cantidad
FROM accidentes
WHERE estado = 'aprobado'
GROUP BY clima
ORDER BY categoria;

-- Accidentes por mes (solo aprobados)
SELECT 
    TO_CHAR(fecha_hora, 'YYYY-MM') as mes,
    COUNT(*) as cantidad_accidentes,
    SUM(CASE WHEN gravedad = 'fatal' THEN 1 ELSE 0 END) as fatales,
    SUM(CASE WHEN gravedad = 'grave' THEN 1 ELSE 0 END) as graves,
    SUM(CASE WHEN gravedad = 'leve' THEN 1 ELSE 0 END) as leves
FROM accidentes
WHERE estado = 'aprobado'
GROUP BY mes
ORDER BY mes DESC;

-- ================================================
-- MANTENIMIENTO
-- ================================================

-- Reindexar tabla
REINDEX TABLE accidentes;

-- Analizar tabla para optimizar consultas
ANALYZE accidentes;

-- Vaciar tabla (mantener estructura)
-- TRUNCATE TABLE accidentes RESTART IDENTITY;

COMMIT;

-- ================================================
-- VERIFICACIÓN FINAL
-- ================================================

SELECT 'Actualización completada exitosamente' as mensaje;
SELECT COUNT(*) as total_registros FROM accidentes;
SELECT COUNT(DISTINCT estado) as estados_diferentes FROM accidentes;
