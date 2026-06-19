-- Multi-Tenant SaaS DB Migration Script
-- Run this in your Supabase SQL Editor to transform your tables.

-- 1. Create the tenants table
CREATE TABLE IF NOT EXISTS public.saas_tenants (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    outlet_type text DEFAULT 'cafe',
    email text,
    phone text,
    username text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    status text DEFAULT 'pending',
    allowed_tabs text[] DEFAULT ARRAY['pos-tab', 'qr-orders-tab', 'bills-tab', 'inventory-tab', 'reports-tab', 'editor-tab', 'crm-tab', 'tax-tab', 'online-tab', 'kds-tab', 'tokens-tab', 'employees-tab']::text[],
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.saas_tenants
ADD COLUMN IF NOT EXISTS data_reset_at timestamp with time zone;

-- Production hardening:
-- Keep this table private and route tenant login/registration through backend functions.
ALTER TABLE public.saas_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tenants REPLICA IDENTITY FULL;

-- 2. Insert first-party seed tenant to preserve existing data on upgrade migrations
-- SECURITY: The password_hash below is intentionally set to an INVALID/LOCKED value (32 x '*').
-- This prevents any login with a default password. You MUST set a real password via the
-- Supabase Dashboard (or superadmin reset flow) before any tenant can log in.
-- Run:  UPDATE public.saas_tenants SET password_hash = '<pbkdf2-hash>' WHERE username = 'admin';
INSERT INTO public.saas_tenants (id, name, slug, outlet_type, email, username, password_hash, status)
VALUES (
  'd290f1ee-6c54-4b01-90e6-d701748f0851',
  'Doppio Cafe Nagpur',
  'doppio-nagpur',
  'cafe',
  'hello@codearc.co.in',
  'admin',
  '********************************LOCKED_NO_DEFAULT_PASSWORD********************************',
  'pending'
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Helper procedure to safely add tenant_id to all tables
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'doppio_business_profile',
        'doppio_menu',
        'doppio_inventory',
        'doppio_bills',
        'doppio_pending_orders',
        'doppio_shifts',
        'doppio_shift_events',
        'doppio_employees',
        'doppio_leave_requests',
        'doppio_attendance',
        'doppio_crm',
        'doppio_inventory_batches',
        'doppio_notifications',
        'doppio_custom_recipes',
        'doppio_inventory_thresholds',
        'doppio_pos_popularity',
        'doppio_draft_orders'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id') THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE', t);
                EXECUTE format('UPDATE public.%I SET tenant_id = ''d290f1ee-6c54-4b01-90e6-d701748f0851'' WHERE tenant_id IS NULL', t);
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT ''d290f1ee-6c54-4b01-90e6-d701748f0851''', t);
            END IF;
        END IF;
    END LOOP;
END $$;

-- Remove any previously permissive policies from early client-side prototypes.
DROP POLICY IF EXISTS "Public can read tenant directory" ON public.saas_tenants;
DROP POLICY IF EXISTS "Public can insert tenant registrations" ON public.saas_tenants;
DROP POLICY IF EXISTS "Public can update tenants" ON public.saas_tenants;
DROP POLICY IF EXISTS "Public can delete tenants" ON public.saas_tenants;
DROP POLICY IF EXISTS "Allow public read" ON public.saas_tenants;
DROP POLICY IF EXISTS "Allow public insert" ON public.saas_tenants;
DROP POLICY IF EXISTS "Allow public update" ON public.saas_tenants;
DROP POLICY IF EXISTS "Allow public delete" ON public.saas_tenants;

-- 4. Lock down tenant-owned operational tables.
-- Browser clients must use tenant-access, tenant-data, tenant-public, or tenant-admin edge functions.
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'doppio_business_profile',
        'doppio_menu',
        'doppio_inventory',
        'doppio_bills',
        'doppio_pending_orders',
        'doppio_shifts',
        'doppio_shift_events',
        'doppio_employees',
        'doppio_leave_requests',
        'doppio_attendance',
        'doppio_crm',
        'doppio_inventory_batches',
        'doppio_notifications',
        'doppio_custom_recipes',
        'doppio_inventory_thresholds',
        'doppio_pos_popularity',
        'doppio_draft_orders'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
            EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Enable all for anon" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Public can read" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Public can insert" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Public can update" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Public can delete" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Allow public access" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Public Read Access" ON public.%I', t);
            EXECUTE format('DROP POLICY IF EXISTS "Public Write Access" ON public.%I', t);
        END IF;
    END LOOP;
END $$;

-- 5. Enable Supabase Realtime for the saas_tenants table to push live registrations/updates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'saas_tenants'
    ) THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.saas_tenants';
    END IF;
END $$;

-- 6. Add dues column to customer table
ALTER TABLE public.doppio_crm ADD COLUMN IF NOT EXISTS dues numeric NOT NULL DEFAULT 0;

