@echo off
REM Auto-generated ??? RestroSuite WhatsApp gateway + ngrok (PM2)
REM Durable env: %USERPROFILE%\.restrosuite\gateway.env
cd /d "C:\Users\MASTER PC\Downloads\restrosuite"
where pm2 >nul 2>&1
if errorlevel 1 (
  echo PM2 not found in PATH. Install: npm install -g pm2
  exit /b 1
)
REM Prefer resurrect of last pm2 save; fall back to ecosystem
pm2 resurrect >nul 2>&1
pm2 describe restrosuite-gateway >nul 2>&1
if errorlevel 1 (
  pm2 start ecosystem.config.cjs
  pm2 save
)
pm2 describe restrosuite-ngrok >nul 2>&1
if errorlevel 1 (
  pm2 start ecosystem.config.cjs
  pm2 save
)
