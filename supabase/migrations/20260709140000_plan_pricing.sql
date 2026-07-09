-- ============================================================================
-- Migration: 20260709140000_plan_pricing
--
-- Moves plan pricing out of hardcoded function bodies and into the saas_plans
-- table so the superadmin can edit prices, currency, and the Razorpay plan id
-- (used for self-serve subscription checkout) without a code deploy.
-- ============================================================================

ALTER TABLE public.saas_plans
  ADD COLUMN IF NOT EXISTS price_monthly    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency         text    NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS billing_interval text    NOT NULL DEFAULT 'monthly',
  -- Razorpay Subscriptions plan id (plan_XXXX) for self-serve checkout. Set per
  -- plan in the Razorpay dashboard, then paste here (superadmin UI or SQL).
  ADD COLUMN IF NOT EXISTS razorpay_plan_id text,
  -- Whether tenants can self-select this plan in the in-app billing panel.
  ADD COLUMN IF NOT EXISTS is_public        boolean NOT NULL DEFAULT true;

-- Seed the current prices (mirrors the previous hardcoded planMonthlyRupees()).
UPDATE public.saas_plans SET price_monthly = 0    WHERE plan_code = 'starter'    AND price_monthly = 0;
UPDATE public.saas_plans SET price_monthly = 1499 WHERE plan_code = 'growth'     AND price_monthly = 0;
UPDATE public.saas_plans SET price_monthly = 4999 WHERE plan_code = 'enterprise' AND price_monthly = 0;

-- A tiny read helper the Edge Functions can use for MRR / display without
-- duplicating the price table. SECURITY DEFINER + service-role only.
CREATE OR REPLACE FUNCTION public.saas_plan_price_monthly(p_plan_code text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT price_monthly FROM public.saas_plans WHERE plan_code = p_plan_code), 0);
$$;

REVOKE ALL ON FUNCTION public.saas_plan_price_monthly(text) FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
