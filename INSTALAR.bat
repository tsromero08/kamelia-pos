@echo off
chcp 65001 >nul
color 0A
setlocal enabledelayedexpansion

:: ── Leer nombre y prefijo del restaurante desde restaurant.config.json ─
set RESTAURANT_NAME=Restaurante
set CONTAINER_PREFIX=restaurant
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).business.name"`) do set RESTAURANT_NAME=%%a
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).system.container_prefix"`) do set CONTAINER_PREFIX=%%a
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).system.email_domain"`) do set EMAIL_DOMAIN=%%a

title Instalador - %RESTAURANT_NAME%

echo.
echo  =========================================
echo   %RESTAURANT_NAME%
echo   SISTEMA DE GESTION - INSTALADOR
echo  =========================================
echo.

cd /d "%~dp0"

:: ── Verificar Docker ──────────────────────────────────
echo [1/5] Verificando Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Docker no esta instalado.
    echo  Descarga Docker Desktop: https://www.docker.com/products/docker-desktop/
    echo.
    pause
    start https://www.docker.com/products/docker-desktop/
    exit /b 1
)
echo  OK - Docker detectado

:: ── Verificar Docker corriendo ────────────────────────
echo [2/5] Verificando que Docker este corriendo...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  Docker esta instalado pero no esta corriendo.
    echo  Abre Docker Desktop y espera que aparezca el icono en la barra
    echo  de tareas, luego vuelve a ejecutar este instalador.
    echo.
    pause
    exit /b 1
)
echo  OK - Docker corriendo

:: ── Detener instalacion anterior si existe ────────────
echo [3/5] Preparando instalacion...
set COMPOSE_PROJECT_NAME=%CONTAINER_PREFIX%
docker compose -f docker-compose.prod.yml down >nul 2>&1
echo  OK - Limpieza completada

:: ── Construir e iniciar ───────────────────────────────
echo [4/5] Construyendo el sistema (primera vez tarda 3-5 minutos)...
echo       No cierres esta ventana...
echo.
docker compose -f docker-compose.prod.yml up --build -d

if %errorlevel% neq 0 (
    echo.
    echo  ERROR durante la instalacion.
    pause
    exit /b 1
)

:: ── Esperar que los servicios estén listos ────────────
echo.
echo [5/5] Esperando que el sistema inicie...
timeout /t 15 /nobreak >nul

:: ── Crear acceso directo en el escritorio ─────────────
echo Creando acceso directo en el escritorio...
set SCRIPT_PATH=%~dp0iniciar.bat
set SHORTCUT_PATH=%USERPROFILE%\Desktop\%RESTAURANT_NAME%.lnk
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%SCRIPT_PATH%'; $s.WorkingDirectory = '%~dp0'; $s.Description = '%RESTAURANT_NAME% - Sistema de Gestion'; $s.Save()" >nul 2>&1

:: ── Configurar inicio automatico con Windows ──────────
echo Configurando inicio automatico con Windows...
schtasks /create /tn "%CONTAINER_PREFIX%_POS" /tr "\"%~dp0iniciar.bat\"" /sc onlogon /rl highest /f >nul 2>&1

echo.
echo  =========================================
echo   INSTALACION COMPLETADA EXITOSAMENTE
echo  =========================================
echo.
echo   El sistema esta corriendo en:
echo   http://localhost
echo.
echo   Credenciales iniciales:
echo   Usuario: admin@%EMAIL_DOMAIN%
echo   Clave:   CambiaEstaClave123
echo.
echo   IMPORTANTE: Cambia la clave al entrar
echo.
echo  =========================================
echo.
echo  Abriendo el sistema en el navegador...
timeout /t 3 /nobreak >nul
start http://localhost
echo.
pause
