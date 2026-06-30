-- Track refund state directly on persisted bills.
-- Refund requests keep the audit trail; these columns keep bill history and
-- reports consistent across devices after a refund is approved.

ALTER TABLE public.doppio_bills
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'refunded', 'void')),
  ADD COLUMN IF NOT EXISTS refund_reason text DEFAULT '',
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_doppio_bills_tenant_status
  ON public.doppio_bills (tenant_id, status, created_at DESC);

NOTIFY pgrst, 'reload schema';
