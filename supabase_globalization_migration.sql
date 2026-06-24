-- ============================================================
-- RestroSuite Globalization & Country-Aware Tax Engine Migration
-- Run this in your Supabase SQL Editor AFTER supabase_migration.sql
-- ============================================================

-- ── 1. Tenant profile: country, currency, tax settings ──────
ALTER TABLE public.saas_tenants
  ADD COLUMN IF NOT EXISTS currency           text    DEFAULT 'INR (₹)',
  ADD COLUMN IF NOT EXISTS currency_symbol    text    DEFAULT '₹',
  ADD COLUMN IF NOT EXISTS tax_system         text    DEFAULT 'GST',
  ADD COLUMN IF NOT EXISTS tax_label          text    DEFAULT 'GST',
  ADD COLUMN IF NOT EXISTS tax_rate           numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS tax_inclusive      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_scheme         text    DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS gstin              text,
  ADD COLUMN IF NOT EXISTS specified_premises boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_number         text,
  ADD COLUMN IF NOT EXISTS liquor_vat_rate    numeric DEFAULT 20,
  ADD COLUMN IF NOT EXISTS service_charge     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_number    text,
  ADD COLUMN IF NOT EXISTS whatsapp_format    text    DEFAULT 'Text receipt';

-- ── 2. Bills table: store full tax breakdown per bill ────────
ALTER TABLE public.doppio_bills
  ADD COLUMN IF NOT EXISTS tax_summary        jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_profile        jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS channel            text    DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS customer_name      text,
  ADD COLUMN IF NOT EXISTS customer_phone     text,
  ADD COLUMN IF NOT EXISTS customer_gst       text,
  ADD COLUMN IF NOT EXISTS service_charge_amt numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liquor_tax_amt     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_address   text,
  ADD COLUMN IF NOT EXISTS delivery_charge    numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_rider     text;

-- ── 3. CRM table: phone index for fast customer lookup ───────
CREATE INDEX IF NOT EXISTS idx_doppio_crm_phone
  ON public.doppio_crm (phone, tenant_id);

CREATE INDEX IF NOT EXISTS idx_doppio_crm_tenant
  ON public.doppio_crm (tenant_id);

-- ── 4. WhatsApp Gateway Logs table (tenant-isolated) ─────────
CREATE TABLE IF NOT EXISTS public.doppio_whatsapp_logs (
  id            uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid    REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  created_at    timestamp with time zone DEFAULT now(),
  bill_no       text,
  to_phone      text,
  message_type  text    DEFAULT 'text',  -- 'text' | 'pdf'
  status        text    DEFAULT 'sent',  -- 'sent' | 'failed' | 'queued'
  error_msg     text,
  gateway_resp  jsonb   DEFAULT '{}'::jsonb,
  sent_at       timestamp with time zone
);

-- RLS for WhatsApp logs
ALTER TABLE public.doppio_whatsapp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doppio_whatsapp_logs FORCE ROW LEVEL SECURITY;

-- Index for fast tenant log retrieval
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_tenant
  ON public.doppio_whatsapp_logs (tenant_id, created_at DESC);

-- ── 5. Country-Aware Tax Rate Schedule (date-effective) ──────
-- Stores historical & future effective tax rates per country+code.
-- The system resolves the rate with MAX(effective_from) ≤ today.
CREATE TABLE IF NOT EXISTS public.doppio_tax_rates (
  id             uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code   text    NOT NULL,          -- 'IN', 'IE', 'GB', 'US', etc.
  rate_code      text    NOT NULL,          -- e.g. 'IN_REST_5', 'IE_FOOD_9'
  label          text    NOT NULL,          -- e.g. '5% GST (Restaurant)'
  percent        numeric NOT NULL,          -- e.g. 5.00
  effective_from date    NOT NULL,          -- the date this rate takes effect
  itc_allowed    boolean DEFAULT true,
  notes          text,
  UNIQUE (country_code, rate_code, effective_from)
);

-- Seed initial rate data (India GST + Ireland VAT)
-- India GST rates (as of Sep 2025 notification)
INSERT INTO public.doppio_tax_rates (country_code, rate_code, label, percent, effective_from, itc_allowed, notes) VALUES
  ('IN', 'IN_EXEMPT',   'Exempt (0% GST)',                       0,    '2017-07-01', false, 'Milk, plain bread, etc.'),
  ('IN', 'IN_REST_5',   '5% GST (Restaurant – no ITC)',          5,    '2017-07-01', false, 'Non-AC, non-liquor restaurants'),
  ('IN', 'IN_REST_18',  '18% GST (Specified Premises)',         18,    '2017-07-01', true,  'Hotels/restaurants in 5-star hotels (room tariff > ₹7500)'),
  ('IN', 'IN_COMP_5',   '5% Composition Levy',                   5,    '2017-07-01', false, 'Composition scheme restaurants'),
  ('IN', 'IN_ALCOHOL_EXEMPT', 'Liquor – State VAT Applicable',   0,    '2017-07-01', false, 'Alcohol is exempt from GST; state liquor VAT applies separately')
ON CONFLICT (country_code, rate_code, effective_from) DO NOTHING;

