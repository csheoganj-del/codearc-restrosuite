-- ============================================================
-- Migration: 20260613000000_enable_rls_doppio_tables
--
-- Enables Row Level Security (RLS) and Force RLS on all
-- operational doppio_* tables to secure direct client access.
-- ============================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'doppio_business_profile',
    'doppio_menu',
    'doppio_inventory',
    'doppio_bills',
    'doppio_pending_orders',
    'doppio_shifts',
    'doppio_shift_events',
    'doppio_employees',
    'doppio_leave_requests',
    'doppio_attendance',
    'doppio_crm',
    'doppio_inventory_batches',
    'doppio_notifications',
    'doppio_custom_recipes',
    'doppio_inventory_thresholds',
    'doppio_pos_popularity',
    'doppio_draft_orders',
    'doppio_support_tickets',
    'doppio_onboarding_tasks',
    'doppio_reservations',
    'doppio_vendors',
    'doppio_purchase_orders',
    'doppio_item_costs',
    'doppio_offers',
    'doppio_refund_requests',
    'doppio_device_setups',
    'doppio_backup_snapshots',
    'doppio_outlets',
    'doppio_migration_status',
    'doppio_saas_invoices'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
