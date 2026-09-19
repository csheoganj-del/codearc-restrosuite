-- RestroSuite paid-lock hardening
-- Idempotent captured-payment ledger + Razorpay ids on bills.
-- Service-role only (edge functions). Tenants never read these rows directly.

CREATE TABLE IF NOT EXISTS public.saas_captured_payments (
  payment_id   text PRIMARY KEY,
  tenant_id    uuid REFERENCES public.saas_tenants(id) ON DELETE SET NULL,
  purpose      text NOT NULL DEFAULT 'generic',
  order_id     text,
  amount_paise bigint,
  meta         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_captured_payments_tenant_idx
  ON public.saas_captured_payments (tenant_id, created_at DESC);

ALTER TABLE public.saas_captured_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_captured_payments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_captured_payments FROM anon, authenticated;

ALTER TABLE public.doppio_bills
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_order_id text;

CREATE UNIQUE INDEX IF NOT EXISTS doppio_bills_razorpay_payment_uidx
  ON public.doppio_bills (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS saas_invoices_payment_uidx
  ON public.saas_invoices (payment_id)
  WHERE payment_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
