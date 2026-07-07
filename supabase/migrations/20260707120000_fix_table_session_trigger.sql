-- ============================================================
-- Migration: 20260707120000_fix_table_session_trigger
-- Fixes two launch-blocking QR-ordering bugs found in the
-- 2026-07-07 live QA audit:
--
-- 1. The on_order_inserted_or_deleted() trigger referenced
--    NEW.table_number / OLD.table_number, but the column on
--    doppio_pending_orders is the camelCase "tableNumber".
--    Every INSERT/DELETE on doppio_pending_orders therefore
--    raised `record "new" has no field "table_number"`,
--    aborting the write: KOTs never reached the cloud and
--    table sessions were never opened, so scanning a table QR
--    always showed "Table Session Closed".
--
-- 2. Session lookups (tenant-public get_active_session)
--    normalize the table key ("Table 05" -> "5") but sessions
--    were stored with raw labels like "Table 5", so even
--    manually opened sessions could never be found. Sessions
--    are now stored using the same normalized key.
-- ============================================================

-- Self-contained: production never got the 20260703180000 migration
-- (the table itself was missing), so create it here if needed.
CREATE TABLE IF NOT EXISTS public.doppio_table_sessions (
    id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id         uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE NOT NULL,
    table_number      text NOT NULL,
    session_token     text NOT NULL,
    status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
    created_at        timestamptz DEFAULT now(),
    closed_at         timestamptz,
    last_order_at     timestamptz,
    UNIQUE (tenant_id, table_number)
);

ALTER TABLE public.doppio_table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doppio_table_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_all" ON public.doppio_table_sessions;
CREATE POLICY "deny_anon_all" ON public.doppio_table_sessions
    AS RESTRICTIVE FOR ALL TO anon USING (false);

-- Normalizer mirroring normalizeTableKey() in
-- supabase/functions/tenant-public/index.ts
CREATE OR REPLACE FUNCTION public.rs_normalize_table_key(raw text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  key text;
BEGIN
  key := lower(trim(coalesce(raw, '')));
  IF key = '' THEN
    RETURN '';
  END IF;
  key := regexp_replace(key, '\mtable\M|\mtbl\M', '', 'g');
  key := regexp_replace(key, '[^a-z0-9]', '', 'g');
  -- "t5" -> "5" (single leading t used as table shorthand)
  IF key ~ '^t[0-9]+$' THEN
    key := substr(key, 2);
  END IF;
  -- strip leading zeros on pure numbers: "05" -> "5"
  IF key ~ '^[0-9]+$' THEN
    key := ltrim(key, '0');
    IF key = '' THEN
      key := '0';
    END IF;
  END IF;
  RETURN key;
END;
$$;

-- Normalize existing session rows so old sessions stay reachable.
-- Skip rows whose normalized key would collide with an existing row
-- (UNIQUE (tenant_id, table_number)).
UPDATE public.doppio_table_sessions s
SET table_number = public.rs_normalize_table_key(s.table_number)
WHERE s.table_number <> public.rs_normalize_table_key(s.table_number)
  AND public.rs_normalize_table_key(s.table_number) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.doppio_table_sessions s2
    WHERE s2.tenant_id = s.tenant_id
      AND s2.table_number = public.rs_normalize_table_key(s.table_number)
      AND s2.id <> s.id
  );

CREATE OR REPLACE FUNCTION public.on_order_inserted_or_deleted()
RETURNS TRIGGER AS $$
DECLARE
  v_session_exists boolean;
  v_has_pending boolean;
  v_random_token text;
  v_table_num text;
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Column is camelCase "tableNumber" (was NEW.table_number, which
    -- does not exist and aborted every insert)
    v_table_num := public.rs_normalize_table_key(NEW."tableNumber");
    v_tenant_id := NEW.tenant_id;
    -- Ignore takeaway/walk-in/delivery or empty table numbers
    IF v_table_num = '' OR v_table_num IN ('takeaway', 'walkin', 'walkintakeaway') OR v_table_num LIKE 'delivery%' THEN
      RETURN NEW;
    END IF;

    -- Check if active session exists
    SELECT EXISTS (
      SELECT 1 FROM public.doppio_table_sessions
      WHERE tenant_id = v_tenant_id AND table_number = v_table_num AND status = 'active'
    ) INTO v_session_exists;

    IF NOT v_session_exists THEN
      v_random_token := md5(random()::text || clock_timestamp()::text);

      INSERT INTO public.doppio_table_sessions (tenant_id, table_number, session_token, status, created_at, closed_at, last_order_at)
      VALUES (v_tenant_id, v_table_num, v_random_token, 'active', now(), NULL, now())
      ON CONFLICT (tenant_id, table_number)
      DO UPDATE SET session_token = v_random_token, status = 'active', created_at = now(), closed_at = NULL, last_order_at = now();
    ELSE
      UPDATE public.doppio_table_sessions
      SET last_order_at = now()
      WHERE tenant_id = v_tenant_id AND table_number = v_table_num AND status = 'active';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_table_num := public.rs_normalize_table_key(OLD."tableNumber");
    v_tenant_id := OLD.tenant_id;
    IF v_table_num = '' OR v_table_num IN ('takeaway', 'walkin', 'walkintakeaway') OR v_table_num LIKE 'delivery%' THEN
      RETURN OLD;
    END IF;

    -- Check if there are other pending orders for this table
    SELECT EXISTS (
      SELECT 1 FROM public.doppio_pending_orders
      WHERE tenant_id = v_tenant_id
        AND public.rs_normalize_table_key("tableNumber") = v_table_num
        AND id <> OLD.id
        AND (status = 'Pending Review' OR status = 'Accepted' OR status = 'preparing' OR status = 'served' OR status = 'Ready' OR status = 'DineIn Active' OR status = 'Billed')
    ) INTO v_has_pending;

    IF NOT v_has_pending THEN
      UPDATE public.doppio_table_sessions
      SET status = 'closed', closed_at = now()
      WHERE tenant_id = v_tenant_id AND table_number = v_table_num AND status = 'active';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_on_order_inserted_or_deleted ON public.doppio_pending_orders;
CREATE TRIGGER trg_on_order_inserted_or_deleted
  AFTER INSERT OR DELETE ON public.doppio_pending_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_inserted_or_deleted();

NOTIFY pgrst, 'reload schema';
