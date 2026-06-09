-- Keep client dashboards synchronized across devices.
DO $$
DECLARE
  target_table text;
  realtime_tables text[] := ARRAY[
    'doppio_menu',
    'doppio_bills',
    'doppio_pending_orders',
    'doppio_employees',
    'doppio_attendance',
    'doppio_leave_requests',
    'doppio_crm'
  ];
BEGIN
  FOREACH target_table IN ARRAY realtime_tables LOOP
    IF to_regclass(format('public.%I', target_table)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = target_table
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', target_table);
    END IF;
  END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS doppio_menu_tenant_name_uidx
  ON public.doppio_menu (tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS doppio_custom_recipes_tenant_item_name_uidx
  ON public.doppio_custom_recipes (tenant_id, item_name);
