CREATE TABLE IF NOT EXISTS public.saas_plans (
    plan_code text PRIMARY KEY,
    name text NOT NULL,
    max_staff integer NOT NULL CHECK (max_staff > 0),
    monthly_order_limit integer NOT NULL CHECK (monthly_order_limit > 0),
    allowed_tabs text[] NOT NULL DEFAULT ARRAY[]::text[],
    support_level text NOT NULL DEFAULT 'standard',
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.saas_plans (
    plan_code,
    name,
    max_staff,
    monthly_order_limit,
    allowed_tabs,
    support_level
)
VALUES
    (
        'starter',
        'Starter',
        5,
        300,
        ARRAY['pos-tab', 'qr-orders-tab', 'bills-tab', 'inventory-tab', 'editor-tab', 'kds-tab', 'tokens-tab', 'employees-tab', 'growth-hub-tab']::text[],
        'standard'
    ),
    (
        'growth',
        'Growth',
        15,
        8000,
        ARRAY['pos-tab', 'qr-orders-tab', 'bills-tab', 'inventory-tab', 'reports-tab', 'editor-tab', 'crm-tab', 'tax-tab', 'online-tab', 'kds-tab', 'tokens-tab', 'employees-tab', 'growth-hub-tab']::text[],
        'priority'
    ),
    (
        'enterprise',
        'Enterprise',
        75,
        100000,
        ARRAY['pos-tab', 'qr-orders-tab', 'bills-tab', 'inventory-tab', 'reports-tab', 'editor-tab', 'crm-tab', 'tax-tab', 'online-tab', 'kds-tab', 'tokens-tab', 'employees-tab', 'growth-hub-tab']::text[],
        'enterprise'
    )
ON CONFLICT (plan_code) DO UPDATE
SET
    name = EXCLUDED.name,
    max_staff = EXCLUDED.max_staff,
    monthly_order_limit = EXCLUDED.monthly_order_limit,
    allowed_tabs = EXCLUDED.allowed_tabs,
    support_level = EXCLUDED.support_level;

ALTER TABLE public.saas_tenants
ADD COLUMN IF NOT EXISTS plan_code text NOT NULL DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamp with time zone;

ALTER TABLE public.saas_tenants
DROP CONSTRAINT IF EXISTS saas_tenants_plan_code_fkey;

ALTER TABLE public.saas_tenants
ADD CONSTRAINT saas_tenants_plan_code_fkey
FOREIGN KEY (plan_code) REFERENCES public.saas_plans(plan_code);

ALTER TABLE public.saas_tenants
DROP CONSTRAINT IF EXISTS saas_tenants_subscription_status_check;

ALTER TABLE public.saas_tenants
ADD CONSTRAINT saas_tenants_subscription_status_check
CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled'));

UPDATE public.saas_tenants
SET
    plan_code = COALESCE(NULLIF(plan_code, ''), 'starter'),
    subscription_status = COALESCE(NULLIF(subscription_status, ''), 'active');

ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plans FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_plans FROM anon, authenticated;
