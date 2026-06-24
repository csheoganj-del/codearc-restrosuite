-- ============================================================
-- Migration: 20260623000000_country_aware_taxation
--
-- Adds tables and columns for the date-effective Country-Aware
-- Tax Engine (India GST and Ireland VAT compliance).
-- ============================================================

-- 1. Create date-effective tax rates table
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

-- Indices for performance
CREATE INDEX IF NOT EXISTS doppio_tax_rates_tenant_idx ON public.doppio_tax_rates (tenant_id);
CREATE INDEX IF NOT EXISTS doppio_tax_rates_lookup_idx ON public.doppio_tax_rates (country, rate_code);

-- Enable RLS and deny-all anon policy matching RestroSuite isolation architecture
ALTER TABLE public.doppio_tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doppio_tax_rates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_anon_all" ON public.doppio_tax_rates;
CREATE POLICY "deny_anon_all" ON public.doppio_tax_rates 
    AS RESTRICTIVE FOR ALL TO anon USING (false);

-- 2. Add tax profile metadata to tenants table
ALTER TABLE public.saas_tenants ADD COLUMN IF NOT EXISTS tax_profile jsonb DEFAULT '{}'::jsonb;

-- 3. Add tax category column to menu items
ALTER TABLE public.doppio_menu ADD COLUMN IF NOT EXISTS tax_category text DEFAULT 'IN_REST_5';

-- 4. Add localized tax columns to billing transactions
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS tax_summary jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS channel text DEFAULT 'dine_in';
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS tax_profile jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS liquor_tax_amount numeric DEFAULT 0;
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS service_charge_amount numeric DEFAULT 0;

-- 5. Trigger function to seed default tax rates for new tenant registrations
CREATE OR REPLACE FUNCTION public.seed_tenant_default_tax_rates()
RETURNS TRIGGER AS $$
BEGIN
    -- Seed India GST slabs
    INSERT INTO public.doppio_tax_rates (id, tenant_id, country, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes)
    VALUES 
      ('IN_REST_5_' || NEW.id, NEW.id, 'IN', 'IN_REST_5', 'GST Restaurant AC/Non-AC', 5.0, '2025-09-22', NULL, false, 'Standalone restaurant'),
      ('IN_REST_18_' || NEW.id, NEW.id, 'IN', 'IN_REST_18', 'GST Specified Premises', 18.0, '2025-09-22', NULL, true, 'Hotel room tariff >= ₹7,500/night'),
      ('IN_CATER_18_' || NEW.id, NEW.id, 'IN', 'IN_CATER_18', 'GST Outdoor Catering', 18.0, '2025-09-22', NULL, true, 'Catering services'),
      ('IN_COMP_5_' || NEW.id, NEW.id, 'IN', 'IN_COMP_5', 'GST Composition Scheme', 5.0, '2025-09-22', NULL, false, 'Flat 5% borne by restaurant'),
      ('IN_GOODS_5_' || NEW.id, NEW.id, 'IN', 'IN_GOODS_5', 'GST Packaged Goods 5%', 5.0, '2025-09-22', NULL, false, 'Packaged food goods'),
      ('IN_GOODS_18_' || NEW.id, NEW.id, 'IN', 'IN_GOODS_18', 'GST Branded Goods 18%', 18.0, '2025-09-22', NULL, true, 'Branded retail goods'),
      ('IN_NIL_0_' || NEW.id, NEW.id, 'IN', 'IN_NIL_0', 'GST Nil Rated', 0.0, '2025-09-22', NULL, false, 'Essential foods')
    ON CONFLICT DO NOTHING;

    -- Seed Ireland VAT slabs
    INSERT INTO public.doppio_tax_rates (id, tenant_id, country, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes)
    VALUES 
      ('IE_FOOD_135_' || NEW.id, NEW.id, 'IE', 'IE_FOOD_135', 'VAT Hot Food (Pre-Jul 26)', 13.5, '2019-01-01', '2026-06-30', true, 'Restaurant food until 30-Jun-2026'),
      ('IE_FOOD_9_' || NEW.id, NEW.id, 'IE', 'IE_FOOD_9', 'VAT Hot Food (Post-Jul 26)', 9.0, '2026-07-01', NULL, true, 'Restaurant food from 1-Jul-2026'),
      ('IE_DRINK_23_' || NEW.id, NEW.id, 'IE', 'IE_DRINK_23', 'VAT Drinks/Alcohol', 23.0, '2019-01-01', NULL, true, 'Alcohol & soft drinks'),
      ('IE_COLD_0_' || NEW.id, NEW.id, 'IE', 'IE_COLD_0', 'VAT Cold Takeaway', 0.0, '2019-01-01', NULL, true, 'Chilled food to-go'),
      ('IE_DELIVERY_23_' || NEW.id, NEW.id, 'IE', 'IE_DELIVERY_23', 'VAT Delivery Services', 23.0, '2019-01-01', NULL, true, 'Delivery service charge'),
      ('IE_ACCOM_135_' || NEW.id, NEW.id, 'IE', 'IE_ACCOM_135', 'VAT Accommodation', 13.5, '2019-01-01', NULL, true, 'Hotel rooms')
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to saas_tenants
DROP TRIGGER IF EXISTS trigger_seed_tenant_default_tax_rates ON public.saas_tenants;
CREATE TRIGGER trigger_seed_tenant_default_tax_rates
AFTER INSERT ON public.saas_tenants
FOR EACH ROW
EXECUTE FUNCTION public.seed_tenant_default_tax_rates();

