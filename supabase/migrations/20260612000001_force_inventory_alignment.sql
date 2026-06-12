ALTER TABLE public.doppio_inventory ADD COLUMN IF NOT EXISTS label text DEFAULT '';
ALTER TABLE public.doppio_inventory ADD COLUMN IF NOT EXISTS max_stock numeric NOT NULL DEFAULT 1000;
ALTER TABLE public.doppio_inventory ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'food';
NOTIFY pgrst, 'reload schema';
