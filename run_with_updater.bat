@echo off
title Trading Autoupdater
cd /d "%~dp0"
echo ==========================================
echo       Starting Trading Autoupdater        
echo ==========================================
echo.
python autoupdate.py
pause
