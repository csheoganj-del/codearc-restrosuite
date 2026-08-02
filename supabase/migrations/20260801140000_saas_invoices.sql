-- Professional tax invoices for trial activation + plan payments
CREATE TABLE IF NOT EXISTS public.saas_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.saas_tenants(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('trial', 'subscription', 'renewal', 'upgrade')),
  plan_code text,
  billing_interval text,
  currency text NOT NULL DEFAULT 'INR',
  amount_subtotal numeric NOT NULL DEFAULT 0,
  amount_tax numeric NOT NULL DEFAULT 0,
  amount_total numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 18,
  period_start timestamptz,
  period_end timestamptz,
  payment_id text,
  order_id text,
  payment_method text,
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  buyer_slug text,
  status text NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'paid', 'void', 'refunded')),
  pdf_sent_email boolean NOT NULL DEFAULT false,
  pdf_sent_whatsapp boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_invoices_tenant_idx
  ON public.saas_invoices (tenant_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS saas_invoices_payment_idx
  ON public.saas_invoices (payment_id)
  WHERE payment_id IS NOT NULL;

ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_invoices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_invoices FROM anon, authenticated;
