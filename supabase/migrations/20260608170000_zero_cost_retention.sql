-- Zero-cost launch retention controls.
-- Keeps temporary operational data from growing until it consumes the free database.

CREATE OR REPLACE FUNCTION public.cleanup_zero_cost_operational_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF to_regclass('public.api_rate_limits') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.api_rate_limits WHERE window_started_at < now() - interval ''2 days''';
    END IF;

    IF to_regclass('public.app_error_reports') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.app_error_reports WHERE created_at < now() - interval ''30 days''';
    END IF;

    IF to_regclass('public.tenant_audit_logs') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.tenant_audit_logs WHERE created_at < now() - interval ''90 days''';
    END IF;

    IF to_regclass('public.gateway_health_log') IS NOT NULL THEN
        EXECUTE 'DELETE FROM public.gateway_health_log WHERE created_at < now() - interval ''14 days''';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_zero_cost_operational_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_zero_cost_operational_data() TO service_role;

CREATE OR REPLACE FUNCTION public.zero_cost_cleanup_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Run approximately once per 100 writes to avoid cleanup overhead on every request.
    IF random() < 0.01 THEN
        PERFORM public.cleanup_zero_cost_operational_data();
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.app_error_reports') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS app_error_reports_zero_cost_cleanup ON public.app_error_reports';
        EXECUTE 'CREATE TRIGGER app_error_reports_zero_cost_cleanup
                 AFTER INSERT ON public.app_error_reports
                 FOR EACH ROW EXECUTE FUNCTION public.zero_cost_cleanup_after_insert()';
    END IF;

    IF to_regclass('public.tenant_audit_logs') IS NOT NULL THEN
        EXECUTE 'DROP TRIGGER IF EXISTS tenant_audit_logs_zero_cost_cleanup ON public.tenant_audit_logs';
        EXECUTE 'CREATE TRIGGER tenant_audit_logs_zero_cost_cleanup
                 AFTER INSERT ON public.tenant_audit_logs
                 FOR EACH ROW EXECUTE FUNCTION public.zero_cost_cleanup_after_insert()';
    END IF;
END;
$$;

SELECT public.cleanup_zero_cost_operational_data();
