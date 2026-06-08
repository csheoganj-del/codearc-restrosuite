CREATE TABLE IF NOT EXISTS public.app_error_reports (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid REFERENCES public.saas_tenants(id) ON DELETE SET NULL,
    tenant_slug text,
    severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    source text NOT NULL CHECK (source IN ('dashboard', 'customer', 'login', 'android', 'gateway')),
    message text NOT NULL,
    stack text,
    url_path text,
    app_version text,
    user_agent text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    resolved_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_error_reports_created_idx
    ON public.app_error_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS app_error_reports_tenant_created_idx
    ON public.app_error_reports (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS app_error_reports_status_created_idx
    ON public.app_error_reports (status, created_at DESC);

ALTER TABLE public.app_error_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_error_reports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_error_reports FROM anon, authenticated;
