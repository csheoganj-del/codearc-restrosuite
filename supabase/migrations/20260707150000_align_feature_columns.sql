-- ============================================================
-- Migration: 20260707150000_align_feature_columns
--
-- The client's data layer (assets/db.js MAP) was writing field
-- names that had no matching column on these tables, so the whole
-- cloud insert was rejected and the record only ever saved to the
-- local device (never synced). This adds the few genuinely-missing
-- columns so Reservations, Offers, Vendors, Purchase Orders and
-- Support Tickets can persist to the cloud. The paired db.js change
-- corrects the field-name mapping.
--
-- All additive and idempotent (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE public.doppio_support_tickets
    ADD COLUMN IF NOT EXISTS customer_name text DEFAULT '',
    ADD COLUMN IF NOT EXISTS ticket_number text DEFAULT '';

ALTER TABLE public.doppio_offers
    ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.doppio_vendors
    ADD COLUMN IF NOT EXISTS terms text DEFAULT '',
    ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS items_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.doppio_purchase_orders
    ADD COLUMN IF NOT EXISTS po_number text DEFAULT '';

NOTIFY pgrst, 'reload schema';
