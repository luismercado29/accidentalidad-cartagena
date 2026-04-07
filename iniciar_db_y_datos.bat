@echo off
title CrashMap - Configurar Base de Datos (SQLite)
color 0E
echo.
echo  =========================================
echo   CrashMap Cartagena ^| Setup Base de Datos
echo  =========================================
echo.
echo  Este script crea la base de datos SQLite y carga
echo  los datos reales de accidentalidad de Cartagena.
echo.
echo  Base de datos: backend\accidentes.db  (SQLite - no requiere servidor)
echo.
pause

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

:: Verificar que existe setup_database.py
if not exist "setup_database.py" (
    echo  [ERROR] No se encontro setup_database.py en la carpeta backend\
    echo.
    pause
    exit /b 1
)

echo  Configurando base de datos y cargando datos...
echo.
%PYTHON_CMD% setup_database.py

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Ocurrio un error al configurar la base de datos.
    echo  Revisa que todas las dependencias esten instaladas:
    echo    pip install -r requirements.txt
    echo.
) else (
    echo.
    echo  =========================================
    echo   Base de datos configurada correctamente
    echo  =========================================
    echo.
    echo  Ahora puedes iniciar el backend y el frontend.
    echo.
)
pause
