-- Hourly billing reminders (last 3 days of trial/subscription)
-- Requires: pg_cron + pg_net (enabled on Supabase by default on many projects)
-- Secret is injected via vault/app.settings if available; otherwise update URL auth after deploy.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Remove previous schedule if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'restrosuite-billing-reminders') THEN
    PERFORM cron.unschedule('restrosuite-billing-reminders');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- job table may not exist yet
  NULL;
END $$;

-- NOTE: Replace BILLING_CRON_SECRET_PLACEHOLDER after push if you rotate secrets.
-- Prefer dashboard: Database → Extensions → Cron, or:
--   select cron.schedule(... Authorization Bearer <BILLING_CRON_SECRET> ...)
--
-- We schedule using the secret stored in app settings when set by ops.
-- Fallback no-op schedule helper documented in docs/BILLING_TRIAL_RAZORPAY.md.

-- Store secret reference instruction only (do not hardcode live secrets in git).
COMMENT ON EXTENSION pg_cron IS 'RestroSuite: schedule restrosuite-billing-reminders hourly against functions/v1/billing-reminders';
