-- ============================================================
-- Migration: 20260611000000_rls_tenant_isolation
--
-- Fixes two issues from the initial migration:
--   1. Removes the DEFAULT tenant_id fallback (d290f1ee-...) that
--      silently attributed new rows to the Doppio seed tenant.
--   2. Adds explicit deny-all anon policies on every operational
--      table so the browser anon key cannot query data directly.
--      All legitimate data access goes through tenant-data /
--      tenant-admin Edge Functions (service role bypasses RLS).
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

      -- 1. Drop the DEFAULT fallback to the Doppio seed tenant UUID.
      --    tenant_id must now be set explicitly on every INSERT.
      --    This prevents cross-tenant data pollution if tenant_id is omitted.
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = t
          AND column_name = 'tenant_id'
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ALTER COLUMN tenant_id DROP DEFAULT',
          t
        );
      END IF;

      -- 2. Remove any lingering catch-all policies before adding the explicit deny.
      EXECUTE format('DROP POLICY IF EXISTS "deny_anon_all" ON public.%I', t);

      -- 3. Add explicit deny-all for the anon role.
      --    Even though service role bypasses RLS, this documents intent and
      --    protects against any accidental direct client queries.
      EXECUTE format(
        'CREATE POLICY "deny_anon_all" ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false)',
        t
      );

    END IF;
  END LOOP;
END $$;

-- Also lock down saas_tenants itself.
-- The anon key must never be able to read tenant records directly
-- (passwords, slugs, phone numbers).
DROP POLICY IF EXISTS "deny_anon_all" ON public.saas_tenants;
CREATE POLICY "deny_anon_all" ON public.saas_tenants
  AS RESTRICTIVE FOR ALL TO anon USING (false);
