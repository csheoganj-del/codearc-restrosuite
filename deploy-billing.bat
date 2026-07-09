@echo off
REM ============================================================
REM  RestroSuite - deploy the billing + licensing functions
REM  Double-click this AFTER you have run:  supabase login
REM  --no-verify-jwt: these functions use the app's own login
REM  token (not a Supabase JWT), so the gateway check must be off.
REM ============================================================
echo.
echo ==== Deploying license-lease ====
supabase functions deploy license-lease --no-verify-jwt
echo.
echo ==== Deploying tenant-admin ====
supabase functions deploy tenant-admin --no-verify-jwt
echo.
echo ==== Deploying razorpay-route ====
supabase functions deploy razorpay-route --no-verify-jwt
echo.
echo ==== Deploying razorpay-webhook ====
supabase functions deploy razorpay-webhook --no-verify-jwt
echo.
echo ==== All done. You can close this window. ====
pause
