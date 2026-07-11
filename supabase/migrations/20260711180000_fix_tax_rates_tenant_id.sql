-- ============================================================
-- Fix live doppio_tax_rates: ensure tenant_id exists and is used.
-- Also seed default slabs for any approved tenant missing rates.
-- ============================================================

-- 1) Ensure table exists with correct shape
CREATE TABLE IF NOT EXISTS public.doppio_tax_rates (
    id          text PRIMARY KEY,
    tenant_id   uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    country     text NOT NULL CHECK (country IN ('IN', 'IE')),
    rate_code   text NOT NULL,
    label       text NOT NULL,
    percent     numeric NOT NULL CHECK (percent >= 0),
    valid_from  date NOT NULL,
    valid_to    date,
    itc_allowed boolean DEFAULT false,
    notes       text DEFAULT '',
    created_at  timestamp with time zone DEFAULT now()
);

-- 2) Add missing tenant_id if an older table was created without it
ALTER TABLE public.doppio_tax_rates
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE;

ALTER TABLE public.doppio_tax_rates
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS rate_code text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS percent numeric,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS itc_allowed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

CREATE INDEX IF NOT EXISTS doppio_tax_rates_tenant_idx ON public.doppio_tax_rates (tenant_id);
CREATE INDEX IF NOT EXISTS doppio_tax_rates_lookup_idx ON public.doppio_tax_rates (country, rate_code);

ALTER TABLE public.doppio_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doppio_tax_rates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_all" ON public.doppio_tax_rates;
CREATE POLICY "deny_anon_all" ON public.doppio_tax_rates
    AS RESTRICTIVE FOR ALL TO anon USING (false);

-- 3) Seed defaults for every tenant that has no rates yet
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM public.saas_tenants LOOP
    IF NOT EXISTS (SELECT 1 FROM public.doppio_tax_rates r WHERE r.tenant_id = t.id LIMIT 1) THEN
      INSERT INTO public.doppio_tax_rates (id, tenant_id, country, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes)
      VALUES
        ('IN_REST_5_'  || t.id, t.id, 'IN', 'IN_REST_5',  'GST Restaurant AC/Non-AC', 5.0,  '2025-09-22', NULL, false, 'Standalone restaurant'),
        ('IN_REST_18_' || t.id, t.id, 'IN', 'IN_REST_18', 'GST Specified Premises',   18.0, '2025-09-22', NULL, true,  'Hotel room tariff >= 7500/night'),
        ('IN_CATER_18_'|| t.id, t.id, 'IN', 'IN_CATER_18','GST Outdoor Catering',     18.0, '2025-09-22', NULL, true,  'Catering services'),
        ('IN_COMP_5_'  || t.id, t.id, 'IN', 'IN_COMP_5',  'GST Composition Scheme',   5.0,  '2025-09-22', NULL, false, 'Flat 5% borne by restaurant'),
        ('IN_GOODS_5_' || t.id, t.id, 'IN', 'IN_GOODS_5', 'GST Packaged Goods 5%',    5.0,  '2025-09-22', NULL, false, 'Packaged food goods'),
        ('IN_GOODS_18_'|| t.id, t.id, 'IN', 'IN_GOODS_18','GST Branded Goods 18%',    18.0, '2025-09-22', NULL, true,  'Branded retail goods'),
        ('IN_NIL_0_'   || t.id, t.id, 'IN', 'IN_NIL_0',   'GST Nil Rated',            0.0,  '2025-09-22', NULL, false, 'Essential foods'),
        ('IE_FOOD_135_'|| t.id, t.id, 'IE', 'IE_FOOD_135','VAT Hot Food (Pre-Jul 26)',13.5, '2019-01-01', '2026-06-30', true, 'Restaurant food until 30-Jun-2026'),
        ('IE_FOOD_9_'  || t.id, t.id, 'IE', 'IE_FOOD_9',  'VAT Hot Food (Post-Jul 26)',9.0, '2026-07-01', NULL, true,  'Restaurant food from 1-Jul-2026'),
        ('IE_DRINK_23_'|| t.id, t.id, 'IE', 'IE_DRINK_23','VAT Drinks/Alcohol',       23.0, '2019-01-01', NULL, true,  'Alcohol & soft drinks'),
        ('IE_COLD_0_'  || t.id, t.id, 'IE', 'IE_COLD_0',  'VAT Cold Takeaway',         0.0, '2019-01-01', NULL, true,  'Chilled food to-go'),
        ('IE_DELIVERY_23_'|| t.id, t.id, 'IE', 'IE_DELIVERY_23', 'VAT Delivery Services', 23.0, '2019-01-01', NULL, true, 'Delivery service charge'),
        ('IE_ACCOM_135_'|| t.id, t.id, 'IE', 'IE_ACCOM_135', 'VAT Accommodation',    13.5, '2019-01-01', NULL, true,  'Hotel rooms')
      ON CONFLICT (id) DO NOTHING;
    END IF;
  END LOOP;
END $$;
