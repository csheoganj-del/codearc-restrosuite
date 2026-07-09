@echo off
REM ============================================================
REM  RestroSuite - deploy the billing + licensing functions
REM  Double-click this AFTER you have run:  supabase login
REM  (Database changes are done separately in the Supabase
REM   website SQL Editor - see the chat steps.)
REM ============================================================
echo.
echo ==== Deploying license-lease ====
supabase functions deploy license-lease
echo.
echo ==== Deploying tenant-admin ====
supabase functions deploy tenant-admin
echo.
echo ==== Deploying razorpay-route ====
supabase functions deploy razorpay-route
echo.
echo ==== Deploying razorpay-webhook ====
supabase functions deploy razorpay-webhook
echo.
echo ==== All done. You can close this window. ====
pause
