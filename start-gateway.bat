@echo off
title RestroSuite WhatsApp Gateway
cd /d "%~dp0"
echo.
echo  Starting RestroSuite WhatsApp Gateway on port 3000...
echo  Press Ctrl+C to stop.
echo.
node scripts\start-gateway.js
echo.
echo  Gateway stopped.
pause
