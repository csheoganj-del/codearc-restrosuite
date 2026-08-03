-- Super-Admin: internal notes + platform WA Ads campaign history (shared across browsers)
-- --------------------------------------------------------------------------

ALTER TABLE public.saas_tenants
  ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.saas_tenants.admin_notes IS
  'Internal Super-Admin notes (support history, onboarding). Never exposed to tenant UI.';

CREATE TABLE IF NOT EXISTS public.saas_platform_ads_campaigns (
  id text PRIMARY KEY,
  label text NOT NULL DEFAULT 'Campaign',
  message_preview text NOT NULL DEFAULT '',
  total integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  pace text NOT NULL DEFAULT 'safe',
  test_only boolean NOT NULL DEFAULT false,
  created_by text NOT NULL DEFAULT 'superadmin',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_platform_ads_campaigns_created_idx
  ON public.saas_platform_ads_campaigns (created_at DESC);

ALTER TABLE public.saas_platform_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_platform_ads_campaigns FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_platform_ads_campaigns FROM anon, authenticated;

COMMENT ON TABLE public.saas_platform_ads_campaigns IS
  'Super-Admin central WhatsApp ads campaign log (platform line). Service-role only.';
