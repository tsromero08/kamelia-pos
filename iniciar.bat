@echo off
chcp 65001 >nul
color 0A
setlocal enabledelayedexpansion

set RESTAURANT_NAME=Restaurante
set CONTAINER_PREFIX=restaurant
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).business.name"`) do set RESTAURANT_NAME=%%a
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).system.container_prefix"`) do set CONTAINER_PREFIX=%%a

title %RESTAURANT_NAME% - Sistema

cd /d "%~dp0"

echo.
echo  =========================================
echo   %RESTAURANT_NAME% - Iniciando sistema
echo  =========================================
echo.

:: Verificar que Docker esta corriendo
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo  Docker no esta corriendo. Abriendo Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe" >nul 2>&1
    echo  Esperando que Docker inicie (30 segundos)...
    timeout /t 30 /nobreak >nul
)

set COMPOSE_PROJECT_NAME=%CONTAINER_PREFIX%
echo  Iniciando contenedores...
docker compose -f docker-compose.prod.yml up -d

echo.
echo  Esperando que el sistema este listo...
timeout /t 10 /nobreak >nul

echo.
echo  =========================================
echo   Sistema listo: http://localhost
echo  =========================================
echo.
start http://localhost
