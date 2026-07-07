-- ============================================================
-- Migration: 20260703180000_qr_ordering_hardening
-- Hardening of QR ordering system: table sessions table and triggers
-- ============================================================

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

-- Trigger to open/close table session automatically based on doppio_pending_orders changes.
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
    v_table_num := NEW.table_number;
    v_tenant_id := NEW.tenant_id;
    -- Ignore takeaway/walk-in or empty table numbers
    IF v_table_num IS NULL OR lower(trim(v_table_num)) = 'takeaway' OR lower(trim(v_table_num)) = 'walk-in' OR lower(trim(v_table_num)) = '' THEN
      RETURN NEW;
    END IF;

    -- Check if active session exists
    SELECT EXISTS (
      SELECT 1 FROM public.doppio_table_sessions
      WHERE tenant_id = v_tenant_id AND table_number = v_table_num AND status = 'active'
    ) INTO v_session_exists;

    IF NOT v_session_exists THEN
      -- Generate random session token
      v_random_token := md5(random()::text || clock_timestamp()::text);
      
      -- Insert or update session to active
      INSERT INTO public.doppio_table_sessions (tenant_id, table_number, session_token, status, created_at, closed_at)
      VALUES (v_tenant_id, v_table_num, v_random_token, 'active', now(), NULL)
      ON CONFLICT (tenant_id, table_number)
      DO UPDATE SET session_token = v_random_token, status = 'active', created_at = now(), closed_at = NULL;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_table_num := OLD.table_number;
    v_tenant_id := OLD.tenant_id;
    IF v_table_num IS NULL OR lower(trim(v_table_num)) = 'takeaway' OR lower(trim(v_table_num)) = 'walk-in' OR lower(trim(v_table_num)) = '' THEN
      RETURN OLD;
    END IF;

    -- Check if there are other pending orders for this table
    SELECT EXISTS (
      SELECT 1 FROM public.doppio_pending_orders
      WHERE tenant_id = v_tenant_id AND table_number = v_table_num AND id <> OLD.id
        AND (status = 'Pending Review' OR status = 'Accepted' OR status = 'preparing' OR status = 'served' OR status = 'Ready' OR status = 'DineIn Active' OR status = 'Billed')
    ) INTO v_has_pending;

    IF NOT v_has_pending THEN
      -- Mark session as closed
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
