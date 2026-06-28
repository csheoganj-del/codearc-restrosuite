-- ============================================================
-- Migration: 20260624000001_fix_bills_missing_columns
--
-- Adds columns that were missing from doppio_bills,
-- fixing the "Could not find column in schema cache" error.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================

-- Add tax summary columns for country-aware taxation
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS tax_summary    jsonb    DEFAULT '[]'::jsonb;
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS channel        text     DEFAULT 'dine_in';
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS tax_profile    jsonb    DEFAULT '{}'::jsonb;
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS liquor_tax_amount     numeric  DEFAULT 0;
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS service_charge_amount numeric  DEFAULT 0;

-- Add tenders (split payment details) and change columns if missing
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS tenders  jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.doppio_bills ADD COLUMN IF NOT EXISTS "change" numeric DEFAULT 0;

-- Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
