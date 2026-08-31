@echo off
title Wyckoff Trading - Deploy & Launch
echo =======================================================================
echo [Deploy] Starting Backend on Port 8020 and Frontend on Port 8021...
echo =======================================================================

set PORT=8020
start "Trading Backend (Port 8020)" cmd /k "cd /d %~dp0backend && python app.py"
start "Trading Frontend (Port 8021)" cmd /k "cd /d %~dp0 && npm run dev"

echo [Deploy] Services launched successfully!
echo Backend:  http://localhost:8020
echo Frontend: http://localhost:8021
