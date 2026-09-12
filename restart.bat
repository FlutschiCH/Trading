@echo off
title Wyckoff Trading - Delayed Restarter
echo =======================================================================
echo [Restart Helper] Waiting 5 seconds for complete socket and process cleanup...
echo =======================================================================

timeout /t 5 /nobreak >nul

echo [Restart Helper] Starting main run_autoupdate.bat...
cd /d "%~dp0"
start "Wyckoff Trading Bot Auto-Updater" cmd /c "run_autoupdate.bat"

echo [Restart Helper] Done.
exit
