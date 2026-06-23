# Native PowerShell HTTP Server for RestroSuite local development
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")

# Project root is two directories up from scripts/local/
$projectRoot = Join-Path $PSScriptRoot "..\.."
$projectRoot = Resolve-Path $projectRoot
Write-Host "Project root: $projectRoot" -ForegroundColor Cyan

# Load .env.local if it exists
$envLocalPath = Join-Path $projectRoot ".env.local"
if (Test-Path $envLocalPath) {
    Write-Host "Loading .env.local..." -ForegroundColor Cyan
    Get-Content $envLocalPath | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)\s*=\s*(.*)\s*$') {
            $key = $matches[1].Trim()
            $val = $matches[2].Trim().Trim('"').Trim("'")
            if ($val -like "<*>" -or $val -eq "<same-as-above>" -or [string]::IsNullOrEmpty($val)) {
                return
            }
            [Environment]::SetEnvironmentVariable($key, $val)
        }
    }
}

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
                $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
                $response.Headers.Add("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
                $response.StatusCode = 200
                $response.Close()
                continue
            }

            # Handle /api/config
            if ($urlPath -eq "/api/config") {
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.ContentType = "application/json"

                $response.StatusCode = 200
                # Always use demo mode for local server
                $resBody = '{"supabaseUrl":"","supabaseAnonKey":"","enableDemoTools":true,"zeroCostLaunchMode":true}'
                
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes($resBody)
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
            
            # Resolve real file path on disk (from project root)
            $filePath = Join-Path $projectRoot $urlPath.Replace("/", "\")
            
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
                elseif ($ext -eq ".webmanifest") { $mime = "application/manifest+json" }
                
                $response.ContentType = $mime
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
            if ($null -ne $response) {
                try { $response.Close() } catch {}
            }
        }
    }
} catch {
    Write-Error $_
} finally {
    $listener.Close()
}
