-- Enable realtime for live dashboard collections added after the initial
-- dashboard realtime migration.
DO $$
DECLARE
  target_table text;
  realtime_tables text[] := ARRAY[
    'doppio_inventory',
    'doppio_notifications'
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
