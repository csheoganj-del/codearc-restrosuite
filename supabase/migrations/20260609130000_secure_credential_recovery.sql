ALTER TABLE public.saas_tenants
  ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.tenant_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  requested_ip_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_password_resets_tenant_created_idx
  ON public.tenant_password_resets (tenant_id, created_at DESC);

ALTER TABLE public.tenant_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_password_resets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_password_resets FROM anon, authenticated;
