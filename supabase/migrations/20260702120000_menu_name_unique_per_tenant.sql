-- The original doppio_menu_name_key constraint was UNIQUE (name) across the
-- whole platform, so once any tenant created a dish called e.g. "Masala Chai"
-- no other tenant could add an item with the same name. Menu names must only
-- be unique within a tenant.
ALTER TABLE public.doppio_menu DROP CONSTRAINT IF EXISTS doppio_menu_name_key;
ALTER TABLE public.doppio_menu ADD CONSTRAINT doppio_menu_tenant_name_key UNIQUE (tenant_id, name);
