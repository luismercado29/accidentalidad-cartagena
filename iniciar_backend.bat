@echo off
title CrashMap - Backend API
color 0A
echo.
echo  =========================================
echo   CrashMap Cartagena ^| Backend FastAPI
echo  =========================================
echo.
echo  URL:  http://localhost:8000
echo  Docs: http://localhost:8000/docs
echo.

cd /d "%~dp0backend"

:: Seleccionar Python
set PYTHON_CMD=
if exist "C:\Python314\python.exe" (
    set PYTHON_CMD=C:\Python314\python.exe
    echo  Python encontrado: C:\Python314\python.exe
) else (
    set PYTHON_CMD=python
    echo  Usando Python del PATH del sistema
)
echo.

:: Instalar dependencias si falta alguna clave
echo  Verificando dependencias...
%PYTHON_CMD% -c "import fastapi, uvicorn, sqlalchemy, jose, passlib" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [AVISO] Instalando dependencias base...
    %PYTHON_CMD% -m pip install -r requirements.txt
    echo.
)

:: Verificar si el puerto 8000 ya esta en uso
netstat -an | find "8000" | find "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo  [AVISO] El puerto 8000 ya esta en uso.
    echo  El backend puede estar corriendo. Presiona Ctrl+C para salir.
    echo.
)

echo  Iniciando servidor...
echo.
%PYTHON_CMD% -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] No se pudo iniciar el backend.
    echo.
    echo  Si es la primera vez, ejecuta este comando en la carpeta backend\:
    echo    pip install -r requirements.txt
    echo.
    echo  Dependencias opcionales (IA/ML):
    echo    pip install torch shapely scikit-learn anthropic reportlab
    echo.
)
pause
