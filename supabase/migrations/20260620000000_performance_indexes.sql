-- ============================================================
-- RestroSuite — Performance indexes
-- Adds composite (tenant_id, created_at DESC) indexes on the
-- highest-volume tables so date-range queries and dashboard
-- loads don't become full table scans as data grows.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================

-- Bills: most common query is "latest bills for tenant"
CREATE INDEX IF NOT EXISTS doppio_bills_tenant_created_idx
  ON public.doppio_bills (tenant_id, created_at DESC);

-- Pending orders: KDS and QR board poll this constantly
CREATE INDEX IF NOT EXISTS doppio_pending_orders_tenant_created_idx
  ON public.doppio_pending_orders (tenant_id, created_at DESC);

-- Pending orders: status filter is extremely frequent (WHERE status = 'Pending Review')
CREATE INDEX IF NOT EXISTS doppio_pending_orders_tenant_status_idx
  ON public.doppio_pending_orders (tenant_id, status);

-- Attendance: daily attendance view filters by date
CREATE INDEX IF NOT EXISTS doppio_attendance_tenant_date_idx
  ON public.doppio_attendance (tenant_id, date DESC);

-- CRM: sorted by last_visit
CREATE INDEX IF NOT EXISTS doppio_crm_tenant_last_visit_idx
  ON public.doppio_crm (tenant_id, last_visit DESC);

-- Notifications: sorted by created_at
CREATE INDEX IF NOT EXISTS doppio_notifications_tenant_created_idx
  ON public.doppio_notifications (tenant_id, created_at DESC);

-- Menu: available items lookup (POS loads all available=true items)
CREATE INDEX IF NOT EXISTS doppio_menu_tenant_available_idx
  ON public.doppio_menu (tenant_id, available);

-- Audit logs: superadmin queries by tenant + time
CREATE INDEX IF NOT EXISTS tenant_audit_logs_tenant_created_idx
  ON public.tenant_audit_logs (tenant_id, created_at DESC);

-- Rate limits: bucket lookup is the hot path for every API call
CREATE INDEX IF NOT EXISTS api_rate_limits_bucket_reset_idx
  ON public.api_rate_limits (bucket, reset_at);
