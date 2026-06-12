ALTER TABLE public.doppio_inventory ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.doppio_inventory ALTER COLUMN threshold DROP NOT NULL;
NOTIFY pgrst, 'reload schema';
