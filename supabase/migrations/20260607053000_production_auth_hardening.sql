ALTER TABLE public.saas_tenants
ADD COLUMN IF NOT EXISTS data_reset_at timestamp with time zone;

ALTER TABLE public.saas_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.saas_tenants REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Public can read tenant directory" ON public.saas_tenants;
DROP POLICY IF EXISTS "Public can insert tenant registrations" ON public.saas_tenants;
DROP POLICY IF EXISTS "Public can update tenants" ON public.saas_tenants;
DROP POLICY IF EXISTS "Public can delete tenants" ON public.saas_tenants;
DROP POLICY IF EXISTS "Allow public read" ON public.saas_tenants;
DROP POLICY IF EXISTS "Allow public insert" ON public.saas_tenants;
DROP POLICY IF EXISTS "Allow public update" ON public.saas_tenants;
DROP POLICY IF EXISTS "Allow public delete" ON public.saas_tenants;

DO $$
DECLARE
    target_table text;
    tenant_tables text[] := ARRAY[
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
    FOREACH target_table IN ARRAY tenant_tables
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND information_schema.tables.table_name = target_table
        ) THEN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND information_schema.columns.table_name = target_table
                  AND column_name = 'tenant_id'
            ) THEN
                EXECUTE format(
                    'ALTER TABLE public.%I ADD COLUMN tenant_id uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE',
                    target_table
                );
                EXECUTE format(
                    'UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL',
                    target_table,
                    'd290f1ee-6c54-4b01-90e6-d701748f0851'
                );
            END IF;

            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target_table);
            EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON public.%I', target_table);
            EXECUTE format('DROP POLICY IF EXISTS "Enable all for anon" ON public.%I', target_table);
            EXECUTE format('DROP POLICY IF EXISTS "Public can read" ON public.%I', target_table);
            EXECUTE format('DROP POLICY IF EXISTS "Public can insert" ON public.%I', target_table);
            EXECUTE format('DROP POLICY IF EXISTS "Public can update" ON public.%I', target_table);
            EXECUTE format('DROP POLICY IF EXISTS "Public can delete" ON public.%I', target_table);
            EXECUTE format('DROP POLICY IF EXISTS "Allow public access" ON public.%I', target_table);
            EXECUTE format('DROP POLICY IF EXISTS "Public Read Access" ON public.%I', target_table);
            EXECUTE format('DROP POLICY IF EXISTS "Public Write Access" ON public.%I', target_table);
        END IF;
    END LOOP;
END $$;
