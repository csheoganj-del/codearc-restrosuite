-- ============================================================
-- Fix live doppio_tax_rates: ensure tenant_id exists and is used.
-- Also seed default slabs for any approved tenant missing rates.
-- Live schema may use country OR country_code (NOT NULL) — both handled.
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

-- 2) Add missing columns if an older table was created without them
ALTER TABLE public.doppio_tax_rates
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE;

ALTER TABLE public.doppio_tax_rates
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS rate_code text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS percent numeric,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS itc_allowed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

-- Keep country / country_code in sync when both exist
UPDATE public.doppio_tax_rates
SET country_code = country
WHERE country_code IS NULL AND country IS NOT NULL;

UPDATE public.doppio_tax_rates
SET country = country_code
WHERE country IS NULL AND country_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS doppio_tax_rates_tenant_idx ON public.doppio_tax_rates (tenant_id);
CREATE INDEX IF NOT EXISTS doppio_tax_rates_lookup_idx ON public.doppio_tax_rates (country, rate_code);

ALTER TABLE public.doppio_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doppio_tax_rates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_all" ON public.doppio_tax_rates;
CREATE POLICY "deny_anon_all" ON public.doppio_tax_rates
    AS RESTRICTIVE FOR ALL TO anon USING (false);

-- 3) Seed defaults for every tenant that has no rates yet.
-- Live table may use uuid id (not text) and country_code NOT NULL.
DO $$
DECLARE
  t record;
  id_udt text;
  has_country boolean;
  has_country_code boolean;
  cols text;
  sql text;
  rec record;
