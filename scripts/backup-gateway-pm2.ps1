# Backup RestroSuite WhatsApp gateway + PM2 config to Google Drive / OneDrive / Desktop.
# Safe to re-run. Does not upload passwords to git — only local/cloud folders you own.
$ErrorActionPreference = 'Stop'

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$repo = Split-Path -Parent $PSScriptRoot
$homeDir = $env:USERPROFILE
$machineRestro = Join-Path $homeDir '.restrosuite'
$pm2Dir = Join-Path $homeDir '.pm2'

$destRoots = @()
foreach ($p in @(
    'G:\My Drive',
    (Join-Path $homeDir 'Google Drive'),
    (Join-Path $homeDir 'My Drive'),
    (Join-Path $homeDir 'OneDrive'),
    (Join-Path $homeDir 'Desktop'),
    (Join-Path $homeDir 'Documents')
  )) {
  if (Test-Path -LiteralPath $p) { $destRoots += $p }
}

if ($destRoots.Count -eq 0) {
  Write-Error 'No Google Drive / OneDrive / Desktop / Documents folder found.'
}

$folderName = "RestroSuite-Gateway-Backup_$stamp"
$workRoot = Join-Path $env:TEMP $folderName
New-Item -ItemType Directory -Path $workRoot -Force | Out-Null

function Copy-IfExists($src, $destRel) {
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Host "  skip (missing): $src"
    return
  }
  $dest = Join-Path $workRoot $destRel
  $destParent = Split-Path $dest -Parent
  if (-not (Test-Path $destParent)) { New-Item -ItemType Directory -Path $destParent -Force | Out-Null }
  if (Test-Path -LiteralPath $src -PathType Container) {
    Copy-Item -LiteralPath $src -Destination $dest -Recurse -Force
  } else {
    Copy-Item -LiteralPath $src -Destination $dest -Force
  }
  Write-Host "  + $destRel"
}

Write-Host "Collecting gateway / PM2 files..."

# Machine-local durable env (ngrok domain, tokens)
Copy-IfExists (Join-Path $machineRestro 'gateway.env') 'machine\gateway.env'

# WhatsApp auth sessions (can be large)
$sessionAuth = Join-Path $machineRestro 'whatsapp-auth'
if (Test-Path $sessionAuth) {
  Copy-IfExists $sessionAuth 'machine\whatsapp-auth'
}

# PM2 process list (resurrect after reinstall)
Copy-IfExists (Join-Path $pm2Dir 'dump.pm2') 'pm2\dump.pm2'
Copy-IfExists (Join-Path $pm2Dir 'dump.pm2.bak') 'pm2\dump.pm2.bak'

# Project env + PM2 ecosystem (no node_modules)
Copy-IfExists (Join-Path $repo '.env.local') 'repo\.env.local'
Copy-IfExists (Join-Path $repo 'ecosystem.config.cjs') 'repo\ecosystem.config.cjs'
Copy-IfExists (Join-Path $repo 'ngrok-service.js') 'repo\ngrok-service.js'
Copy-IfExists (Join-Path $repo 'start-gateway-pm2.bat') 'repo\start-gateway-pm2.bat'
Copy-IfExists (Join-Path $repo 'scripts\load-gateway-env.js') 'repo\scripts\load-gateway-env.js'
Copy-IfExists (Join-Path $repo 'scripts\install-gateway-autostart.ps1') 'repo\scripts\install-gateway-autostart.ps1'
Copy-IfExists (Join-Path $repo 'scripts\backup-gateway-pm2.ps1') 'repo\scripts\backup-gateway-pm2.ps1'

# Capture live PM2 status (best-effort)
$metaDir = Join-Path $workRoot 'meta'
New-Item -ItemType Directory -Path $metaDir -Force | Out-Null
try {
  pm2 jlist 2>$null | Out-File -FilePath (Join-Path $metaDir 'pm2-jlist.json') -Encoding utf8
  pm2 list 2>$null | Out-File -FilePath (Join-Path $metaDir 'pm2-list.txt') -Encoding utf8
  Write-Host '  + meta\pm2 status'
} catch {
  Write-Host '  skip pm2 status (pm2 not in PATH?)'
}

$restoreMd = @"
# RestroSuite gateway + PM2 restore

Created: $stamp
PC: $env:COMPUTERNAME
User: $env:USERNAME

## After Windows reinstall / format

1. Install **Node.js** (LTS) and run: ``npm install -g pm2``
2. Install / login **ngrok** (auth token from ngrok dashboard).
3. Restore project from GitHub (or your full project backup).
4. Copy these files back:

| Backup file | Restore to |
|-------------|------------|
| ``machine\gateway.env`` | ``%USERPROFILE%\.restrosuite\gateway.env`` |
| ``machine\whatsapp-auth\`` | ``%USERPROFILE%\.restrosuite\whatsapp-auth\`` |
| ``repo\.env.local`` | project root ``.env.local`` |
| ``repo\ecosystem.config.cjs`` etc. | project (or re-pull from git) |

5. From project folder:
``````
pm2 start ecosystem.config.cjs
pm2 save
powershell -File scripts\install-gateway-autostart.ps1
``````

6. Confirm:
``````
pm2 list
# both restrosuite-gateway and restrosuite-ngrok = online
``````

7. If WhatsApp needs QR again: Super-Admin → Gateway → scan once.

## Important

- ``gateway.env`` holds **NGROK_DOMAIN** + gateway tokens — keep private.
- Do not commit this zip to GitHub.
- Supabase secrets ``WHATSAPP_GATEWAY_URL`` / ``WHATSAPP_GATEWAY_TOKEN`` must still match.
"@
Set-Content -Path (Join-Path $workRoot 'RESTORE.md') -Value $restoreMd -Encoding UTF8

$zipName = "$folderName.zip"
$results = @()

foreach ($root in $destRoots) {
  $backupDir = Join-Path $root 'RestroSuite-Backups'
  if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  }
  $zipPath = Join-Path $backupDir $zipName
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path (Join-Path $workRoot '*') -DestinationPath $zipPath -Force
  $results += $zipPath
  Write-Host "Saved: $zipPath"
}

# Keep a rolling "latest" copy on first cloud root (Google Drive preferred)
$primary = $results | Where-Object { $_ -like 'G:\My Drive\*' } | Select-Object -First 1
if (-not $primary) { $primary = $results[0] }
$latestDir = Split-Path $primary -Parent
$latestZip = Join-Path $latestDir 'RestroSuite-Gateway-Backup_LATEST.zip'
Copy-Item -LiteralPath $primary -Destination $latestZip -Force
Write-Host "Latest: $latestZip"

Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'Done. Backup locations:'
$results | ForEach-Object { Write-Host "  $_" }
Write-Host "  $latestZip"