-- Ireland VAT rates (standard pre-July 2026)
INSERT INTO public.doppio_tax_rates (country_code, rate_code, label, percent, effective_from, itc_allowed, notes) VALUES
  ('IE', 'IE_STANDARD_23', 'Standard Rate (23% VAT)',            23,   '2012-01-01', true,  'Standard VAT rate for most goods and services'),
  ('IE', 'IE_REDUCED_135', 'Reduced Rate (13.5% VAT)',           13.5, '2003-01-01', true,  'Catering and restaurant supplies'),
  ('IE', 'IE_FOOD_9',      '9% VAT (Food & Non-Alcoholic)',      9,    '2011-07-01', true,  'Hot food, sandwiches; temporary reduced rate'),
  ('IE', 'IE_ZERO',        'Zero Rate (0% VAT)',                  0,   '1972-11-01', true,  'Basic foodstuffs, children clothing'),
  ('IE', 'IE_EXEMPT',      'Exempt',                              0,   '1972-11-01', false, 'Financial services, medical, etc.')
ON CONFLICT (country_code, rate_code, effective_from) DO NOTHING;

-- Ireland VAT rate change effective 1 July 2026 (restaurant rate reverting to 13.5%)
INSERT INTO public.doppio_tax_rates (country_code, rate_code, label, percent, effective_from, itc_allowed, notes) VALUES
  ('IE', 'IE_FOOD_9', '13.5% VAT (Catering – post Jul 2026)',   13.5, '2026-07-01', true, 'Temporary 9% rate for hospitality ended 30 Jun 2026; reverts to 13.5%')
ON CONFLICT (country_code, rate_code, effective_from) DO NOTHING;

-- United Kingdom VAT rates
INSERT INTO public.doppio_tax_rates (country_code, rate_code, label, percent, effective_from, itc_allowed, notes) VALUES
  ('GB', 'GB_STANDARD_20', 'Standard Rate (20% VAT)',           20,   '2011-01-04', true, 'Standard UK VAT'),
  ('GB', 'GB_REDUCED_5',   'Reduced Rate (5% VAT)',              5,   '2000-01-01', true, 'Hospitality food/non-alcoholic drink (COVID relief rate ended 2022)'),
  ('GB', 'GB_ZERO',        'Zero Rate (0% VAT)',                  0,   '1973-01-01', true, 'Basic food, books, children''s clothes'),
  ('GB', 'GB_EXEMPT',      'Exempt',                              0,   '1973-01-01', false,'Financial, medical services')
ON CONFLICT (country_code, rate_code, effective_from) DO NOTHING;

-- United States Sales Tax (informational – rates are state/county specific)
INSERT INTO public.doppio_tax_rates (country_code, rate_code, label, percent, effective_from, itc_allowed, notes) VALUES
  ('US', 'US_SALES_0',   'No Sales Tax (0%)',                    0,   '2000-01-01', false, 'States with no sales tax (MT, OR, NH, DE, AK)'),
  ('US', 'US_SALES_6',   'Sales Tax (~6% average)',              6,   '2000-01-01', false, 'US average; configure exact state/city rate in settings'),
  ('US', 'US_SALES_10',  'Sales Tax (~10%)',                    10,   '2000-01-01', false, 'High-tax states/localities (CA, NY city, TN, etc.)')
ON CONFLICT (country_code, rate_code, effective_from) DO NOTHING;

-- UAE VAT rates
INSERT INTO public.doppio_tax_rates (country_code, rate_code, label, percent, effective_from, itc_allowed, notes) VALUES
  ('AE', 'AE_VAT_5',  'UAE VAT (5%)',    5, '2018-01-01', true, 'Standard UAE VAT rate'),
  ('AE', 'AE_EXEMPT', 'UAE VAT Exempt',  0, '2018-01-01', false,'Exempt supplies – basic food, healthcare')
ON CONFLICT (country_code, rate_code, effective_from) DO NOTHING;

-- Australia GST rates
INSERT INTO public.doppio_tax_rates (country_code, rate_code, label, percent, effective_from, itc_allowed, notes) VALUES
  ('AU', 'AU_GST_10', 'Australia GST (10%)',  10, '2000-07-01', true, 'Standard Australian GST'),
  ('AU', 'AU_GST_0',  'GST-Free Supply (0%)',  0, '2000-07-01', true, 'Basic food, exports, health')
ON CONFLICT (country_code, rate_code, effective_from) DO NOTHING;

-- Canada GST/HST rates
INSERT INTO public.doppio_tax_rates (country_code, rate_code, label, percent, effective_from, itc_allowed, notes) VALUES
  ('CA', 'CA_GST_5',  'Canada GST (5%)',             5,  '2008-01-01', true, 'Federal GST only (e.g. Alberta, BC, Manitoba)'),
  ('CA', 'CA_HST_13', 'Canada HST (13%)',            13,  '2010-07-01', true, 'Harmonized – Ontario'),
  ('CA', 'CA_HST_15', 'Canada HST (15%)',            15,  '1997-04-01', true, 'Harmonized – NS, NB, NL, PEI'),
  ('CA', 'CA_ZERO',   'Zero-Rated Supply (0%)',       0,  '1991-01-01', true, 'Basic groceries, agricultural products')
ON CONFLICT (country_code, rate_code, effective_from) DO NOTHING;

-- ── 6. Grant service-role access (Supabase edge functions use service role) ──
-- doppio_tax_rates is a public lookup table (no tenant isolation needed)
ALTER TABLE public.doppio_tax_rates DISABLE ROW LEVEL SECURITY;

-- ── 7. Helpful view: latest effective rate per country+code ──
CREATE OR REPLACE VIEW public.doppio_tax_rates_current AS
SELECT DISTINCT ON (country_code, rate_code)
  country_code,
  rate_code,
  label,
  percent,
  itc_allowed,
  notes,
  effective_from
FROM public.doppio_tax_rates
WHERE effective_from <= CURRENT_DATE
ORDER BY country_code, rate_code, effective_from DESC;

-- Done.
SELECT 'RestroSuite Globalization Migration Complete ✓' AS result;
