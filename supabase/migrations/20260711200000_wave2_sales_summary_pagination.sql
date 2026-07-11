-- Wave 2 remainder: server sales summary for reports (no 500-row client cap)

CREATE OR REPLACE FUNCTION public.rs_sales_summary(
  p_tenant_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days int := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_cutoff timestamptz := now() - (v_days || ' days')::interval;
  v_revenue numeric := 0;
  v_orders int := 0;
  v_gst numeric := 0;
  v_refunds int := 0;
  v_refund_amount numeric := 0;
  v_pay jsonb := '{}'::jsonb;
  v_daily jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;

  -- Prefer created_at; fall back to date_time parse when needed
  SELECT
    COALESCE(SUM(CASE WHEN lower(COALESCE(status,'paid')) <> 'refunded' THEN COALESCE(total, 0) ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE lower(COALESCE(status,'paid')) <> 'refunded'),
    COALESCE(SUM(CASE WHEN lower(COALESCE(status,'paid')) <> 'refunded' THEN COALESCE(gst, 0) ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE lower(COALESCE(status,'paid')) = 'refunded'),
    COALESCE(SUM(CASE WHEN lower(COALESCE(status,'paid')) = 'refunded' THEN COALESCE(total, 0) ELSE 0 END), 0)
  INTO v_revenue, v_orders, v_gst, v_refunds, v_refund_amount
  FROM public.doppio_bills
  WHERE tenant_id = p_tenant_id
    AND created_at >= v_cutoff;

  SELECT COALESCE(jsonb_object_agg(pay_method, amt), '{}'::jsonb)
  INTO v_pay
  FROM (
    SELECT COALESCE(NULLIF(payment_method, ''), 'Cash') AS pay_method,
           SUM(COALESCE(total, 0)) AS amt
    FROM public.doppio_bills
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_cutoff
      AND lower(COALESCE(status,'paid')) <> 'refunded'
    GROUP BY 1
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', d::date,
    'revenue', rev,
    'orders', ord
  ) ORDER BY d), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata') AS d,
           SUM(CASE WHEN lower(COALESCE(status,'paid')) <> 'refunded' THEN COALESCE(total, 0) ELSE 0 END) AS rev,
           COUNT(*) FILTER (WHERE lower(COALESCE(status,'paid')) <> 'refunded') AS ord
    FROM public.doppio_bills
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_cutoff
    GROUP BY 1
  ) x;

  RETURN jsonb_build_object(
    'ok', true,
    'days', v_days,
    'revenue', v_revenue,
    'orders', v_orders,
    'aov', CASE WHEN v_orders > 0 THEN round(v_revenue / v_orders) ELSE 0 END,
    'gst', v_gst,
    'net_sales', v_revenue - v_gst,
    'refunds', v_refunds,
    'refund_amount', v_refund_amount,
    'payment_mix', v_pay,
    'daily', v_daily
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rs_sales_summary(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rs_sales_summary(uuid, integer) TO service_role;
