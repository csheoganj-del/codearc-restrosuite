-- ============================================================
-- Migration: 20260709160000_crm_customer_fields
--
-- The client data layer (assets/db.js `customers` MAP) writes
-- `email`, `dues` and `marketing_opt_in` to doppio_crm, but those
-- columns were never defined. Because there is no NOT NULL default
-- to satisfy and PostgREST rejects unknown columns, the whole
-- customer upsert could be rejected and the record kept local-only.
--
-- This adds the three missing columns so CRM / customer records
-- persist to the cloud with their email and outstanding dues intact.
--
-- Additive and idempotent (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.doppio_crm
    ADD COLUMN IF NOT EXISTS email             text    DEFAULT '',
    ADD COLUMN IF NOT EXISTS dues              numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS marketing_opt_in  boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
