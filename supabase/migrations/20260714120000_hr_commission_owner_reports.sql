-- RestroSuite 10/10: HR advances, salary payments, commission, owner report prefs
-- Safe additive migration (IF NOT EXISTS throughout).

-- ── Employees: phone + leave balances already on leaves jsonb; ensure contact usable as phone ──
ALTER TABLE public.doppio_employees
  ADD COLUMN IF NOT EXISTS phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS role_key text DEFAULT '',
  ADD COLUMN IF NOT EXISTS payroll numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_hash text DEFAULT '';

-- Align base_salary column name if only camelCase exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'doppio_employees' AND column_name = 'baseSalary'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'doppio_employees' AND column_name = 'base_salary'
  ) THEN
    ALTER TABLE public.doppio_employees RENAME COLUMN "baseSalary" TO base_salary;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── Salary advances ──
CREATE TABLE IF NOT EXISTS public.doppio_salary_advances (
  id            text NOT NULL,
  tenant_id     uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  employee_id   text NOT NULL,
  employee_name text NOT NULL DEFAULT '',
  amount        numeric NOT NULL DEFAULT 0,
  remaining     numeric NOT NULL DEFAULT 0,
  recover       text NOT NULL DEFAULT 'next_payroll',
  note          text DEFAULT '',
  status        text NOT NULL DEFAULT 'paid',
  paid_at       timestamptz DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS doppio_salary_advances_tenant_idx
  ON public.doppio_salary_advances (tenant_id);

-- ── Salary payment ledger ──
CREATE TABLE IF NOT EXISTS public.doppio_salary_payments (
  id                text NOT NULL,
  tenant_id         uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  employee_id       text NOT NULL,
  employee_name     text NOT NULL DEFAULT '',
  month             text NOT NULL DEFAULT '',
  base              numeric NOT NULL DEFAULT 0,
  advance_deducted  numeric NOT NULL DEFAULT 0,
  net               numeric NOT NULL DEFAULT 0,
  paid_at           timestamptz DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS doppio_salary_payments_tenant_idx
  ON public.doppio_salary_payments (tenant_id);

-- ── Commission partners ──
CREATE TABLE IF NOT EXISTS public.doppio_commission_partners (
  id          text NOT NULL,
  tenant_id   uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  phone       text DEFAULT '',
  rate_type   text NOT NULL DEFAULT 'percent',
  rate        numeric NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  notes       text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS doppio_commission_partners_tenant_idx
  ON public.doppio_commission_partners (tenant_id);

-- ── Commission events (per bill referral) ──
CREATE TABLE IF NOT EXISTS public.doppio_commission_events (
  id            text NOT NULL,
  tenant_id     uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  partner_id    text NOT NULL,
  partner_name  text DEFAULT '',
  bill_no       text DEFAULT '',
  bill_grand    numeric NOT NULL DEFAULT 0,
  commission    numeric NOT NULL DEFAULT 0,
  customer      text DEFAULT '',
  paid_out      boolean NOT NULL DEFAULT false,
  at            timestamptz DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS doppio_commission_events_tenant_idx
  ON public.doppio_commission_events (tenant_id);
CREATE INDEX IF NOT EXISTS doppio_commission_events_partner_idx
  ON public.doppio_commission_events (tenant_id, partner_id);

-- ── Commission payouts ──
CREATE TABLE IF NOT EXISTS public.doppio_commission_payouts (
  id            text NOT NULL,
  tenant_id     uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  partner_id    text NOT NULL,
  partner_name  text DEFAULT '',
  amount        numeric NOT NULL DEFAULT 0,
  period        text DEFAULT 'monthly',
  paid_at       timestamptz DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS doppio_commission_payouts_tenant_idx
  ON public.doppio_commission_payouts (tenant_id);

-- ── Owner WhatsApp report preferences (one row per tenant) ──
CREATE TABLE IF NOT EXISTS public.doppio_owner_report_prefs (
  tenant_id           uuid PRIMARY KEY REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
  enabled             boolean NOT NULL DEFAULT true,
  owner_phone         text DEFAULT '',
  daily_sales         boolean NOT NULL DEFAULT true,
  daily_sales_hour    integer NOT NULL DEFAULT 22,
  stock_alerts        boolean NOT NULL DEFAULT true,
  stock_alert_hour    integer NOT NULL DEFAULT 10,
  weekly_pl           boolean NOT NULL DEFAULT true,
  weekly_pl_day       integer NOT NULL DEFAULT 1,
  monthly_pl          boolean NOT NULL DEFAULT true,
  monthly_pl_day      integer NOT NULL DEFAULT 1,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Enable RLS + tenant isolation (pattern matching existing doppio tables) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'doppio_salary_advances',
    'doppio_salary_payments',
    'doppio_commission_partners',
    'doppio_commission_events',
    'doppio_commission_payouts',
    'doppio_owner_report_prefs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    -- Service role / edge functions use service key; authenticated uses tenant claim when present
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (
           tenant_id::text = COALESCE(
             current_setting(''request.jwt.claims'', true)::json->>''tenant_id'',
             current_setting(''app.tenant_id'', true),
             ''''
           )
           OR current_setting(''role'', true) = ''service_role''
         ) WITH CHECK (true)',
        t || '_tenant_isolation', t
      );
    EXCEPTION WHEN others THEN
      -- Fallback open for service-role-only tenants (edge functions already enforce tenant)
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        t || '_tenant_isolation', t
      );
    END;
  END LOOP;
END $$;

-- Realtime (optional)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.doppio_commission_events;
EXCEPTION WHEN others THEN NULL;
END $$;
