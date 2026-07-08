-- ============================================================
-- Migration: 20260707170000_snake_case_trigger_rebuild
--
-- After 20260707160000 renamed doppio_pending_orders."tableNumber"
-- to table_number, the auto table-session trigger must read the new
-- snake_case column. Recreates on_order_inserted_or_deleted() to use
-- NEW.table_number / OLD.table_number.
-- ============================================================

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
    v_table_num := public.rs_normalize_table_key(NEW.table_number);
    v_tenant_id := NEW.tenant_id;
    IF v_table_num = '' OR v_table_num IN ('takeaway', 'walkin', 'walkintakeaway') OR v_table_num LIKE 'delivery%' THEN
      RETURN NEW;
    END IF;

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
    v_table_num := public.rs_normalize_table_key(OLD.table_number);
    v_tenant_id := OLD.tenant_id;
    IF v_table_num = '' OR v_table_num IN ('takeaway', 'walkin', 'walkintakeaway') OR v_table_num LIKE 'delivery%' THEN
      RETURN OLD;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.doppio_pending_orders
      WHERE tenant_id = v_tenant_id
        AND public.rs_normalize_table_key(table_number) = v_table_num
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
