@echo off
setlocal enabledelayedexpansion
title Wyckoff Trading - Port Restarter
echo =======================================================================
echo [Restart Helper] Waiting for backend ports (8020 / 8081) to close...
echo =======================================================================

:check_ports
set PORT_OCCUPIED=0

rem Check if port 8020 or 8081 is still in LISTENING state
netstat -ano | findstr /R /C:":8020 .*LISTENING" /C:":8081 .*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    set PORT_OCCUPIED=1
)

if !PORT_OCCUPIED! equ 1 (
    echo [Restart Helper] Port is still active. Waiting for socket release...
    timeout /t 1 /nobreak >nul
    goto check_ports
)

echo [Restart Helper] Ports are free!
echo [Restart Helper] Launching run_autoupdate.bat...
cd /d "%~dp0"
start "Wyckoff Trading Bot Auto-Updater" cmd /c "run_autoupdate.bat"

echo [Restart Helper] Done.
exit
