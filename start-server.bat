@echo off
title RestroSuite Dev Server
cd /d "%~dp0"
echo.
echo  Starting RestroSuite dev server...
echo  Open http://localhost:8001 in your browser.
echo  Press Ctrl+C to stop.
echo.
node scripts/dev-server.js
pause
