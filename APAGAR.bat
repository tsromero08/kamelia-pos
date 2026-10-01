@echo off
chcp 65001 >nul
color 0C
setlocal enabledelayedexpansion

set RESTAURANT_NAME=Restaurante
set CONTAINER_PREFIX=restaurant
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).business.name"`) do set RESTAURANT_NAME=%%a
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).system.container_prefix"`) do set CONTAINER_PREFIX=%%a

title Apagar - %RESTAURANT_NAME%

cd /d "%~dp0"

echo.
echo  Apagando %RESTAURANT_NAME%...
set COMPOSE_PROJECT_NAME=%CONTAINER_PREFIX%
docker compose -f docker-compose.prod.yml down
echo.
echo  Sistema apagado correctamente.
echo  Los datos estan guardados y seguros.
echo.
timeout /t 3 /nobreak >nul