-- 6. Manually seed default tax rates for existing first-party seed tenant (admin)
DO $$
DECLARE
    admin_id uuid := 'd290f1ee-6c54-4b01-90e6-d701748f0851';
BEGIN
    IF EXISTS (SELECT 1 FROM public.saas_tenants WHERE id = admin_id) THEN
        INSERT INTO public.doppio_tax_rates (id, tenant_id, country, rate_code, label, percent, valid_from, valid_to, itc_allowed, notes)
        VALUES 
          ('IN_REST_5_' || admin_id, admin_id, 'IN', 'IN_REST_5', 'GST Restaurant AC/Non-AC', 5.0, '2025-09-22', NULL, false, 'Standalone restaurant'),
          ('IN_REST_18_' || admin_id, admin_id, 'IN', 'IN_REST_18', 'GST Specified Premises', 18.0, '2025-09-22', NULL, true, 'Hotel room tariff >= ₹7,500/night'),
          ('IN_CATER_18_' || admin_id, admin_id, 'IN', 'IN_CATER_18', 'GST Outdoor Catering', 18.0, '2025-09-22', NULL, true, 'Catering services'),
          ('IN_COMP_5_' || admin_id, admin_id, 'IN', 'IN_COMP_5', 'GST Composition Scheme', 5.0, '2025-09-22', NULL, false, 'Flat 5% borne by restaurant'),
          ('IN_GOODS_5_' || admin_id, admin_id, 'IN', 'IN_GOODS_5', 'GST Packaged Goods 5%', 5.0, '2025-09-22', NULL, false, 'Packaged food goods'),
          ('IN_GOODS_18_' || admin_id, admin_id, 'IN', 'IN_GOODS_18', 'GST Branded Goods 18%', 18.0, '2025-09-22', NULL, true, 'Branded retail goods'),
          ('IN_NIL_0_' || admin_id, admin_id, 'IN', 'IN_NIL_0', 'GST Nil Rated', 0.0, '2025-09-22', NULL, false, 'Essential foods'),
          ('IE_FOOD_135_' || admin_id, admin_id, 'IE', 'IE_FOOD_135', 'VAT Hot Food (Pre-Jul 26)', 13.5, '2019-01-01', '2026-06-30', true, 'Restaurant food until 30-Jun-2026'),
          ('IE_FOOD_9_' || admin_id, admin_id, 'IE', 'IE_FOOD_9', 'VAT Hot Food (Post-Jul 26)', 9.0, '2026-07-01', NULL, true, 'Restaurant food from 1-Jul-2026'),
          ('IE_DRINK_23_' || admin_id, admin_id, 'IE', 'IE_DRINK_23', 'VAT Drinks/Alcohol', 23.0, '2019-01-01', NULL, true, 'Alcohol & soft drinks'),
          ('IE_COLD_0_' || admin_id, admin_id, 'IE', 'IE_COLD_0', 'VAT Cold Takeaway', 0.0, '2019-01-01', NULL, true, 'Chilled food to-go'),
          ('IE_DELIVERY_23_' || admin_id, admin_id, 'IE', 'IE_DELIVERY_23', 'VAT Delivery Services', 23.0, '2019-01-01', NULL, true, 'Delivery service charge'),
          ('IE_ACCOM_135_' || admin_id, admin_id, 'IE', 'IE_ACCOM_135', 'VAT Accommodation', 13.5, '2019-01-01', NULL, true, 'Hotel rooms')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
