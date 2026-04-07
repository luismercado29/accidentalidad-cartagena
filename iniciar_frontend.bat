@echo off
title CrashMap - Frontend React
color 0B
echo.
echo  =========================================
echo   CrashMap Cartagena ^| Frontend React
echo  =========================================
echo.
echo  URL: http://localhost:3000
echo.

cd /d "%~dp0frontend"

:: Verificar si node_modules existe
if not exist "node_modules" (
    echo  [AVISO] node_modules no encontrado. Instalando dependencias...
    echo.
    npm install
    echo.
)

:: Verificar si el puerto 3000 ya esta en uso
netstat -an | find "3000" | find "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo  [AVISO] El puerto 3000 ya esta en uso.
    echo  El frontend puede estar corriendo ya.
    echo.
)

npm start

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] No se pudo iniciar el frontend.
    echo  Asegurate de tener Node.js instalado y ejecuta: npm install
    echo.
)
pause
