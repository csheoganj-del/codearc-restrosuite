-- ============================================================================
-- Migration: 20260709120000_license_lease_backstop
--
-- Server-side support for the offline-lease licensing system.
--
-- Context / why this shape:
--   Every doppio_* table already has FORCE ROW LEVEL SECURITY with NO
--   anon/authenticated policies (see 20260613000000_enable_rls_doppio_tables).
--   The app never touches those tables directly from the browser — all CRUD
--   goes through the service-role Edge Functions (tenant-data / tenant-access),
--   which ALREADY reject any tenant whose subscription_status is not
--   'active'/'trialing' (tenant-data verifyTenantSession, tenant-access login &
--   validate_session). Realtime uses server-triggered *broadcast*, not table
--   CDC, so it also never bypasses those functions.
--
--   Because of that, adding per-tenant "subscription" RLS policies would be
--   dead code: the anon JWT carries no tenant identity (auth is custom HMAC
--   session tokens, not Supabase Auth users), so a policy could not tell which
--   tenant a row belongs to. The real, functional server backstop is therefore
--   (a) the existing function-level checks, and (b) the objects below.
--
-- This migration adds:
--   1. saas_tenant_is_active(uuid)  — one source of truth for "may this tenant
--      operate right now", including the subscription_current_period_end check
--      that the functions can adopt to move from grace to strict.
--   2. saas_license_devices         — per-device registry giving you a real
--      kill switch (revoke one device) and a lease-issuance audit trail.
-- ============================================================================

-- 1. Canonical "is this tenant allowed to operate" predicate ----------------
--    Grace-first by default: a tenant is active if approved AND status is
--    active/trialing. Set p_strict => also require the paid period to not have
--    lapsed (subscription_current_period_end in the future). The license-lease
--    Edge Function calls this in strict mode so leases stop the moment the
--    paid period ends; the CRUD functions can stay grace until you choose to
--    tighten them.
CREATE OR REPLACE FUNCTION public.saas_tenant_is_active(
  p_tenant_id uuid,
  p_strict boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.saas_tenants t
    WHERE t.id = p_tenant_id
      AND t.status = 'approved'
      AND t.subscription_status IN ('active', 'trialing')
      AND (
        NOT p_strict
        OR t.subscription_current_period_end IS NULL
        OR t.subscription_current_period_end > now()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.saas_tenant_is_active(uuid, boolean) FROM anon, authenticated;

-- 2. Per-device registry: lease audit + kill switch -------------------------
CREATE TABLE IF NOT EXISTS public.saas_license_devices (
  tenant_id       uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  device_id       text NOT NULL,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_lease_at   timestamptz NOT NULL DEFAULT now(),
  lease_count     integer NOT NULL DEFAULT 0,
  last_plan       text,
  last_ip_hash    text,
  -- Flip to true to instantly deny new leases to this one device. The device
  -- keeps working only until its current lease expires (<= one offline window),
  -- then locks and cannot renew.
  revoked         boolean NOT NULL DEFAULT false,
  revoked_at      timestamptz,
  revoked_reason  text,
  PRIMARY KEY (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS saas_license_devices_tenant_idx
  ON public.saas_license_devices (tenant_id);

CREATE INDEX IF NOT EXISTS saas_license_devices_revoked_idx
  ON public.saas_license_devices (revoked)
  WHERE revoked = true;

-- Service-role only. No direct client access (mirrors the doppio_* tables).
ALTER TABLE public.saas_license_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_license_devices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_license_devices FROM anon, authenticated;

-- Convenience view for support: which devices are live vs revoked per outlet.
CREATE OR REPLACE VIEW public.saas_license_device_overview AS
  SELECT
    d.tenant_id,
    t.name        AS tenant_name,
    t.slug        AS tenant_slug,
    d.device_id,
    d.last_plan,
    d.lease_count,
    d.first_seen_at,
    d.last_lease_at,
    d.revoked,
    d.revoked_at,
    d.revoked_reason,
    (now() - d.last_lease_at) AS since_last_lease
  FROM public.saas_license_devices d
  JOIN public.saas_tenants t ON t.id = d.tenant_id;

REVOKE ALL ON public.saas_license_device_overview FROM anon, authenticated;

-- 3. Atomic lease registration (upsert + increment) called by license-lease.
CREATE OR REPLACE FUNCTION public.saas_register_lease(
  p_tenant_id uuid,
  p_device_id text,
  p_plan text DEFAULT NULL,
  p_ip_hash text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.saas_license_devices AS d
    (tenant_id, device_id, first_seen_at, last_lease_at, lease_count, last_plan, last_ip_hash)
  VALUES
    (p_tenant_id, p_device_id, now(), now(), 1, p_plan, p_ip_hash)
  ON CONFLICT (tenant_id, device_id) DO UPDATE
    SET last_lease_at = now(),
        lease_count   = d.lease_count + 1,
        last_plan     = COALESCE(EXCLUDED.last_plan, d.last_plan),
        last_ip_hash  = COALESCE(EXCLUDED.last_ip_hash, d.last_ip_hash);
$$;

REVOKE ALL ON FUNCTION public.saas_register_lease(uuid, text, text, text) FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
