-- ============================================================
-- Migration: 20260611120000_drop_orphaned_authenticated_policies
--
-- Removes pre-migration era policies that were created directly
-- in the Supabase dashboard before the formal migration system
-- existed. Specifically fixes the "Allow authenticated staff to
-- manage shifts" policy on doppio_shifts which has USING(true),
-- meaning any Supabase-authenticated user could read and write
-- every shift record across every tenant with no isolation.
--
-- Why this is safe to drop:
--   All legitimate data access goes through tenant-data /
--   tenant-admin Edge Functions which use the service_role key.
--   Service role bypasses RLS entirely. No browser client ever
--   holds an authenticated JWT — only the anon key is exposed.
--
-- Also adds REVOKE ALL privileges on the legacy doppio_ tables
-- to match the defence-in-depth approach used on all tables
-- created after 20260601000000_core_pos_tables.sql.
-- ============================================================

-- ── Step 1: Drop ALL permissive (USING = true) policies for the
--   authenticated role across every operational table.
--   We iterate over pg_policies rather than a hardcoded list so
--   any future stragglers are also caught.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'authenticated' = ANY(roles)
      AND qual = 'true'   -- USING (true) — no row filter, full table access
  LOOP
    RAISE NOTICE 'Dropping permissive authenticated policy "%" on %.%',
      r.policyname, r.schemaname, r.tablename;
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END $$;

-- ── Step 2: REVOKE table-level privileges from anon and authenticated
--   on the legacy doppio_ tables that pre-date core_pos_tables.sql.
--   Newer tables have this in their creation migrations; these don't.

DO $$
DECLARE
  t text;
  legacy_tables text[] := ARRAY[
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
    'doppio_draft_orders'
  ];
BEGIN
  FOREACH t IN ARRAY legacy_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ── Step 3: Verification — after this migration runs, this query
--   should return ZERO rows. If any rows remain, they need review.
--
--   SELECT tablename, policyname, roles, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND 'authenticated' = ANY(roles)
--     AND qual = 'true';
