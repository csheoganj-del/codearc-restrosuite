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
echo  Starting/Restarting RestroSuite Gateway + ngrok via PM2...
echo  (ecosystem.config.cjs loads NGROK_DOMAIN from .env.local)
call pm2 delete "restrosuite-gateway" >nul 2>&1
call pm2 delete "restrosuite-ngrok" >nul 2>&1
call pm2 start ecosystem.config.cjs
call pm2 save
echo.
echo  Optional: backup PM2/gateway config to Google Drive...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-gateway-pm2.ps1"
echo.
echo  ======================================================
echo   Gateway + ngrok running in the background!
echo   - Status:        pm2 status
echo   - Gateway logs:  pm2 logs restrosuite-gateway
echo   - Ngrok logs:    pm2 logs restrosuite-ngrok
echo   - Stop both:     pm2 stop all
echo   - Backup again:  powershell -File scripts\backup-gateway-pm2.ps1
echo  ======================================================
echo.
pause
