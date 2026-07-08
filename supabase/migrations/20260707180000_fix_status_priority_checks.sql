-- ============================================================
-- Migration: 20260707180000_fix_status_priority_checks
--
-- Live QA (2026-07-08) found three CHECK constraints whose
-- allowed values did not match what the app actually writes,
-- so these records failed to sync to the cloud:
--   * doppio_reservations.status    — app writes 'confirmed'
--   * doppio_purchase_orders.status — app writes 'pending' (constraint was capitalized)
--   * doppio_support_tickets.priority — app writes 'medium'
--
-- Widen each constraint to accept the app's values (and common
-- lifecycle/case variants) so these features persist correctly.
-- All existing stored values remain valid.
-- ============================================================

-- Reservations status
ALTER TABLE public.doppio_reservations DROP CONSTRAINT IF EXISTS doppio_reservations_status_check;
ALTER TABLE public.doppio_reservations ADD CONSTRAINT doppio_reservations_status_check
  CHECK (status IN ('booked','confirmed','pending','seated','arrived','cancelled','no_show','completed'));

-- Purchase order status (accept lower- and capitalized forms)
ALTER TABLE public.doppio_purchase_orders DROP CONSTRAINT IF EXISTS doppio_purchase_orders_status_check;
ALTER TABLE public.doppio_purchase_orders ADD CONSTRAINT doppio_purchase_orders_status_check
  CHECK (status IN ('pending','ordered','approved','rejected','received','completed','cancelled',
                    'Pending','Ordered','Approved','Rejected','Received','Completed','Cancelled'));

-- Support ticket priority
ALTER TABLE public.doppio_support_tickets DROP CONSTRAINT IF EXISTS doppio_support_tickets_priority_check;
ALTER TABLE public.doppio_support_tickets ADD CONSTRAINT doppio_support_tickets_priority_check
  CHECK (priority IN ('low','medium','high','urgent','Low','Medium','High','Urgent'));

-- Support ticket status (widen for the open -> resolved lifecycle)
ALTER TABLE public.doppio_support_tickets DROP CONSTRAINT IF EXISTS doppio_support_tickets_status_check;
ALTER TABLE public.doppio_support_tickets ADD CONSTRAINT doppio_support_tickets_status_check
  CHECK (status IN ('open','waiting','in_progress','resolved','closed'));

NOTIFY pgrst, 'reload schema';
