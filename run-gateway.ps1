Write-Host "==========================================" -ForegroundColor Green
Write-Host "    FREE LOCAL WHATSAPP GATEWAY STARTER" -ForegroundColor Green
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

Write-Host "`nLaunching gateway... A QR code will display shortly in this terminal." -ForegroundColor Green
Write-Host "You can also view and scan the QR directly in the POS Settings!" -ForegroundColor Cyan
Write-Host "Leave this terminal window open." -ForegroundColor Yellow

& $nodeExe "$PSScriptRoot\whatsapp-gateway.js"

