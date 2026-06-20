-- Add country column to saas_tenants
ALTER TABLE public.saas_tenants ADD COLUMN IF NOT EXISTS country text;

-- Add tenders and change columns to doppio_bills
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS tenders jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS change numeric DEFAULT 0;
