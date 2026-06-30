@echo off
title RestroSuite WhatsApp Gateway (PM2)
cd /d "%~dp0"
echo.
echo  Checking if PM2 is installed globally...
call npm list -g pm2 >nul 2>&1
if errorlevel 1 (
    echo  Installing PM2 globally...
    call npm install -g pm2
)
echo.
echo  Starting/Restarting RestroSuite Gateway via PM2...
call pm2 delete "restrosuite-gateway" >nul 2>&1
call pm2 start whatsapp-gateway.js --name "restrosuite-gateway"
echo.
echo  ======================================================
echo   Gateway is running silently in the background!
echo   - To view live logs: pm2 logs restrosuite-gateway
echo   - To check status: pm2 status
echo   - To stop the server: pm2 stop restrosuite-gateway
echo  ======================================================
echo.
pause
