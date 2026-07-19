# Install RestroSuite gateway + ngrok to start at Windows login via PM2 resurrect.
# Safe to re-run. Does not require admin for current-user Startup folder.
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$startupDir = [Environment]::GetFolderPath('Startup')
$cmdPath = Join-Path $startupDir 'RestroSuite-Gateway-PM2.cmd'

$lines = @(
  '@echo off',
  'REM Auto-generated — RestroSuite WhatsApp gateway + ngrok (PM2)',
  'REM Durable env: %USERPROFILE%\.restrosuite\gateway.env',
  "cd /d `"$repo`"",
  'where pm2 >nul 2>&1',
  'if errorlevel 1 (',
  '  echo PM2 not found in PATH. Install: npm install -g pm2',
  '  exit /b 1',
  ')',
  'REM Prefer resurrect of last pm2 save; fall back to ecosystem',
  'pm2 resurrect >nul 2>&1',
  'pm2 describe restrosuite-gateway >nul 2>&1',
  'if errorlevel 1 (',
  '  pm2 start ecosystem.config.cjs',
  '  pm2 save',
  ')',
  'pm2 describe restrosuite-ngrok >nul 2>&1',
  'if errorlevel 1 (',
  '  pm2 start ecosystem.config.cjs',
  '  pm2 save',
  ')'
)

Set-Content -Path $cmdPath -Value ($lines -join "`r`n") -Encoding ASCII
Write-Host "Installed login autostart:"
Write-Host "  $cmdPath"
Write-Host ""
Write-Host "On each Windows login this will restore:"
Write-Host "  restrosuite-gateway + restrosuite-ngrok (from pm2 save / ecosystem)"
Write-Host ""
Write-Host "Durable tunnel settings (outside git):"
Write-Host "  $env:USERPROFILE\.restrosuite\gateway.env"
Write-Host ""
Write-Host "To remove autostart: delete that .cmd file from your Startup folder."
