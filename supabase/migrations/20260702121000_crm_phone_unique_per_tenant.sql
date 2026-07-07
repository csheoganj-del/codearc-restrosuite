-- doppio_crm_phone_key was UNIQUE (phone) across the whole platform, so two
-- different restaurants could not both have a customer (or the "Dine-in"
-- placeholder) with the same phone number. Phone must only be unique within
-- a tenant.
ALTER TABLE public.doppio_crm DROP CONSTRAINT IF EXISTS doppio_crm_phone_key;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.doppio_crm'::regclass
          AND conname = 'doppio_crm_tenant_phone_key'
    ) THEN
        ALTER TABLE public.doppio_crm ADD CONSTRAINT doppio_crm_tenant_phone_key UNIQUE (tenant_id, phone);
    END IF;
END $$;
