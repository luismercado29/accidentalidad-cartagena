@echo off
title CrashMap - Instalar Dependencias
color 0B
echo.
echo  =========================================
echo   CrashMap Cartagena ^| Instalador
echo  =========================================
echo.

:: Seleccionar Python
set PYTHON_CMD=
if exist "C:\Python314\python.exe" (
    set PYTHON_CMD=C:\Python314\python.exe
    echo  Python: C:\Python314\python.exe
) else (
    set PYTHON_CMD=python
    echo  Python: del PATH del sistema
)
echo.

cd /d "%~dp0backend"

echo  [1/3] Instalando dependencias base del backend...
%PYTHON_CMD% -m pip install fastapi uvicorn[standard] sqlalchemy python-multipart
%PYTHON_CMD% -m pip install python-jose[cryptography] passlib[bcrypt] python-dotenv
%PYTHON_CMD% -m pip install openpyxl pydantic>=2.0
echo.

echo  [2/3] Instalando dependencias de IA y analisis...
echo  (Esto puede tardar varios minutos - torch es grande)
%PYTHON_CMD% -m pip install numpy scikit-learn shapely
%PYTHON_CMD% -m pip install torch --index-url https://download.pytorch.org/whl/cpu
%PYTHON_CMD% -m pip install anthropic reportlab
echo.

echo  [3/3] Instalando dependencias del frontend...
cd /d "%~dp0frontend"
npm install
echo.

echo  =========================================
echo   Instalacion completada
echo  =========================================
echo.
echo  Ahora puedes ejecutar:
echo    iniciar_db_y_datos.bat
echo    iniciar_backend.bat
echo    iniciar_frontend.bat
echo.
pause
