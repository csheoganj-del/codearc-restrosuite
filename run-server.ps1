# Native PowerShell HTTP Server for RestroSuite local development
$port = 8001
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
    Write-Host "RestroSuite dev server running at: http://localhost:$port/" -ForegroundColor Green
    Write-Host "Leave this window open. Press Ctrl+C in terminal to stop." -ForegroundColor Yellow
    
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            $urlPath = $request.Url.LocalPath
            
            # Handle CORS OPTIONS preflight
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.Headers.Add("Access-Control-Allow-Headers", "*")
                $response.Headers.Add("Access-Control-Allow-Methods", "*")
                $response.StatusCode = 200
                $response.Close()
                continue
            }

            # Serve Supabase credentials for local development
            if ($urlPath -eq "/api/config") {
                $response.ContentType = "application/json"
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
                $response.Headers.Add("Access-Control-Allow-Methods", "GET")
                $response.StatusCode = 200

                $envUrl = ""
                $envKey = ""
                $envPath = Join-Path $PSScriptRoot ".env.local"
                if (Test-Path $envPath) {
                    Get-Content $envPath | ForEach-Object {
                        if ($_ -match "^\s*SUPABASE_URL\s*=\s*(.+)$") {
                            $envUrl = $Matches[1].Trim().Trim('"').Trim("'")
                        }
                        if ($_ -match "^\s*SUPABASE_ANON_KEY\s*=\s*(.+)$") {
                            $val = $Matches[1].Trim().Trim('"').Trim("'")
                            if ($val.StartsWith("eyJ")) {
                                $envKey = $val
                            }
                        }
                    }
                }
                if ([string]::IsNullOrEmpty($envUrl)) { $envUrl = "https://htkauiibuejetimfiavs.supabase.co" }
                if ([string]::IsNullOrEmpty($envKey)) { $envKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a2F1aWlidWVqZXRpbWZpYXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTc2OTIsImV4cCI6MjA5NTQzMzY5Mn0.NsQ-nJqXlvPfW9lHuapz8w-2rnHwxIfQwt4XoPk7uyk" }

                # Point frontend directly to the remote Supabase URL so that WebSockets / Realtime channels connect directly and work locally
                $configJson = '{"supabaseUrl":"' + $envUrl + '","supabaseAnonKey":"' + $envKey + '"}'
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($configJson)
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                $response.Close()
                continue
            }

            # Intercept and proxy Supabase API calls (rest/v1 and functions/v1) to avoid CORS issues locally
            if ($urlPath.StartsWith("/functions/v1/") -or $urlPath.StartsWith("/rest/v1/")) {
                $targetUrlBase = ""
                $serviceRoleKey = ""
                $sessionSecret = ""
                
                $envFiles = @("$PSScriptRoot\.env.local", "$PSScriptRoot\.env")
                foreach ($envPath in $envFiles) {
                    if (Test-Path $envPath) {
                        Get-Content $envPath | ForEach-Object {
                            if ($_ -match "^\s*SUPABASE_URL\s*=\s*(.+)$" -and [string]::IsNullOrEmpty($targetUrlBase)) {
                                $targetUrlBase = $Matches[1].Trim().Trim('"').Trim("'")
                            }
                            if ($_ -match "^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)$" -and [string]::IsNullOrEmpty($serviceRoleKey)) {
                                $serviceRoleKey = $Matches[1].Trim().Trim('"').Trim("'")
                            }
                            if ($_ -match "^\s*SUPERADMIN_SESSION_SECRET\s*=\s*(.+)$" -and [string]::IsNullOrEmpty($sessionSecret)) {
                                $sessionSecret = $Matches[1].Trim().Trim('"').Trim("'")
                            }
                        }
                    }
                }
                
                if ([string]::IsNullOrEmpty($targetUrlBase)) {
                    $targetUrlBase = "https://htkauiibuejetimfiavs.supabase.co"
                }

                $targetUrl = $targetUrlBase.TrimEnd('/') + $request.Url.PathAndQuery

                # Prepare headers
                $headers = @{}
                foreach ($h in $request.Headers.AllKeys) {
                    if ($h -eq "Host" -or $h -eq "Content-Length" -or $h -eq "Connection") { continue }
                    $headers.Add($h, $request.Headers[$h])
                }

                # Prepare body
                $reqBody = $null
                if ($request.HasEntityBody) {
                    $reader = New-Object System.IO.StreamReader($request.InputStream)
                    $reqBody = $reader.ReadToEnd()
                    $reader.Close()
                }

                # Intercept seed/reset actions to run locally if service role key is available
                if ($urlPath -eq "/functions/v1/tenant-admin" -and ![string]::IsNullOrEmpty($serviceRoleKey) -and $serviceRoleKey -like "eyJ*" -and ![string]::IsNullOrEmpty($reqBody)) {
                    try {
                        $bodyObj = ConvertFrom-Json $reqBody
                        $action = $bodyObj.action
                        if ($action -eq "seed_tenant_data" -or $action -eq "reset_tenant_data" -or $action -eq "purge_demo_data") {
                            Write-Host "[Local Dev Backend] Intercepted $action - running local script..." -ForegroundColor Green
                            
                            $env:SUPABASE_URL = $targetUrlBase
                            $env:SUPABASE_SERVICE_ROLE_KEY = $serviceRoleKey
                            $env:SUPERADMIN_SESSION_SECRET = $sessionSecret
                            
                            $authHeader = $request.Headers["Authorization"]
                            $rand = Get-Random
                            $outFile = "$PSScriptRoot\.tmp-node-out-$rand.log"
                            $errFile = "$PSScriptRoot\.tmp-node-err-$rand.log"
                            
                            $nodeArgs = @("$PSScriptRoot\scripts\tenant-admin-local.cjs", $action, $reqBody, $authHeader)
                            $nodeProcess = Start-Process -FilePath "node" -ArgumentList $nodeArgs -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile -Wait
                            
                            $resBytes = @()
                            $statusCode = 200
                            if (Test-Path $outFile) {
                                $resString = Get-Content $outFile -Raw
                                if ([string]::IsNullOrEmpty($resString)) {
                                    if (Test-Path $errFile) {
                                        $resString = Get-Content $errFile -Raw
                                    }
                                }
                                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($resString)
                            }
                            
                            if ($nodeProcess.ExitCode -ne 0) {
                                $statusCode = 500
                            }
                            
                            Remove-Item $outFile -ErrorAction SilentlyContinue
                            Remove-Item $errFile -ErrorAction SilentlyContinue
                            
                            $response.ContentType = "application/json; charset=utf-8"
                            $response.StatusCode = $statusCode
                            $response.Headers.Add("Access-Control-Allow-Origin", "*")
                            $response.Headers.Add("Access-Control-Allow-Headers", "*")
                            $response.Headers.Add("Access-Control-Allow-Methods", "*")
                            $response.ContentLength64 = $resBytes.Length
                            $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                            $response.Close()
                            continue
                        }
                    } catch {
                        Write-Warning "[Local Dev Backend] Local execution failed: $_"
                    }
                }

                # Make remote request
                Write-Host "[Proxy] Request: $($request.HttpMethod) $urlPath -> Target: $targetUrl" -ForegroundColor Cyan
                if ($null -ne $reqBody) {
                    Write-Host "[Proxy] Body: $reqBody" -ForegroundColor Gray
                }
                try {
                    $webParams = @{
                        Uri = $targetUrl
                        Method = $request.HttpMethod
                        Headers = $headers
                        UseBasicParsing = $true
                    }
                    if ($null -ne $reqBody) {
                        $webParams.Add("Body", $reqBody)
                    }

                    $maxRetries = 3
                    $retryCount = 0
                    $remoteResponse = $null
                    $success = $false
                    while (-not $success -and $retryCount -lt $maxRetries) {
                        try {
                            $remoteResponse = Invoke-WebRequest @webParams -ErrorAction Stop
                            $success = $true
                        } catch {
                            $retryCount++
                            $errMsg = ""
                            if ($_.Exception) { $errMsg += $_.Exception.ToString() }
                            if ($_.ToString()) { $errMsg += $_.ToString() }
                            
                            if ($retryCount -lt $maxRetries -and ($errMsg -like "*The remote name could not be resolved*" -or $errMsg -like "*NameResolutionFailure*")) {
                                Write-Warning "[Proxy] DNS resolution failed. Retrying in 1.5s... (Attempt $retryCount of $maxRetries)"
                                Start-Sleep -Milliseconds 1500
                            } else {
                                throw $_
                            }
                        }
                    }
                    $resString = $remoteResponse.Content
                    if ($resString -is [System.Byte[]]) {
                        $resBytes = $resString
                    } else {
                        $resBytes = [System.Text.Encoding]::UTF8.GetBytes($resString)
                    }
                    $statusCode = $remoteResponse.StatusCode
                    $contentType = $remoteResponse.Headers["Content-Type"]
                    Write-Host "[Proxy] Remote response: $statusCode ($contentType)" -ForegroundColor Green
                    if ($urlPath -eq "/functions/v1/tenant-data" -and $reqBody -match "doppio_menu") {
                        Write-Host "[Proxy DEBUG] doppio_menu response: $resString" -ForegroundColor Yellow
                    }
                    if ($urlPath -eq "/functions/v1/tenant-data" -and $reqBody -match "doppio_inventory") {
                        Write-Host "[Proxy DEBUG] doppio_inventory response: $resString" -ForegroundColor Yellow
                    }
                } catch {
                    $statusCode = 500
                    Write-Warning "[Proxy] Request to remote failed: $_"
                    if ($null -ne $_.Exception.Response) {
                        $statusCode = $_.Exception.Response.StatusCode
                        $stream = $_.Exception.Response.GetResponseStream()
                        $reader = New-Object System.IO.StreamReader($stream)
                        $rawRes = $reader.ReadToEnd()
                        $reader.Close()
                        
                        # Extract JSON from error message if stream was already read and empty
                        if ([string]::IsNullOrEmpty($rawRes)) {
                            if ($_.Exception.Message -match '({.*})') {
                                $rawRes = $Matches[1]
                            } elseif ($_.ToString() -match '({.*})') {
                                $rawRes = $Matches[1]
                            }
                        }
                        
                        Write-Warning "[Proxy] Remote error body: $rawRes"
                        $resBytes = [System.Text.Encoding]::UTF8.GetBytes($rawRes)
                        $contentType = $_.Exception.Response.ContentType
                    } else {
                        $rawRes = $_.Exception.Message
                        if ([string]::IsNullOrEmpty($rawRes)) { $rawRes = $_.ToString() }
                        $resBytes = [System.Text.Encoding]::UTF8.GetBytes($rawRes)
                        $contentType = "text/plain"
                    }
                    if ([string]::IsNullOrEmpty($contentType)) { $contentType = "application/json" }
                }

                # Return response with wildcard CORS headers
                $response.ContentType = $contentType
                $response.StatusCode = $statusCode
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.Headers.Add("Access-Control-Allow-Headers", "*")
                $response.Headers.Add("Access-Control-Allow-Methods", "*")
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                $response.Close()
                continue
            }

            # Mock WhatsApp Gateway API Receiver
            if ($urlPath -eq "/api/mock-whatsapp") {
                $reader = New-Object System.IO.StreamReader($request.InputStream)
                $body = $reader.ReadToEnd()
                $reader.Close()
                
                Write-Host "`n==========================================" -ForegroundColor Green
                Write-Host "   MOCK AUTOMATED WHATSAPP GATEWAY" -ForegroundColor Green
                Write-Host "==========================================" -ForegroundColor Green
                Write-Host "Received background WhatsApp dispatch!" -ForegroundColor Cyan
                Write-Host "Payload content:" -ForegroundColor Gray
                Write-Host $body -ForegroundColor White
                Write-Host "==========================================`n" -ForegroundColor Green
                
                $response.ContentType = "application/json"
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
                $response.Headers.Add("Access-Control-Allow-Methods", "POST, OPTIONS")
                $response.StatusCode = 200
                
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"success","message":"Mock delivery successful"}')
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
                $response.Close()
                continue
            }

            if ($urlPath -eq "/") { $urlPath = "/index.html" }
            
            # Resolve real file path on disk
            $filePath = Join-Path $PSScriptRoot $urlPath.Replace("/", "\")
            
            if (Test-Path $filePath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                
                # Map file extensions to MIME types
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mime = "text/plain"
                if ($ext -eq ".html") { $mime = "text/html" }
                elseif ($ext -eq ".css") { $mime = "text/css" }
                elseif ($ext -eq ".js") { $mime = "application/javascript" }
                elseif ($ext -eq ".png") { $mime = "image/png" }
                elseif ($ext -eq ".jpg" -or $ext -eq ".jpeg") { $mime = "image/jpeg" }
                elseif ($ext -eq ".json") { $mime = "application/json" }
                
                $response.ContentType = $mime
                $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
                $response.Headers.Add("Pragma", "no-cache")
                $response.Headers.Add("Expires", "0")
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("File Not Found")
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
        } catch {
            Write-Warning "Request error: $_"
            Write-Warning "Stack trace: $($_.ScriptStackTrace)"
            if ($null -ne $response) {
                Write-Warning "Response ContentLength64: $($response.ContentLength64)"
                Write-Warning "Response Headers:"
                foreach ($k in $response.Headers.AllKeys) {
                    Write-Warning "  $k : $($response.Headers[$k])"
                }
                try { $response.Close() } catch {}
            }
        }
    }
} catch {
    Write-Error $_
} finally {
    $listener.Close()
}
