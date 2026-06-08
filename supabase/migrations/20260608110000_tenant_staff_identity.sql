CREATE TABLE IF NOT EXISTS public.tenant_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    employee_id text,
    username text NOT NULL,
    username_normalized text NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'cashier', 'kitchen', 'waiter', 'customer_display')),
    allowed_tabs text[] NOT NULL DEFAULT ARRAY[]::text[],
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
    last_login_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, username_normalized)
);

CREATE INDEX IF NOT EXISTS tenant_users_tenant_id_idx
    ON public.tenant_users (tenant_id);

CREATE TABLE IF NOT EXISTS public.tenant_audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    actor_user_id uuid REFERENCES public.tenant_users(id) ON DELETE SET NULL,
    actor_username text NOT NULL,
    actor_role text NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_audit_logs_tenant_created_idx
    ON public.tenant_audit_logs (tenant_id, created_at DESC);

ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_audit_logs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_users FROM anon, authenticated;
REVOKE ALL ON TABLE public.tenant_audit_logs FROM anon, authenticated;

INSERT INTO public.tenant_users (
    tenant_id,
    username,
    username_normalized,
    display_name,
    password_hash,
    role,
    allowed_tabs,
    status
)
SELECT
    id,
    username,
    lower(trim(username)),
    COALESCE(NULLIF(name, ''), username),
    password_hash,
    'admin',
    COALESCE(allowed_tabs, ARRAY[]::text[]),
    CASE WHEN status = 'approved' THEN 'active' ELSE 'suspended' END
FROM public.saas_tenants
ON CONFLICT (tenant_id, username_normalized) DO NOTHING;
