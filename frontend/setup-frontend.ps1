# Script para configurar el frontend completo
Write-Host "🚀 Configurando Frontend - Accidentalidad Cartagena" -ForegroundColor Cyan
Write-Host ""

# Crear estructura de carpetas
Write-Host "📁 Creando estructura de carpetas..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "public" | Out-Null
New-Item -ItemType Directory -Force -Path "src" | Out-Null
New-Item -ItemType Directory -Force -Path "src\components" | Out-Null

# Crear index.html
Write-Host "📄 Creando public/index.html..." -ForegroundColor Yellow
$indexHtml = @'
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#667eea" />
    <meta name="description" content="Sistema de Análisis de Accidentalidad - Cartagena" />
    <title>Accidentalidad Cartagena</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" 
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  </head>
  <body>
    <noscript>Necesitas habilitar JavaScript para usar esta aplicación.</noscript>
    <div id="root"></div>
  </body>
</html>
'@
$indexHtml | Out-File -FilePath "public\index.html" -Encoding UTF8

# Crear index.js
Write-Host "📄 Creando src/index.js..." -ForegroundColor Yellow
$indexJs = @'
import React from 'react';
import ReactDOM from 'react-dom/client';
import './App.css';
import App from './App';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
'@
$indexJs | Out-File -FilePath "src\index.js" -Encoding UTF8

Write-Host ""
Write-Host "✅ Estructura creada exitosamente!" -ForegroundColor Green
Write-Host ""
Write-Host "📦 Instalando dependencias..." -ForegroundColor Yellow
npm install

Write-Host ""
Write-Host "✅ ¡Configuración completada!" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Para iniciar el frontend ejecuta:" -ForegroundColor Cyan
Write-Host "   npm start" -ForegroundColor White
Write-Host ""