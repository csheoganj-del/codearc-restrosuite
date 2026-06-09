-- Base tenant registry. All operational tables depend on this migration.

CREATE TABLE IF NOT EXISTS public.saas_tenants (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    outlet_type text DEFAULT 'cafe',
    email text,
    phone text,
    username text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    allowed_tabs text[] NOT NULL DEFAULT ARRAY[
        'pos-tab', 'qr-orders-tab', 'bills-tab', 'inventory-tab',
        'reports-tab', 'editor-tab', 'crm-tab', 'tax-tab',
        'online-tab', 'kds-tab', 'tokens-tab', 'employees-tab'
    ]::text[],
    data_reset_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.saas_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tenants REPLICA IDENTITY FULL;
REVOKE ALL ON TABLE public.saas_tenants FROM anon, authenticated;
