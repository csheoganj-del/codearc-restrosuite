@echo off
REM ============================================================
REM  RestroSuite - deploy the billing + licensing changes
REM  Double-click this file AFTER you have:
REM    1) run:  supabase login
REM    2) set the secrets (see step 3 in the chat)
REM ============================================================
echo.
echo ==== Pushing database changes ====
supabase db push
echo.
echo ==== Deploying license-lease ====
supabase functions deploy license-lease
echo.
echo ==== Deploying razorpay-route ====
supabase functions deploy razorpay-route
echo.
echo ==== Deploying razorpay-webhook ====
supabase functions deploy razorpay-webhook
echo.
echo ==== Deploying tenant-admin ====
supabase functions deploy tenant-admin
echo.
echo ==== All done. You can close this window. ====
pause
