# RestroSuite - web deploy for frictionless 10x pack
# --------------------------------------------------------------------------
# Builds critical assets, deploys to Vercel production, then runs smoke.
#
# Usage (from repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-frictionless.ps1
#
# Env:
#   SKIP_VERCEL_DEPLOY=1   build only (no vercel)
#   SKIP_SMOKE=1           skip post-deploy smoke
#   SKIP_VERSION_BUMP=1    do not bump content/SW versions
#   RS_BASE=https://...    smoke base URL
# --------------------------------------------------------------------------
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "=== RestroSuite frictionless web deploy ===" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host ""

function Step($msg) {
  Write-Host ""
  Write-Host "-> $msg" -ForegroundColor Yellow
}

# 1) Critical bundle
Step "build:critical"
npm run build:critical
if ($LASTEXITCODE -ne 0) { throw "build:critical failed" }

# 2) Version bumps so PWA picks up files
if ($env:SKIP_VERSION_BUMP -ne "1") {
  Step "bump service-worker + content version"
  npm run bump:sw-version
  if ($LASTEXITCODE -ne 0) { throw "bump:sw-version failed" }
  npm run bump:content-version -- --ci --slug frictionless
  if ($LASTEXITCODE -ne 0) { throw "bump:content-version failed" }
  npm run build:content-manifest
  if ($LASTEXITCODE -ne 0) { throw "build:content-manifest failed" }
} else {
  Write-Host "  (skip version bump)"
}

# 3) Guard rails
$fx = Join-Path $Root "assets\modules\frictionless-10x.js"
if (-not (Test-Path $fx)) {
  throw "Missing assets/modules/frictionless-10x.js - cannot deploy"
}
$dashPath = Join-Path $Root "dashboard.html"
$dash = Get-Content $dashPath -Raw
if ($dash -notmatch "frictionless-10x") {
  throw "dashboard.html does not reference frictionless-10x.js"
}
Write-Host "  frictionless-10x.js + dashboard tag OK"

# 4) Vercel production (buildCommand = npm run vercel-build)
if ($env:SKIP_VERCEL_DEPLOY -ne "1") {
  Step "vercel --prod --yes"
  $vercel = Get-Command vercel -ErrorAction SilentlyContinue
  if (-not $vercel) {
    throw "vercel CLI not found. Install: npm i -g vercel ; vercel login"
  }
  vercel --prod --yes
  if ($LASTEXITCODE -ne 0) { throw "vercel deploy failed" }
} else {
  Write-Host "  SKIP_VERCEL_DEPLOY=1 - local pages build only"
  Step "pages:build (local)"
  npm run pages:build
  if ($LASTEXITCODE -ne 0) { throw "pages:build failed" }
}

# 5) Post-deploy smoke
if ($env:SKIP_SMOKE -ne "1") {
  Step "frictionless smoke against production"
  Start-Sleep -Seconds 8
  node scripts/frictionless-smoke.cjs
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Smoke reported FAIL - CDN may still be caching. Wait 30s and re-run:" -ForegroundColor Red
    Write-Host "  node scripts/frictionless-smoke.cjs"
    Write-Host "  node scripts/frictionless-smoke.cjs --ui"
    exit $LASTEXITCODE
  }
} else {
  Write-Host "  SKIP_SMOKE=1"
}

Write-Host ""
Write-Host "=== Deploy frictionless complete ===" -ForegroundColor Green
Write-Host "Hard-refresh clients: Ctrl+Shift+R"
Write-Host "Manual UI: node scripts/frictionless-smoke.cjs --ui"
Write-Host ""
