-- Add Stripe Connect configuration columns to saas_tenants table
ALTER TABLE public.saas_tenants ADD COLUMN IF NOT EXISTS stripe_account_id TEXT DEFAULT NULL;
ALTER TABLE public.saas_tenants ADD COLUMN IF NOT EXISTS stripe_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.saas_tenants ADD COLUMN IF NOT EXISTS stripe_kyc_status TEXT DEFAULT 'not_started';
