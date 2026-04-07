# ENSAYO ACADÉMICO

## Tecnología e Inteligencia de Datos al Servicio de la Seguridad Vial:
## El Caso CrashMap Cartagena

---

**Autor:** Equipo de Desarrollo — Secretaría de Movilidad de Cartagena de Indias
**Fecha:** Marzo de 2026
**Área:** Tecnología, Movilidad Urbana y Seguridad Vial

---

## RESUMEN

La accidentalidad vial representa uno de los mayores desafíos de salud pública en Colombia y particularmente en ciudades con alta densidad vehicular como Cartagena de Indias. Este ensayo analiza cómo la implementación de CrashMap Cartagena, un sistema de gestión y análisis de accidentalidad vial basado en tecnologías web modernas, inteligencia artificial y análisis geoespacial, transforma la capacidad de respuesta institucional y mejora la toma de decisiones en materia de seguridad vial. Se examina el contexto problemático, los fundamentos tecnológicos del sistema, su impacto operativo y sus implicaciones para la política pública de movilidad.

**Palabras clave:** accidentalidad vial, sistemas de información geográfica, machine learning, gestión de incidentes, seguridad vial, Cartagena.

---

## 1. INTRODUCCIÓN

Según el Instituto Nacional de Medicina Legal y Ciencias Forenses, Colombia registra alrededor de 7.000 muertes anuales por accidentes de tránsito, con una tasa que supera los 14 fallecidos por cada 100.000 habitantes. Cartagena de Indias, como ciudad portuaria con un parque automotor en constante crecimiento y una estructura vial que en muchos sectores no ha evolucionado al mismo ritmo, presenta índices de siniestralidad que demandan atención urgente y sistemática.

Históricamente, la gestión de la accidentalidad en el país ha adolecido de un problema fundamental: la fragmentación y dispersión de los datos. Los reportes de accidentes se registraban en sistemas dispares, con formatos heterogéneos y sin capacidad de análisis en tiempo real. Esta situación impedía identificar patrones, detectar zonas críticas con oportunidad y evaluar el impacto real de las intervenciones viales.

CrashMap Cartagena surge como respuesta directa a esta problemática, proponiendo un modelo integrado de gestión de la información vial que combina las capacidades del análisis de datos masivos, la inteligencia geoespacial y el machine learning, al servicio de la toma de decisiones institucional.

---

## 2. CONTEXTO: LA ACCIDENTALIDAD VIAL COMO PROBLEMA DE DATOS

Antes de abordar la solución tecnológica, es necesario comprender por qué la accidentalidad vial es, en su raíz, un problema de datos.

Cada accidente de tránsito es el resultado de la convergencia de múltiples factores: las condiciones de la infraestructura vial, el comportamiento humano, las condiciones climáticas, la hora del día, el tipo de vehículo involucrado y el estado de la señalización, entre otros. Ninguno de estos factores actúa de forma aislada; es su interacción lo que genera o previene los siniestros.

Esta naturaleza multidimensional del problema exige herramientas capaces de capturar, correlacionar y visualizar simultáneamente múltiples variables sobre un territorio. Los sistemas tradicionales de registro —planillas, informes policiales, bases de datos sin cruce— son incapaces de revelar estas interacciones de forma oportuna.

La teoría de la "epidemiología vial", desarrollada a partir de los trabajos de William Haddon Jr. en la década de 1970, propone tratar los accidentes de tránsito como eventos epidémicos que pueden analizarse y prevenirse mediante el mismo enfoque utilizado para las enfermedades infecciosas: identificar el agente, el huésped y el ambiente, y actuar sobre los factores modificables. Esta perspectiva requiere, inevitablemente, datos precisos, georreferenciados y analizables en escala.

---

## 3. FUNDAMENTOS TECNOLÓGICOS DE CRASHMAP CARTAGENA

CrashMap Cartagena integra un conjunto de tecnologías que, aunque individualmente disponibles, raramente se articulan de forma cohesionada en el sector público colombiano.

### 3.1 Análisis Geoespacial con Mapas de Calor

La visualización cartográfica de los accidentes mediante mapas de calor (heatmaps) permite identificar concentraciones geográficas que serían invisibles en una tabla de datos convencional. El sistema implementa un mapa de calor ponderado por gravedad, asignando mayor peso a los accidentes fatales (1.0) que a los graves (0.7) y leves (0.4), lo que produce una representación que refleja no solo la frecuencia sino también la severidad de los eventos.