BEGIN
  SELECT udt_name INTO id_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'doppio_tax_rates' AND column_name = 'id';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'doppio_tax_rates' AND column_name = 'country'
  ) INTO has_country;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'doppio_tax_rates' AND column_name = 'country_code'
  ) INTO has_country_code;

  -- Build column list for country fields present on live schema
  cols := 'tenant_id, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes';
  IF has_country THEN
    cols := cols || ', country';
  END IF;
  IF has_country_code THEN
    cols := cols || ', country_code';
  END IF;
  IF id_udt = 'uuid' OR id_udt = 'text' OR id_udt IS NOT NULL THEN
    cols := 'id, ' || cols;
  END IF;

  FOR t IN SELECT id FROM public.saas_tenants LOOP
    IF NOT EXISTS (SELECT 1 FROM public.doppio_tax_rates r WHERE r.tenant_id = t.id LIMIT 1) THEN
      FOR rec IN
        SELECT * FROM (VALUES
          ('IN', 'IN_REST_5',  'GST Restaurant AC/Non-AC', 5.0,  '2025-09-22'::date, NULL::date, false, 'Standalone restaurant'),
          ('IN', 'IN_REST_18', 'GST Specified Premises',   18.0, '2025-09-22'::date, NULL::date, true,  'Hotel room tariff >= 7500/night'),
          ('IN', 'IN_CATER_18','GST Outdoor Catering',     18.0, '2025-09-22'::date, NULL::date, true,  'Catering services'),
          ('IN', 'IN_COMP_5',  'GST Composition Scheme',   5.0,  '2025-09-22'::date, NULL::date, false, 'Flat 5% borne by restaurant'),
          ('IN', 'IN_GOODS_5', 'GST Packaged Goods 5%',    5.0,  '2025-09-22'::date, NULL::date, false, 'Packaged food goods'),
          ('IN', 'IN_GOODS_18','GST Branded Goods 18%',    18.0, '2025-09-22'::date, NULL::date, true,  'Branded retail goods'),
          ('IN', 'IN_NIL_0',   'GST Nil Rated',            0.0,  '2025-09-22'::date, NULL::date, false, 'Essential foods'),
          ('IE', 'IE_FOOD_135','VAT Hot Food (Pre-Jul 26)',13.5, '2019-01-01'::date, '2026-06-30'::date, true, 'Restaurant food until 30-Jun-2026'),
          ('IE', 'IE_FOOD_9',  'VAT Hot Food (Post-Jul 26)',9.0, '2026-07-01'::date, NULL::date, true,  'Restaurant food from 1-Jul-2026'),
          ('IE', 'IE_DRINK_23','VAT Drinks/Alcohol',       23.0, '2019-01-01'::date, NULL::date, true,  'Alcohol & soft drinks'),
          ('IE', 'IE_COLD_0',  'VAT Cold Takeaway',         0.0, '2019-01-01'::date, NULL::date, true,  'Chilled food to-go'),
          ('IE', 'IE_DELIVERY_23', 'VAT Delivery Services', 23.0, '2019-01-01'::date, NULL::date, true, 'Delivery service charge'),
          ('IE', 'IE_ACCOM_135', 'VAT Accommodation',    13.5, '2019-01-01'::date, NULL::date, true,  'Hotel rooms')
        ) AS v(cc, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes)
      LOOP
        BEGIN
          IF id_udt = 'uuid' THEN
            sql := format(
              'INSERT INTO public.doppio_tax_rates (%s) VALUES ($1, $2, $3, $4, $5, $6, $7, $8%s%s) ON CONFLICT DO NOTHING',
              cols,
              CASE WHEN has_country THEN ', $9' ELSE '' END,
              CASE
                WHEN has_country AND has_country_code THEN ', $10'
                WHEN has_country_code THEN ', $9'
                ELSE ''
              END
            );
            -- Rebuild with explicit column order for clarity
            IF has_country AND has_country_code THEN
              INSERT INTO public.doppio_tax_rates (
                id, tenant_id, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes, country, country_code
              ) VALUES (
                gen_random_uuid(), t.id, rec.rate_code, rec.label, rec.percent, rec.valid_from, rec.valid_to,
                rec.itc_allowed, rec.notes, rec.cc, rec.cc
              ) ON CONFLICT DO NOTHING;
            ELSIF has_country_code THEN
              INSERT INTO public.doppio_tax_rates (
                id, tenant_id, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes, country_code
              ) VALUES (
                gen_random_uuid(), t.id, rec.rate_code, rec.label, rec.percent, rec.valid_from, rec.valid_to,
                rec.itc_allowed, rec.notes, rec.cc
              ) ON CONFLICT DO NOTHING;
            ELSE
              INSERT INTO public.doppio_tax_rates (
                id, tenant_id, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes, country
              ) VALUES (
                gen_random_uuid(), t.id, rec.rate_code, rec.label, rec.percent, rec.valid_from, rec.valid_to,
                rec.itc_allowed, rec.notes, rec.cc
              ) ON CONFLICT DO NOTHING;
            END IF;
          ELSE
            IF has_country AND has_country_code THEN
              INSERT INTO public.doppio_tax_rates (
                id, tenant_id, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes, country, country_code
              ) VALUES (
                rec.rate_code || '_' || t.id::text, t.id, rec.rate_code, rec.label, rec.percent, rec.valid_from, rec.valid_to,
                rec.itc_allowed, rec.notes, rec.cc, rec.cc
              ) ON CONFLICT (id) DO NOTHING;
            ELSIF has_country_code THEN
              INSERT INTO public.doppio_tax_rates (
                id, tenant_id, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes, country_code
              ) VALUES (
                rec.rate_code || '_' || t.id::text, t.id, rec.rate_code, rec.label, rec.percent, rec.valid_from, rec.valid_to,
                rec.itc_allowed, rec.notes, rec.cc
              ) ON CONFLICT (id) DO NOTHING;
            ELSE
              INSERT INTO public.doppio_tax_rates (
                id, tenant_id, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes, country
              ) VALUES (
                rec.rate_code || '_' || t.id::text, t.id, rec.rate_code, rec.label, rec.percent, rec.valid_from, rec.valid_to,
                rec.itc_allowed, rec.notes, rec.cc
              ) ON CONFLICT (id) DO NOTHING;
            END IF;
          END IF;
        EXCEPTION WHEN others THEN
          -- Skip individual seed rows that conflict with live constraints
          RAISE NOTICE 'tax seed skip % for tenant %: %', rec.rate_code, t.id, SQLERRM;
        END;
      END LOOP;
    END IF;
  END LOOP;
END $$;
