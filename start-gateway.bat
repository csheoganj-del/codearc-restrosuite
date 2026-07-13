@echo off
title RestroSuite WhatsApp Gateway (LOCAL PC)
cd /d "%~dp0"
echo.
echo  RestroSuite WhatsApp Gateway — LOCAL computer
echo  ================================================
echo  Keep this window open. Closing it stops WhatsApp.
echo  Leave the PC plugged in; Sleep should be Never on AC.
echo  Press Ctrl+C to stop.
echo.
node scripts\start-gateway.js
echo.
echo  Gateway stopped.
pause
