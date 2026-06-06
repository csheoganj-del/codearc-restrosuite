@echo off
:: Navigate to the directory where this batch file is located
cd /d "%~dp0"

:: Start the POS server in the background
powershell -WindowStyle Hidden -Command "Start-Process powershell -ArgumentList '-File Run-server.ps1' -WindowStyle Hidden"

:: Start the WhatsApp Gateway in the background
powershell -WindowStyle Hidden -Command "Start-Process powershell -ArgumentList '-File Run-gateway.ps1' -WindowStyle Hidden"
