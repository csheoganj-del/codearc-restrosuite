-- ============================================================
-- Migration: 20260707190000_order_prep_time
--
-- Adds order-level prep time so the kitchen can set "this order
-- takes ~N minutes" from the Kitchen Display, and customers
-- watching the Track Live Order page see a live ETA countdown.
--   prep_minutes    — estimate the kitchen entered (minutes)
--   prep_started_at — when that estimate was set (countdown anchor)
-- Additive and safe.
-- ============================================================

ALTER TABLE public.doppio_pending_orders
    ADD COLUMN IF NOT EXISTS prep_minutes integer,
    ADD COLUMN IF NOT EXISTS prep_started_at timestamptz;

NOTIFY pgrst, 'reload schema';
