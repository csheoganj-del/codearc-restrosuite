-- ============================================================
-- Migration: 20260707160000_snake_case_column_rename
--
-- Normalises every camelCase column on the operational doppio_*
-- tables to snake_case, so the database uses ONE naming convention
-- throughout. This removes the class of bug where code referenced
-- a column by the wrong casing (e.g. the QR trigger reading
-- table_number when the column was "tableNumber").
--
-- Two tables carry stray snake_case duplicates from earlier partial
-- migrations; those empty duplicates are dropped first so the rename
-- doesn't collide. Safe on a pre-launch database (no production data).
--
-- Idempotent: every rename is guarded by a check that the old column
-- still exists and the new one does not, so re-running is a no-op.
-- ============================================================

DO $$
DECLARE
  r record;
  -- table, old (camelCase) column, new (snake_case) column
  renames text[][] := ARRAY[
    -- doppio_attendance
    ['doppio_attendance','employeeId','employee_id'],
    ['doppio_attendance','employeeName','employee_name'],
    ['doppio_attendance','clockInTime','clock_in_time'],
    ['doppio_attendance','clockOutTime','clock_out_time'],
    ['doppio_attendance','hoursWorked','hours_worked'],
    -- doppio_bills
    ['doppio_bills','orderId','order_id'],
    ['doppio_bills','customerName','customer_name'],
    ['doppio_bills','customerPhone','customer_phone'],
    ['doppio_bills','paymentMethod','payment_method'],
    ['doppio_bills','dateTime','date_time'],
    ['doppio_bills','shiftId','shift_id'],
    ['doppio_bills','orderType','order_type'],
    ['doppio_bills','tableNumber','table_number'],
    -- doppio_draft_orders
    ['doppio_draft_orders','draftId','draft_id'],
    ['doppio_draft_orders','draftName','draft_name'],
    ['doppio_draft_orders','customerName','customer_name'],
    ['doppio_draft_orders','customerPhone','customer_phone'],
    ['doppio_draft_orders','paymentMethod','payment_method'],
    ['doppio_draft_orders','createdAt','created_at'],
    -- doppio_employees
    ['doppio_employees','baseSalary','base_salary'],
    -- doppio_inventory_batches
    ['doppio_inventory_batches','expiryDate','expiry_date'],
    ['doppio_inventory_batches','receivedDate','received_date'],
    -- doppio_leave_requests
    ['doppio_leave_requests','employeeId','employee_id'],
    ['doppio_leave_requests','employeeName','employee_name'],
    ['doppio_leave_requests','startDate','start_date'],
    ['doppio_leave_requests','endDate','end_date'],
    -- doppio_notifications
    ['doppio_notifications','isRead','is_read'],
    -- doppio_pending_orders
    ['doppio_pending_orders','orderId','order_id'],
    ['doppio_pending_orders','customerName','customer_name'],
    ['doppio_pending_orders','customerPhone','customer_phone'],
    ['doppio_pending_orders','paymentMethod','payment_method'],
    ['doppio_pending_orders','orderType','order_type'],
    ['doppio_pending_orders','tableNumber','table_number'],
    ['doppio_pending_orders','dateTime','date_time'],
    -- doppio_shift_events
    ['doppio_shift_events','eventId','event_id'],
    ['doppio_shift_events','shiftId','shift_id'],
    ['doppio_shift_events','eventType','event_type'],
    ['doppio_shift_events','createdAt','created_at'],
    -- doppio_shifts
    ['doppio_shifts','shiftId','shift_id'],
    ['doppio_shifts','cashierName','cashier_name'],
    ['doppio_shifts','openedAt','opened_at'],
    ['doppio_shifts','closedAt','closed_at'],
    ['doppio_shifts','openingFloat','opening_float'],
    ['doppio_shifts','expectedCash','expected_cash'],
    ['doppio_shifts','actualCash','actual_cash'],
    ['doppio_shifts','totalSalesCash','total_sales_cash'],
    ['doppio_shifts','totalSalesUpi','total_sales_upi'],
    ['doppio_shifts','totalSalesCard','total_sales_card'],
    ['doppio_shifts','totalPayouts','total_payouts'],
    ['doppio_shifts','totalSafeDrops','total_safe_drops']
  ];
BEGIN
  -- 1. Drop stray snake_case duplicates that would collide with a rename.
  --    (These are empty leftovers from earlier partial migrations.)
  IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='doppio_bills' AND column_name='customer_name')
     AND EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='doppio_bills' AND column_name='customerName') THEN
    EXECUTE 'ALTER TABLE public.doppio_bills DROP COLUMN customer_name';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='doppio_bills' AND column_name='customer_phone')
     AND EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='doppio_bills' AND column_name='customerPhone') THEN
    EXECUTE 'ALTER TABLE public.doppio_bills DROP COLUMN customer_phone';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='doppio_shift_events' AND column_name='created_at')
     AND EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='doppio_shift_events' AND column_name='createdAt') THEN
    EXECUTE 'ALTER TABLE public.doppio_shift_events DROP COLUMN created_at';
  END IF;

  -- 2. Rename every camelCase column to snake_case (guarded / idempotent).
  FOR r IN SELECT renames[i][1] AS tbl, renames[i][2] AS oldc, renames[i][3] AS newc
           FROM generate_subscripts(renames,1) AS i
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=r.tbl AND column_name=r.oldc)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=r.tbl AND column_name=r.newc) THEN
      EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I', r.tbl, r.oldc, r.newc);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
