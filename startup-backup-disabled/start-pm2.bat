@echo off
:: Wait for 10 seconds to ensure the internet connection is fully active before starting
timeout /t 10 /nobreak > NUL
pm2 resurrect
