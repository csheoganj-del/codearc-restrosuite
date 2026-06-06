# Native PowerShell HTTP Server for Doppio Cafe POS
$port = 8001
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
    Write-Host "Doppio Cafe POS server successfully running at: http://localhost:$port/" -ForegroundColor Green
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

            if ($urlPath -eq "/") { $urlPath = "/login.html" }
            
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
