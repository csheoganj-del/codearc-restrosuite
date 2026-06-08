-- Growth Hub modules: support, onboarding, SaaS billing records, reservations,
-- procurement, costing, offers, refund approvals, device setup, backups,
-- multi-outlet readiness, and migration tracking.

CREATE TABLE IF NOT EXISTS public.doppio_support_tickets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    subject text NOT NULL,
    category text NOT NULL DEFAULT 'general',
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'waiting', 'resolved')),
    last_message text,
    attachment_note text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doppio_onboarding_tasks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    task_key text NOT NULL,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    completed_at timestamp with time zone,
    UNIQUE (tenant_id, task_key)
);

CREATE TABLE IF NOT EXISTS public.doppio_reservations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    guest_name text NOT NULL,
    phone text,
    party_size integer NOT NULL DEFAULT 2 CHECK (party_size > 0),
    reserved_for timestamp with time zone NOT NULL,
    table_number text,
    status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'seated', 'cancelled', 'no_show')),
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doppio_vendors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    phone text,
    email text,
    gst_number text,
    category text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doppio_purchase_orders (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    vendor_name text NOT NULL,
    item_name text NOT NULL,
    quantity numeric NOT NULL DEFAULT 0,
    unit text NOT NULL DEFAULT 'unit',
    expected_cost numeric NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ordered', 'received', 'cancelled')),
    due_date date,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doppio_item_costs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    item_name text NOT NULL,
    menu_price numeric NOT NULL DEFAULT 0,
    estimated_cost numeric NOT NULL DEFAULT 0,
    target_margin_percent numeric NOT NULL DEFAULT 65,
    UNIQUE (tenant_id, item_name)
);

CREATE TABLE IF NOT EXISTS public.doppio_offers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    code text NOT NULL,
    title text NOT NULL,
    discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'amount')),
    discount_value numeric NOT NULL DEFAULT 0,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.doppio_refund_requests (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    order_id text NOT NULL,
    amount numeric NOT NULL DEFAULT 0,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    manager_note text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    decided_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.doppio_device_setups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    device_type text NOT NULL DEFAULT 'printer',
    device_name text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'tested', 'failed')),
    last_test_at timestamp with time zone,
    notes text
);

CREATE TABLE IF NOT EXISTS public.doppio_backup_snapshots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    label text NOT NULL,
    backup_version text NOT NULL DEFAULT '2.0',
    scope text NOT NULL DEFAULT 'full',
    status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'restored', 'archived')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.doppio_outlets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    outlet_name text NOT NULL,
    outlet_code text NOT NULL,
    address text,
    manager_name text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    UNIQUE (tenant_id, outlet_code)
);

CREATE TABLE IF NOT EXISTS public.doppio_migration_status (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    version text NOT NULL,
    status text NOT NULL DEFAULT 'complete' CHECK (status IN ('pending', 'complete', 'failed')),
    notes text,
    applied_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, version)
);

CREATE TABLE IF NOT EXISTS public.doppio_saas_invoices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    invoice_number text NOT NULL,
    plan_code text NOT NULL DEFAULT 'starter',
    amount numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'INR',
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'paid', 'failed', 'void')),
    due_date date,
    paid_at timestamp with time zone,
    provider_reference text,
    UNIQUE (tenant_id, invoice_number)
);

DO $$
DECLARE
    table_name text;
    growth_tables text[] := ARRAY[
        'doppio_support_tickets',
        'doppio_onboarding_tasks',
        'doppio_reservations',
        'doppio_vendors',
        'doppio_purchase_orders',
        'doppio_item_costs',
        'doppio_offers',
        'doppio_refund_requests',
        'doppio_device_setups',
        'doppio_backup_snapshots',
        'doppio_outlets',
        'doppio_migration_status',
        'doppio_saas_invoices'
    ];
BEGIN
    FOREACH table_name IN ARRAY growth_tables
    LOOP
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', table_name || '_tenant_idx', table_name);
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
    END LOOP;
END $$;

UPDATE public.saas_plans
SET allowed_tabs = ARRAY(
    SELECT DISTINCT tab
    FROM unnest(allowed_tabs || ARRAY['growth-hub-tab']::text[]) AS tab
)
WHERE NOT ('growth-hub-tab' = ANY(allowed_tabs));
