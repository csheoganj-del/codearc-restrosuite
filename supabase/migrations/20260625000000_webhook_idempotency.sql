-- ============================================================
-- RestroSuite — Razorpay Webhook Idempotency
-- Required by supabase/functions/razorpay-webhook/index.ts
-- Razorpay retries delivery on any non-2xx response. This table lets the
-- webhook function detect and short-circuit duplicate deliveries, so that a
-- transient DB error cannot cause double-processing of stateful events
-- (e.g. suspending a tenant twice, or replaying subscription.charged).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.processed_webhook_events (
  event_id      text PRIMARY KEY,           -- the Razorpay event id (globally unique)
  processed_at  timestamptz NOT NULL DEFAULT now()
);

-- Row-Level Security: webhook events are internal plumbing, never read by
-- tenants. Service-role (used by the edge function) bypasses RLS anyway, so
-- we lock it down completely for anon/authenticated roles.
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhook_events FORCE ROW LEVEL SECURITY;

-- Keep the table small: purge events older than 30 days. Razorpay's retry
-- window is at most ~3 days, so 30 days is generous. Run as a cron or
-- pg_cron job, or periodically via the SQL editor.
CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
  ON public.processed_webhook_events (processed_at);

SELECT 'Webhook idempotency table ready ✓' AS result;
