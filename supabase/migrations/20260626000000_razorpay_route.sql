-- Razorpay Route: per-tenant linked account fields
-- Stores the restaurant's Razorpay linked account ID and onboarding state.
-- Money flows: customer → Razorpay → restaurant's linked account (T+2 settlement).
-- RestroSuite never holds customer funds.

ALTER TABLE public.saas_tenants
  ADD COLUMN IF NOT EXISTS razorpay_account_id   TEXT,          -- acc_xxxxxxxxxxxxxxxxx
  ADD COLUMN IF NOT EXISTS razorpay_route_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS razorpay_kyc_status    TEXT NOT NULL DEFAULT 'not_started';
  -- kyc_status values: not_started | pending | activated

COMMENT ON COLUMN public.saas_tenants.razorpay_account_id   IS 'Razorpay Route linked account ID (acc_xxx). Set after restaurant completes onboarding.';
COMMENT ON COLUMN public.saas_tenants.razorpay_route_enabled IS 'Whether Razorpay Route is active for this tenant. Only true when kyc_status = activated.';
COMMENT ON COLUMN public.saas_tenants.razorpay_kyc_status    IS 'KYC state from Razorpay: not_started | pending | activated.';