Esta diferenciación es conceptualmente importante: no es lo mismo una zona con muchos accidentes leves —que puede indicar un problema de señalización o de flujo vial— que una zona con pocos pero mortales accidentes, que puede señalar un problema de velocidad o de diseño de infraestructura.

### 3.2 Identificación de Puntos Negros mediante Clustering

El módulo de Puntos Negros aplica el algoritmo KMeans de aprendizaje automático no supervisado para identificar clusters geográficos de alta concentración de accidentes. A diferencia de los métodos tradicionales de identificación de puntos negros —basados en umbrales fijos de número de accidentes— el clustering permite descubrir patrones espaciales emergentes sin necesidad de definir previamente las zonas de análisis.

El resultado es un ranking dinámico de los puntos más peligrosos, acompañado de un sistema de seguimiento del estado de las intervenciones (sin intervenir, en proceso, intervenido), que permite cerrar el ciclo de gestión: identificar el problema, intervenir y verificar el impacto.

### 3.3 Predicción de Riesgo con Machine Learning

Quizás la componente más innovadora del sistema es el módulo de predicción de riesgo, que combina un modelo de red neuronal (PyTorch) con datos de densidad histórica para generar proyecciones de las zonas de mayor riesgo según el día de la semana y la franja horaria.

El modelo procesa variables como la hora del día, el día de la semana, las condiciones climáticas históricas, los patrones de tráfico en hora pico y la ubicación geográfica para producir un índice de riesgo combinado por barrio. Aunque el modelo mejora su precisión a medida que se entrena con más datos reales, su valor no radica únicamente en la exactitud estadística sino en cambiar el enfoque de la gestión vial: pasar de la reacción al evento ya ocurrido hacia la anticipación del riesgo.

Esta transición —del paradigma reactivo al predictivo— es uno de los grandes saltos conceptuales que la tecnología permite en la gestión pública de la seguridad vial.

### 3.4 Gestión de Incidentes en Tiempo Real

El módulo de Gestión de Incidentes introduce el concepto de SLA (Service Level Agreement) en la respuesta institucional a los accidentes. Establecer un tiempo máximo de atención —y hacer visible en tiempo real el cumplimiento o incumplimiento de ese compromiso— genera una presión positiva sobre la eficiencia operativa y permite medir el desempeño de los equipos de respuesta.

La integración con Twilio para notificaciones automáticas por WhatsApp cuando se cierra un incidente o cuando se vence un SLA, responde a la realidad comunicacional colombiana: WhatsApp es el canal de comunicación institucional de facto en la mayoría de organismos públicos y de emergencias.

---

## 4. IMPACTO EN LA GESTIÓN INSTITUCIONAL

La implementación de CrashMap tiene implicaciones que van más allá de la herramienta tecnológica en sí misma. Transforma fundamentalmente la forma en que la Secretaría de Movilidad produce conocimiento y toma decisiones.

### 4.1 De la Intuición a la Evidencia

Antes del sistema, las decisiones sobre dónde instalar semáforos, señales preventivas o reductores de velocidad se tomaban frecuentemente con base en la percepción subjetiva de funcionarios o en la presión de comunidades. CrashMap proporciona evidencia cuantitativa que objetiva estas decisiones: el ranking de puntos negros, los mapas de calor y los comparativos interanuales producen argumentos técnicos para la asignación de recursos de infraestructura vial.

### 4.2 Rendición de Cuentas y Seguimiento

El módulo de Comparativo Interanual introduce una herramienta de evaluación de política pública: la capacidad de medir si las intervenciones realizadas en determinadas zonas produjeron una reducción efectiva de la accidentalidad. Esta capacidad de evaluación de impacto es fundamental para la legitimidad institucional y para el aprendizaje organizacional.

### 4.3 Participación Ciudadana

El componente de reporte ciudadano —incluyendo la aplicación móvil PWA instalable en cualquier teléfono inteligente— democratiza la producción de datos sobre accidentalidad. Los agentes de tránsito, policías de movilidad y ciudadanos en general se convierten en nodos de captura de información, ampliando la cobertura y la oportunidad del registro.

