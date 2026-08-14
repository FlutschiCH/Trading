@echo off
title Wyckoff Trading Bot Auto-Updater

:loop
echo =======================================================================
echo [AutoUpdater Bat] Checking for latest Git updates...
echo =======================================================================

if exist ".git\index.lock" (
    del /f /q ".git\index.lock" 2>nul
)

git fetch --all
git reset --hard origin/main
git lfs pull

echo.
echo [AutoUpdater Bat] Starting Python backend manager...
"C:\Program Files\Python311\python.exe" autoupdate.py
set EXIT_CODE=%errorlevel%

echo.
echo [AutoUpdater Bat] Python process exited with code %EXIT_CODE%.

if %EXIT_CODE% equ 99 (
    echo [AutoUpdater Bat] Exit code 99 received. Stopping updater script.
    goto end
)

echo [AutoUpdater Bat] Waiting 5 seconds for safe process shutdown and socket cleanup...
timeout /t 5 /nobreak >nul
goto loop

:end
echo [AutoUpdater Bat] Process finished.
pause
