# Build RestroSuite Gateway as a local plug-and-play Windows EXE.
# Does NOT publish to the public website — output is for local use only.
#
# Usage (from repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-gateway-exe.ps1
#
# Output:
#   local-builds\RestroSuite-Gateway-Portable.exe   (double-click, no install)
#   local-builds\RestroSuite-Gateway-Setup.exe      (optional installer)
#   gateway-tray\dist\...                           (electron-builder output)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $Root 'gateway-tray\package.json'))) {
  $Root = Get-Location
}
$Gw = Join-Path $Root 'gateway-tray'
$Out = Join-Path $Root 'local-builds'

if (-not (Test-Path (Join-Path $Gw 'package.json'))) {
  throw "gateway-tray not found under $Root"
}

New-Item -ItemType Directory -Force -Path $Out | Out-Null
Set-Location $Gw

Write-Host "==> npm install (gateway-tray)"
if (-not (Test-Path 'node_modules\electron-builder')) {
  npm install
}

Write-Host "==> building portable + installer EXE"
npm run dist:local

$portable = Get-ChildItem -Path (Join-Path $Gw 'dist') -Filter '*portable*.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $portable) {
  $portable = Get-ChildItem -Path (Join-Path $Gw 'dist') -Filter 'RestroSuite-Gateway-*-x64.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch 'Setup|blockmap' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
$setup = Get-ChildItem -Path (Join-Path $Gw 'dist') -Filter '*Setup*.exe' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) {
  $setup = Get-ChildItem -Path (Join-Path $Gw 'dist') -Filter 'RestroSuite-Gateway-*-x64.exe' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

if ($portable) {
  Copy-Item $portable.FullName (Join-Path $Out 'RestroSuite-Gateway-Portable.exe') -Force
  Write-Host "Portable -> local-builds\RestroSuite-Gateway-Portable.exe ($([math]::Round($portable.Length/1MB,1)) MB)"
} else {
  Write-Warning "No portable EXE found in gateway-tray\dist"
}

if ($setup -and ($null -eq $portable -or $setup.FullName -ne $portable.FullName)) {
  Copy-Item $setup.FullName (Join-Path $Out 'RestroSuite-Gateway-Setup.exe') -Force
  Write-Host "Setup    -> local-builds\RestroSuite-Gateway-Setup.exe ($([math]::Round($setup.Length/1MB,1)) MB)"
}

Write-Host ""
Write-Host "Plug-and-play:"
Write-Host "  Double-click  local-builds\RestroSuite-Gateway-Portable.exe"
Write-Host "  Green W tray icon = Gateway running"
Write-Host "  Requires repo at Downloads\restrosuite (or RESTROSUITE_ROOT) + Node/PM2 for WhatsApp."
Write-Host "Done."
