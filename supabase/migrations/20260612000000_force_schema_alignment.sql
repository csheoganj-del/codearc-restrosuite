ALTER TABLE public.doppio_menu ADD COLUMN IF NOT EXISTS available boolean NOT NULL DEFAULT true;
NOTIFY pgrst, 'reload schema';
