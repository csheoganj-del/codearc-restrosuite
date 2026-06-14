-- ============================================================
-- RestroSuite Feature Additions Migration
-- Run AFTER supabase_migration.sql
-- Adds: Online Orders (Swiggy/Zomato), Table Layout,
--       Waitlist, and Analytics helper views
-- ============================================================

-- ── 1. Online Orders (Swiggy / Zomato aggregators) ──────────

CREATE TABLE IF NOT EXISTS public.doppio_aggregator_config (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id   uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE NOT NULL,
    platform    text NOT NULL CHECK (platform IN ('swiggy', 'zomato', 'custom')),
    store_id    text NOT NULL,
    api_key     text NOT NULL,
    api_secret  text,
    enabled     boolean DEFAULT true,
    created_at  timestamptz DEFAULT now(),
    UNIQUE (tenant_id, platform)
);

CREATE TABLE IF NOT EXISTS public.doppio_online_orders (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id       uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE NOT NULL,
    platform        text NOT NULL CHECK (platform IN ('swiggy', 'zomato', 'custom')),
    platform_order_id text NOT NULL,
    status          text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','accepted','preparing','ready','picked_up','delivered','cancelled')),
    customer_name   text,
    customer_phone  text,
    items           jsonb NOT NULL DEFAULT '[]',
    subtotal        numeric(10,2) NOT NULL DEFAULT 0,
    tax             numeric(10,2) NOT NULL DEFAULT 0,
    delivery_charge numeric(10,2) NOT NULL DEFAULT 0,
    discount        numeric(10,2) NOT NULL DEFAULT 0,
    total           numeric(10,2) NOT NULL DEFAULT 0,
    delivery_address jsonb,
    estimated_pickup_at timestamptz,
    accepted_at     timestamptz,
    ready_at        timestamptz,
    notes           text,
    raw_payload     jsonb,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now(),
    UNIQUE (tenant_id, platform, platform_order_id)
);

ALTER TABLE public.doppio_online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doppio_aggregator_config ENABLE ROW LEVEL SECURITY;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_online_orders_tenant_status
    ON public.doppio_online_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_online_orders_created
    ON public.doppio_online_orders (tenant_id, created_at DESC);


-- ── 2. Table Layout ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.doppio_table_layout (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id   uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE NOT NULL,
    table_number text NOT NULL,
    label       text,                         -- "Window", "Patio", etc.
    capacity    integer NOT NULL DEFAULT 4,
    section     text DEFAULT 'main',          -- "main", "outdoor", "bar"
    status      text NOT NULL DEFAULT 'available'
                CHECK (status IN ('available','occupied','reserved','blocked')),
    current_order_id uuid,                    -- FK to doppio_pending_orders (soft ref)
    pos_x       integer DEFAULT 0,            -- for drag-drop floor plan (optional)
    pos_y       integer DEFAULT 0,
    created_at  timestamptz DEFAULT now(),
    UNIQUE (tenant_id, table_number)
);

ALTER TABLE public.doppio_table_layout ENABLE ROW LEVEL SECURITY;

-- Seed default 10 tables for existing tenants (skips if already present)
INSERT INTO public.doppio_table_layout (tenant_id, table_number, label, capacity, section)
SELECT
    t.id,
    n::text,
    'Table ' || n,
    CASE WHEN n <= 2 THEN 2 WHEN n <= 6 THEN 4 ELSE 6 END,
    CASE WHEN n <= 5 THEN 'main' ELSE 'outdoor' END
FROM public.saas_tenants t
CROSS JOIN generate_series(1, 10) AS n
ON CONFLICT (tenant_id, table_number) DO NOTHING;


-- ── 3. Waitlist ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.doppio_waitlist (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id       uuid REFERENCES public.saas_tenants(id) ON DELETE CASCADE NOT NULL,
    customer_name   text NOT NULL,
    customer_phone  text,
    party_size      integer NOT NULL DEFAULT 1,
    notes           text,
    status          text NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting','seated','cancelled','no_show')),
    joined_at       timestamptz DEFAULT now(),
    seated_at       timestamptz,
    table_id        uuid REFERENCES public.doppio_table_layout(id)
);

ALTER TABLE public.doppio_waitlist ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_waitlist_tenant_status
    ON public.doppio_waitlist (tenant_id, status, joined_at);


-- ── 4. Extend existing doppio_reservations (add missing cols) ─

ALTER TABLE public.doppio_reservations
    ADD COLUMN IF NOT EXISTS party_size    integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS table_id      uuid REFERENCES public.doppio_table_layout(id),
    ADD COLUMN IF NOT EXISTS status        text DEFAULT 'confirmed'
                                           CHECK (status IN ('confirmed','arrived','cancelled','no_show')),
    ADD COLUMN IF NOT EXISTS deposit_paid  numeric(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notes         text;


-- ── 5. Register new tables in TENANT_TABLES (api.js comment) ─
-- Add the following to the TENANT_TABLES set in src/dashboard/api.js:
--   "doppio_aggregator_config"
--   "doppio_online_orders"
--   "doppio_table_layout"
--   "doppio_waitlist"


-- ── 6. Analytics Views ───────────────────────────────────────

-- Hourly revenue (last 7 days)
CREATE OR REPLACE VIEW public.v_hourly_revenue AS
SELECT
    tenant_id,
    date_trunc('hour', created_at) AS hour,
    COUNT(*)                        AS order_count,
    SUM(total)                      AS revenue
FROM public.doppio_bills
WHERE created_at >= now() - interval '7 days'
GROUP BY tenant_id, date_trunc('hour', created_at);

-- Daily revenue (last 30 days)
CREATE OR REPLACE VIEW public.v_daily_revenue AS
SELECT
    tenant_id,
    created_at::date AS day,
    COUNT(*)          AS order_count,
    SUM(total)        AS revenue,
    AVG(total)        AS avg_order_value
FROM public.doppio_bills
GROUP BY tenant_id, created_at::date;

-- Item popularity
CREATE OR REPLACE VIEW public.v_item_popularity AS
SELECT
    tenant_id,
    item_name,
    SUM(quantity)     AS total_sold,
    SUM(total_price)  AS total_revenue,
    COUNT(DISTINCT bill_id) AS orders_appeared_in
FROM (
    SELECT
        b.tenant_id,
        b.id AS bill_id,
        item->>'name'  AS item_name,
        (item->>'qty')::numeric AS quantity,
        (item->>'price')::numeric * (item->>'qty')::numeric AS total_price
    FROM public.doppio_bills b,
         jsonb_array_elements(b.items::jsonb) AS item
    WHERE b.items IS NOT NULL AND b.items <> '' AND b.items <> 'null'
) sub
GROUP BY tenant_id, item_name;

-- Staff activity (attendance join)
CREATE OR REPLACE VIEW public.v_staff_activity AS
SELECT
    a.tenant_id,
    e.name                AS employee_name,
    e.role,
    a.date,
    a.status              AS attendance_status,
    a."clockInTime"       AS clock_in,
    a."clockOutTime"      AS clock_out,
    a."hoursWorked"       AS hours_worked
FROM public.doppio_attendance a
JOIN public.doppio_employees e
  ON e.id = a."employeeId" AND e.tenant_id = a.tenant_id;
