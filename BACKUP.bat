@echo off
chcp 65001 >nul
color 0B
setlocal enabledelayedexpansion

set RESTAURANT_NAME=Restaurante
set CONTAINER_PREFIX=restaurant
set DB_USER=restaurant_user
set DB_NAME=restaurant_pos
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).business.name"`) do set RESTAURANT_NAME=%%a
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).system.container_prefix"`) do set CONTAINER_PREFIX=%%a
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).system.db_user"`) do set DB_USER=%%a
for /f "usebackq tokens=*" %%a in (`powershell -NoProfile -Command "(Get-Content '%~dp0restaurant.config.json' -Raw | ConvertFrom-Json).system.db_name"`) do set DB_NAME=%%a

title Backup - %RESTAURANT_NAME%

cd /d "%~dp0"

if not exist "backups" mkdir backups

set FECHA=%date:~6,4%-%date:~3,2%-%date:~0,2%
set HORA=%time:~0,2%-%time:~3,2%
set HORA=%HORA: =0%
set NOMBRE=backup_%FECHA%_%HORA%.sql

echo.
echo  =========================================
echo   BACKUP - %RESTAURANT_NAME%
echo  =========================================
echo.
echo  Creando backup: %NOMBRE%
echo.

docker exec %CONTAINER_PREFIX%_db pg_dump -U %DB_USER% %DB_NAME% > "backups\%NOMBRE%"

if %errorlevel% equ 0 (
    echo  BACKUP EXITOSO
    echo  Archivo: backups\%NOMBRE%
    echo.
    forfiles /p "backups" /m "*.sql" /d -30 /c "cmd /c del @path" >nul 2>&1
    echo  Backups antiguos limpiados (mas de 30 dias)
) else (
    echo  ERROR: No se pudo crear el backup
    echo  Verifica que el sistema este corriendo
)

echo.
pause
