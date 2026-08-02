-- RestroSuite billing: Express / Serve / Command + trial + reminders
-- --------------------------------------------------------------------------
-- Plans (job-based):
--   express  ₹499/mo  — counter billing (front)
--   serve    ₹999/mo  — floor + kitchen (default 30-day trial)
--   command  ₹2499/mo — full back-office + multi-outlet
-- Legacy codes starter/growth/enterprise remain as aliases (same entitlements).
-- --------------------------------------------------------------------------

-- Extra plan columns
ALTER TABLE public.saas_plans
  ADD COLUMN IF NOT EXISTS price_yearly numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS razorpay_plan_id text,
  ADD COLUMN IF NOT EXISTS razorpay_plan_id_yearly text,
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly';

-- Tenant billing / reminder columns
ALTER TABLE public.saas_tenants
  ADD COLUMN IF NOT EXISTS subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_renewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_interval text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_billing_reminder_day integer,
  ADD COLUMN IF NOT EXISTS last_billing_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_billing_reminder_channels jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow expired status (no grace — lock when period ends)
ALTER TABLE public.saas_tenants
  DROP CONSTRAINT IF EXISTS saas_tenants_subscription_status_check;

ALTER TABLE public.saas_tenants
  ADD CONSTRAINT saas_tenants_subscription_status_check
  CHECK (subscription_status IN (
    'trialing', 'active', 'past_due', 'canceled', 'cancelled', 'expired'
  ));

-- New plans
INSERT INTO public.saas_plans (
  plan_code, name, max_staff, monthly_order_limit, allowed_tabs, support_level,
  price_monthly, price_yearly, description, sort_order, is_public
) VALUES
(
  'express',
  'Express',
  3,
  6000,
  ARRAY[
    'pos-tab', 'bills-tab', 'editor-tab', 'tokens-tab', 'customers-tab'
  ]::text[],
  'standard',
  499,
  4999,
  'Counter & takeaway — fast offline billing (front desk).',
  10,
  true
),
(
  'serve',
  'Serve',
  50,
  100000,
  ARRAY[
    'pos-tab', 'floor-tab', 'qr-orders-tab', 'kds-tab', 'bills-tab',
    'editor-tab', 'tokens-tab', 'customers-tab', 'employees-tab',
    'aggregator-tab', 'reports-tab', 'tax-tab'
  ]::text[],
  'priority',
  999,
  9999,
  'Cafe & dine-in — tables, QR ordering, kitchen display.',
  20,
  true
),
(
  'command',
  'Command',
  200,
  1000000,
  ARRAY[
    'pos-tab', 'floor-tab', 'qr-orders-tab', 'kds-tab', 'bills-tab',
    'inventory-tab', 'editor-tab', 'customers-tab', 'tax-tab', 'aggregator-tab',
    'tokens-tab', 'employees-tab', 'growth-hub-tab', 'analytics-tab', 'reports-tab'
  ]::text[],
  'dedicated',
  2499,
  24999,
  'Full restaurant ops — stock, costing, staff, multi-outlet, deep reports.',
  30,
  true
)
ON CONFLICT (plan_code) DO UPDATE SET
  name = EXCLUDED.name,
  max_staff = EXCLUDED.max_staff,
  monthly_order_limit = EXCLUDED.monthly_order_limit,
  allowed_tabs = EXCLUDED.allowed_tabs,
  support_level = EXCLUDED.support_level,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_public = EXCLUDED.is_public;

-- Align legacy plan names/prices to new ladder (aliases keep working)
UPDATE public.saas_plans SET
  name = 'Express (legacy Starter)',
  price_monthly = 499,
  price_yearly = 4999,
  max_staff = 3,
  monthly_order_limit = 6000,
  allowed_tabs = ARRAY['pos-tab', 'bills-tab', 'editor-tab', 'tokens-tab', 'customers-tab']::text[],
  support_level = 'standard',
  sort_order = 11,
  description = 'Legacy alias of Express'
WHERE plan_code = 'starter';

UPDATE public.saas_plans SET
  name = 'Serve (legacy Growth)',
  price_monthly = 999,
  price_yearly = 9999,
  max_staff = 50,
  monthly_order_limit = 100000,
  allowed_tabs = ARRAY[
    'pos-tab', 'floor-tab', 'qr-orders-tab', 'kds-tab', 'bills-tab',
    'editor-tab', 'tokens-tab', 'customers-tab', 'employees-tab',
    'aggregator-tab', 'reports-tab', 'tax-tab'
  ]::text[],
  support_level = 'priority',
  sort_order = 21,
  description = 'Legacy alias of Serve'
WHERE plan_code = 'growth';

UPDATE public.saas_plans SET
  name = 'Command (legacy Enterprise)',
  price_monthly = 2499,
  price_yearly = 24999,
  max_staff = 200,
  monthly_order_limit = 1000000,
  allowed_tabs = ARRAY[
    'pos-tab', 'floor-tab', 'qr-orders-tab', 'kds-tab', 'bills-tab',
    'inventory-tab', 'editor-tab', 'customers-tab', 'tax-tab', 'aggregator-tab',
    'tokens-tab', 'employees-tab', 'growth-hub-tab', 'analytics-tab', 'reports-tab'
  ]::text[],
  support_level = 'dedicated',
  sort_order = 31,
  description = 'Legacy alias of Command'
WHERE plan_code = 'enterprise';

-- Hide free from public self-serve if present
UPDATE public.saas_plans SET is_public = false, sort_order = 90 WHERE plan_code = 'free';

-- Reminder / payment audit log
CREATE TABLE IF NOT EXISTS public.saas_billing_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_billing_events_tenant_idx
  ON public.saas_billing_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS saas_tenants_period_end_idx
  ON public.saas_tenants (subscription_current_period_end)
  WHERE subscription_status IN ('trialing', 'active', 'past_due');

COMMENT ON COLUMN public.saas_tenants.last_billing_reminder_day IS
  'Days-left bucket when last reminder was sent (3, 2, or 1). Prevents duplicate same-day spam.';
