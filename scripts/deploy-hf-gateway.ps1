#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy RestroSuite WhatsApp gateway (Baileys + lazy sessions) to Hugging Face Spaces.

.EXAMPLE
  # 1) Put HF_TOKEN=hf_... in .env.local  OR  pass -HfToken
  .\scripts\deploy-hf-gateway.ps1

  # 2) Or set once in this session:
  $env:HF_TOKEN = "hf_xxx"
  .\scripts\deploy-hf-gateway.ps1
#>
param(
  [string]$HfUser = "kalpeshdeora1006",
  [string]$SpaceName = "restrosuite-gateway",
  [string]$HfToken = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

function Read-EnvLocal {
  $map = @{}
  $p = Join-Path $Root ".env.local"
  if (-not (Test-Path $p)) { return $map }
  Get-Content $p -Encoding UTF8 | ForEach-Object {
    $t = $_.Trim()
    if (-not $t -or $t.StartsWith("#")) { return }
    $i = $t.IndexOf("=")
    if ($i -lt 1) { return }
    $k = $t.Substring(0, $i).Trim()
    $v = $t.Substring($i + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $map[$k] = $v
  }
  return $map
}

Write-Host ""
Write-Host "=== RestroSuite WhatsApp → Hugging Face ===" -ForegroundColor Cyan
Write-Host "Target Space: https://huggingface.co/spaces/$HfUser/$SpaceName"
Write-Host ""

$envMap = Read-EnvLocal
if (-not $HfToken) { $HfToken = $env:HF_TOKEN }
if (-not $HfToken) { $HfToken = $env:HUGGING_FACE_HUB_TOKEN }
if (-not $HfToken) { $HfToken = $envMap["HF_TOKEN"] }
if (-not $HfToken) { $HfToken = $envMap["HUGGING_FACE_HUB_TOKEN"] }

if (-not $HfToken) {
  Write-Host "Hugging Face login token needed (one-time)." -ForegroundColor Yellow
  Write-Host "Opening browser: create a WRITE token, then paste it here."
  Start-Process "https://huggingface.co/settings/tokens?new_token=true"
  Start-Sleep -Seconds 2
  Start-Process "https://huggingface.co/new-space"
  Write-Host ""
  Write-Host "In the browser:" -ForegroundColor Cyan
  Write-Host "  1) Create token with role Write (or fine-grained write on Spaces)"
  Write-Host "  2) Copy token (starts with hf_)"
  Write-Host ""
  $HfToken = Read-Host "Paste HF token"
  if (-not $HfToken -or -not $HfToken.StartsWith("hf_")) {
    throw "Valid HF token required (hf_...)"
  }
  $envLine = "`n# Hugging Face (deploy script)`nHF_TOKEN=$HfToken`n"
  Add-Content -Path (Join-Path $Root ".env.local") -Value $envLine -Encoding UTF8
  Write-Host "Saved HF_TOKEN to .env.local" -ForegroundColor Green
}

$env:HF_TOKEN = $HfToken
$env:HUGGING_FACE_HUB_TOKEN = $HfToken

$gatewayToken = $envMap["GATEWAY_TOKEN"]
if (-not $gatewayToken) { $gatewayToken = $envMap["WHATSAPP_GATEWAY_TOKEN"] }
$supabaseUrl = $envMap["SUPABASE_URL"]
$serviceKey = $envMap["SUPABASE_SERVICE_ROLE_KEY"]
if (-not $serviceKey) { $serviceKey = $envMap["SUPABASE_SERVICE_KEY"] }

if (-not $gatewayToken) { throw "GATEWAY_TOKEN missing in .env.local" }
if (-not $supabaseUrl) { throw "SUPABASE_URL missing in .env.local" }
if (-not $serviceKey) { throw "SUPABASE_SERVICE_ROLE_KEY missing in .env.local" }

$origins = $envMap["GATEWAY_ALLOWED_ORIGINS"]
if (-not $origins) {
  $origins = "https://restrosuite.codearc.co.in,https://codearc-restrosuite.vercel.app,http://localhost:3000,https://$HfUser-$SpaceName.hf.space"
}

$stage = Join-Path $Root "gateway-hf\_space_build"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

Copy-Item (Join-Path $Root "whatsapp-gateway.js") (Join-Path $stage "whatsapp-gateway.js") -Force
Copy-Item (Join-Path $Root "gateway-hf\package.json") (Join-Path $stage "package.json") -Force

$readme = @"
---
title: RestroSuite WhatsApp Gateway
emoji: plate_with_cutlery
colorFrom: orange
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# RestroSuite WhatsApp Gateway (Baileys + lazy multi-tenant)

CPU Basic free (2 vCPU / 16GB). Sessions restored from Supabase Storage.
"@
# emoji in YAML can break - use simple
$readme = @"
---
title: RestroSuite WhatsApp Gateway
emoji: "\U0001F37D"
colorFrom: orange
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

RestroSuite Baileys gateway. Lazy own-number sessions. Secrets set via Space Settings.
"@
# Use ASCII-safe README for Windows
@"
---
title: RestroSuite WhatsApp Gateway
emoji: rocket
colorFrom: orange
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# RestroSuite WhatsApp Gateway

Baileys multi-tenant gateway with lazy sessions and Supabase session backup.
"@ | Set-Content (Join-Path $stage "README.md") -Encoding utf8

@"
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY whatsapp-gateway.js ./
ENV PORT=7860
ENV NODE_ENV=production
ENV RESTROSUITE_AUTO_CONNECT_ALL_SESSIONS=false
ENV LAZY_MAX_HOT_TENANTS=30
ENV LAZY_IDLE_MS=180000
ENV LAZY_CONNECT_TIMEOUT_MS=50000
ENV PLATFORM_SEND_FALLBACK=true
ENV AUTH_DATA_PATH=/data/whatsapp-auth
RUN mkdir -p /data/whatsapp-auth /tmp/whatsapp-auth
EXPOSE 7860
CMD ["node", "whatsapp-gateway.js"]
"@ | Set-Content (Join-Path $stage "Dockerfile") -Encoding utf8

$env:RS_HF_USER = $HfUser
$env:RS_HF_SPACE = $SpaceName
$env:RS_STAGE = $stage
$env:RS_GATEWAY_TOKEN = $gatewayToken
$env:RS_SUPABASE_URL = $supabaseUrl
$env:RS_SERVICE_KEY = $serviceKey
$env:RS_ORIGINS = $origins

$py = @'
import os, sys
from huggingface_hub import HfApi, create_repo, login

token = os.environ["HF_TOKEN"]
user = os.environ["RS_HF_USER"]
space = os.environ["RS_HF_SPACE"]
repo_id = f"{user}/{space}"
stage = os.environ["RS_STAGE"]

login(token=token)
api = HfApi(token=token)
me = api.whoami()
print("Logged in as:", me.get("name"))

print("Ensuring Space", repo_id)
create_repo(
    repo_id=repo_id,
    repo_type="space",
    space_sdk="docker",
    private=True,
    exist_ok=True,
    token=token,
)

secrets = {
    "GATEWAY_TOKEN": os.environ["RS_GATEWAY_TOKEN"],
    "WHATSAPP_GATEWAY_TOKEN": os.environ["RS_GATEWAY_TOKEN"],
    "GATEWAY_AUTH_TOKEN": os.environ["RS_GATEWAY_TOKEN"],
    "SUPABASE_URL": os.environ["RS_SUPABASE_URL"],
    "SUPABASE_SERVICE_ROLE_KEY": os.environ["RS_SERVICE_KEY"],
    "SUPABASE_SERVICE_KEY": os.environ["RS_SERVICE_KEY"],
    "GATEWAY_ALLOWED_ORIGINS": os.environ["RS_ORIGINS"],
    "RESTROSUITE_AUTO_CONNECT_ALL_SESSIONS": "false",
    "LAZY_MAX_HOT_TENANTS": "30",
    "PLATFORM_SEND_FALLBACK": "true",
    "AUTH_DATA_PATH": "/data/whatsapp-auth",
}
print("Setting secrets...")
for k, v in secrets.items():
    api.add_space_secret(repo_id=repo_id, key=k, value=v)
    print("  OK", k)

print("Uploading files...")
api.upload_folder(
    folder_path=stage,
    repo_id=repo_id,
    repo_type="space",
    commit_message="deploy: Baileys lazy WhatsApp gateway plug-and-play",
)
print("Upload done.")
print("SPACE_PAGE=https://huggingface.co/spaces/" + repo_id)
print("APP_URL=https://" + user + "-" + space + ".hf.space")
'@

$pyFile = Join-Path $env:TEMP "rs_hf_deploy.py"
Set-Content -Path $pyFile -Value $py -Encoding UTF8
Write-Host "Deploying..." -ForegroundColor Cyan
python $pyFile
if ($LASTEXITCODE -ne 0) { throw "Deploy failed — check token permissions (Write)" }

$appUrl = "https://$HfUser-$SpaceName.hf.space"
$spacePage = "https://huggingface.co/spaces/$HfUser/$SpaceName"

# Point local env at HF
$envPath = Join-Path $Root ".env.local"
$raw = Get-Content $envPath -Raw -Encoding UTF8
if ($raw -match "WHATSAPP_GATEWAY_URL\s*=") {
  $raw = $raw -replace "WHATSAPP_GATEWAY_URL\s*=\s*[^\r\n]+", "WHATSAPP_GATEWAY_URL=$appUrl"
} else {
  $raw = $raw.TrimEnd() + "`nWHATSAPP_GATEWAY_URL=$appUrl`n"
}
if ($raw -notmatch "HF_SPACE_URL\s*=") {
  $raw = $raw.TrimEnd() + "`nHF_SPACE_URL=$appUrl`n"
}
Set-Content $envPath -Value $raw -Encoding UTF8

Write-Host ""
Write-Host "Waiting for build/start (up to ~8 min)..." -ForegroundColor Yellow
$healthy = $false
for ($i = 1; $i -le 32; $i++) {
  Start-Sleep -Seconds 15
  try {
    $r = Invoke-WebRequest -Uri "$appUrl/health" -UseBasicParsing -TimeoutSec 25
    if ($r.StatusCode -eq 200) {
      Write-Host "HEALTH OK" -ForegroundColor Green
      Write-Host $r.Content
      $healthy = $true
      break
    }
  } catch {
    Write-Host ("  [{0}/32] not ready yet..." -f $i)
  }
}

Write-Host ""
Write-Host "======== DEPLOY RESULT ========" -ForegroundColor Green
Write-Host "Space page : $spacePage"
Write-Host "Gateway URL: $appUrl"
Write-Host "Health     : $appUrl/health"
Write-Host ""
Write-Host "YOU MUST DO ONCE (2 minutes):" -ForegroundColor Cyan
Write-Host "1) Open Superadmin → Gateway on https://restrosuite.codearc.co.in/dashboard"
Write-Host "   Scan WhatsApp QR for the PLATFORM line (if needed)."
Write-Host "2) Supabase → Project Settings → Edge Functions → Secrets:"
Write-Host "     WHATSAPP_GATEWAY_URL  = $appUrl"
Write-Host "     WHATSAPP_GATEWAY_TOKEN = (same as GATEWAY_TOKEN in .env.local)"
Write-Host "3) Each restaurant: Settings → WhatsApp → scan once (lazy own number)."
Write-Host "================================"

Start-Process $spacePage
if ($healthy) { Start-Process "$appUrl/health" }
else { Start-Process $spacePage }

Write-Host "Done. If health still down, open Space → Logs and wait for Docker build."