Este modelo de producción colaborativa de datos, conocido en la literatura como "crowdsourcing" o participación ciudadana en ciencia abierta (citizen science), no solo mejora la calidad del dato sino que genera un sentido de corresponsabilidad social con la seguridad vial.

### 4.4 Operaciones en Tiempo Real

El Panel de Turno, diseñado específicamente para ser proyectado en salas de control, transforma la cultura operativa de los centros de monitoreo de tránsito. La visibilidad en tiempo real de incidentes, semáforos de zonas y SLA activos obliga a un ritmo de respuesta institucional diferente al que es posible con reportes periódicos o llamadas telefónicas.

---

## 5. LIMITACIONES Y DESAFÍOS

Un análisis honesto del sistema debe reconocer también sus limitaciones y los desafíos de implementación.

### 5.1 Calidad del Dato

La efectividad de cualquier sistema de análisis es proporcional a la calidad de los datos que procesa. Si los registros son incompletos, imprecisos en la georreferenciación o tardíos, los análisis resultantes serán igualmente deficientes. La implementación de CrashMap requiere, necesariamente, un proceso paralelo de fortalecimiento de los procesos de captura y registro de información.

### 5.2 Adopción Institucional

La tecnología por sí sola no transforma las organizaciones. La adopción efectiva de CrashMap exige procesos de capacitación, cambio cultural y liderazgo institucional que soporten la transición hacia una gestión basada en datos. Sin estos procesos, el sistema corre el riesgo de convertirse en una herramienta subutilizada.

### 5.3 El Modelo ML Requiere Datos Suficientes

El modelo de predicción de riesgo basado en PyTorch necesita un volumen mínimo de datos históricos para producir predicciones confiables. En las etapas iniciales de implementación, las predicciones tienen un componente aleatorio significativo que debe ser comunicado claramente a los usuarios para evitar decisiones basadas en proyecciones poco confiables.

### 5.4 Conectividad y Brecha Digital

La dependencia del sistema de conectividad a internet (para la visualización de mapas, el envío de reportes y las notificaciones) puede representar una barrera en zonas con cobertura limitada. La funcionalidad PWA offline mitiga parcialmente este problema, pero no lo elimina completamente.

---

## 6. REFLEXIÓN FINAL: TECNOLOGÍA AL SERVICIO DE LA VIDA

La accidentalidad vial no es simplemente una estadística. Detrás de cada número hay una vida truncada, una familia fracturada, una comunidad afectada. La urgencia moral de reducir estos números justifica plenamente la inversión en herramientas que mejoren la capacidad institucional de prevenir y responder a los siniestros viales.

CrashMap Cartagena no es una solución mágica ni un sustituto de la voluntad política y la inversión en infraestructura vial segura. Es, en cambio, un multiplicador de capacidades: hace más eficiente la toma de decisiones, más oportuna la respuesta operativa, más objetiva la asignación de recursos y más visible el impacto de las intervenciones.

En un país donde los recursos públicos son escasos y la demanda de inversión vial es enorme, herramientas que permitan priorizar con base en evidencia no son un lujo tecnológico sino una necesidad de gestión responsable.

El camino hacia una Cartagena con menos accidentes y menos víctimas fatales en sus vías pasa, necesariamente, por conocer mejor el problema. CrashMap es un paso en esa dirección.

---

## REFERENCIAS BIBLIOGRÁFICAS

- Haddon, W. Jr. (1972). A logical framework for categorizing highway safety phenomena and activity. *Journal of Trauma*, 12(3), 193-207.
- Instituto Nacional de Medicina Legal y Ciencias Forenses. (2025). *Forensis: Datos para la vida*. Bogotá: INMLCF.
- Ministerio de Transporte de Colombia. (2022). *Plan Nacional de Seguridad Vial 2021-2030*. Bogotá.
- World Health Organization. (2023). *Global Status Report on Road Safety*. Geneva: WHO.
- Goodfellow, I., Bengio, Y., & Courville, A. (2016). *Deep Learning*. MIT Press.
- Organización Panamericana de la Salud. (2019). *Seguridad vial en las Américas*. Washington: OPS.

---

*Ensayo académico — CrashMap Cartagena · Secretaría de Movilidad · Marzo 2026*
