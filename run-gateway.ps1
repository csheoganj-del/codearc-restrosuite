Write-Host "==========================================" -ForegroundColor Green
Write-Host "  RestroSuite LOCAL WhatsApp Gateway" -ForegroundColor Green
Write-Host "  (runs on THIS PC — not Hugging Face)" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# Set NODE_PATH dynamically to load dependencies cleanly
$localNodeModules = Join-Path $PSScriptRoot "node_modules"
$env:NODE_PATH = $localNodeModules

# Read GATEWAY_TOKEN from .env.local (keeps token in sync with the dev server)
$envLocalPath = Join-Path $PSScriptRoot ".env.local"
$gatewayToken = "local-dev-gateway-token"
if (Test-Path $envLocalPath) {
    Get-Content $envLocalPath | ForEach-Object {
        if ($_ -match "^\s*GATEWAY_TOKEN\s*=\s*(.+)$") {
            $val = $Matches[1].Trim().Trim('"').Trim("'")
            if (-not [string]::IsNullOrEmpty($val)) { $gatewayToken = $val }
        }
    }
}
$env:GATEWAY_TOKEN = $gatewayToken
Write-Host "Gateway token loaded: $($gatewayToken.Substring(0, [Math]::Min(6, $gatewayToken.Length)))..." -ForegroundColor Cyan

# Append portable Node to PATH dynamically
$portableNodeDir = Join-Path $PSScriptRoot "node-portable\node-v20.11.1-win-x64"
$env:PATH += ";$portableNodeDir"

# Use portable node executable or fallback to global node
$nodeExe = Join-Path $portableNodeDir "node.exe"
if (-not (Test-Path $nodeExe)) {
    $nodeExe = "node"
}

Write-Host ""
Write-Host "IMPORTANT for all-day / overnight use on this computer:" -ForegroundColor Yellow
Write-Host "  1. Leave this window OPEN (closing it stops WhatsApp)." -ForegroundColor Yellow
Write-Host "  2. Do not put the PC to sleep/hibernate while the restaurant is open." -ForegroundColor Yellow
Write-Host "     Settings → System → Power → Sleep = Never (when plugged in)." -ForegroundColor Yellow
Write-Host "  3. Keep the phone online with WhatsApp open occasionally (Linked Devices)." -ForegroundColor Yellow
Write-Host "  4. Session files live in: $env:USERPROFILE\.restrosuite\whatsapp-auth" -ForegroundColor Cyan
Write-Host ""
Write-Host "Launcher will keep Windows from sleeping and auto-restart if Node crashes." -ForegroundColor Green
Write-Host ""

# Prefer the robust launcher (env load + stay-awake + crash restart)
$launcher = Join-Path $PSScriptRoot "scripts\start-gateway.js"
if (Test-Path $launcher) {
    & $nodeExe $launcher
} else {
    Write-Host "scripts\start-gateway.js missing — starting gateway directly." -ForegroundColor Yellow
    & $nodeExe "$PSScriptRoot\whatsapp-gateway.js"
}
