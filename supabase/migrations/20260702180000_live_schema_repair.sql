-- Repair production drift found by the 10-restaurant live simulation.
-- This keeps order, inventory, threshold, and profile uniqueness tenant-scoped
-- so one restaurant cannot block another restaurant using the same natural key.

ALTER TABLE public.doppio_business_profile
    ADD COLUMN IF NOT EXISTS gst_number text DEFAULT '',
    ADD COLUMN IF NOT EXISTS upi_vpa text DEFAULT '',
    ADD COLUMN IF NOT EXISTS upi_id text DEFAULT '',
    ADD COLUMN IF NOT EXISTS passcode text DEFAULT '',
    ADD COLUMN IF NOT EXISTS whatsapp_gateway_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS whatsapp_gateway_url text DEFAULT '',
    ADD COLUMN IF NOT EXISTS whatsapp_gateway_token text DEFAULT '',
    ADD COLUMN IF NOT EXISTS table_count integer NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();

UPDATE public.doppio_business_profile
SET upi_vpa = upi_id
WHERE COALESCE(upi_vpa, '') = ''
  AND COALESCE(upi_id, '') <> '';

UPDATE public.doppio_business_profile
SET upi_id = upi_vpa
WHERE COALESCE(upi_id, '') = ''
  AND COALESCE(upi_vpa, '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS doppio_business_profile_tenant_unique
    ON public.doppio_business_profile (tenant_id)
    WHERE tenant_id IS NOT NULL;

ALTER TABLE public.doppio_bills
    ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "orderType" text NOT NULL DEFAULT 'Takeaway',
    ADD COLUMN IF NOT EXISTS "tableNumber" text DEFAULT '';

ALTER TABLE public.doppio_bills DROP CONSTRAINT IF EXISTS "doppio_bills_orderId_key";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.doppio_bills'::regclass
          AND conname = 'doppio_bills_tenant_order_id_key'
    ) THEN
        ALTER TABLE public.doppio_bills
            ADD CONSTRAINT doppio_bills_tenant_order_id_key UNIQUE (tenant_id, "orderId");
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_doppio_bills_tenant_order_id
    ON public.doppio_bills (tenant_id, "orderId");

ALTER TABLE public.doppio_inventory DROP CONSTRAINT IF EXISTS doppio_inventory_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS doppio_inventory_tenant_key_unique
    ON public.doppio_inventory (tenant_id, key);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.doppio_inventory_thresholds'::regclass
          AND conname = 'doppio_inventory_thresholds_pkey'
          AND pg_get_constraintdef(oid) <> 'PRIMARY KEY (tenant_id, ingredient_key)'
    ) THEN
        ALTER TABLE public.doppio_inventory_thresholds
            DROP CONSTRAINT doppio_inventory_thresholds_pkey;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.doppio_inventory_thresholds'::regclass
          AND conname = 'doppio_inventory_thresholds_pkey'
    ) THEN
        ALTER TABLE public.doppio_inventory_thresholds
            ADD CONSTRAINT doppio_inventory_thresholds_pkey PRIMARY KEY (tenant_id, ingredient_key);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_doppio_inventory_thresholds_tenant
    ON public.doppio_inventory_thresholds (tenant_id);

ALTER TABLE public.doppio_employees
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.doppio_employees'::regclass
          AND conname = 'doppio_employees_status_check'
    ) THEN
        ALTER TABLE public.doppio_employees
            ADD CONSTRAINT doppio_employees_status_check CHECK (status IN ('active', 'inactive'));
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
