Write-Host "==========================================" -ForegroundColor Green
Write-Host "    FREE LOCAL WHATSAPP GATEWAY STARTER" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# Check if node_modules exists, if not install dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing required free libraries (Express, CORS, WhatsApp Web driver)..." -ForegroundColor Yellow
    npm init -y | Out-Null
    npm install express cors whatsapp-web.js qrcode-terminal
}

Write-Host "`nLaunching gateway... A QR code will display shortly in this terminal." -ForegroundColor Green
Write-Host "Leave this terminal window open." -ForegroundColor Yellow
node whatsapp-gateway.js
