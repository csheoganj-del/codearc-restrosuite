-- ============================================================
-- Multi-Outlet Chain Migration Script
-- Run this in your Supabase SQL Editor to support restaurant chains.
-- ============================================================

-- 1. Create the saas_brands table representing the parent corporate brand
CREATE TABLE IF NOT EXISTS public.saas_brands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    corporate_slug TEXT UNIQUE NOT NULL,
    corporate_email TEXT NOT NULL,
    corporate_phone TEXT,
    billing_plan TEXT DEFAULT 'enterprise', -- 'standard', 'multi-outlet', 'enterprise'
    status TEXT DEFAULT 'active',            -- 'active', 'suspended', 'past_due'
    settings JSONB DEFAULT '{}'::jsonb,      -- default currency, timezone, tax settings
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Production hardening: Enable RLS on saas_brands
ALTER TABLE public.saas_brands ENABLE ROW LEVEL SECURITY;

-- 2. Alter the existing saas_tenants table to associate outlets to a brand
ALTER TABLE public.saas_tenants 
ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.saas_brands(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_central_warehouse BOOLEAN DEFAULT false;

-- 3. Create corporate user profiles for brand administrators
CREATE TABLE IF NOT EXISTS public.doppio_brand_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID NOT NULL REFERENCES public.saas_brands(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'brand_admin', -- 'brand_owner', 'brand_manager', 'brand_finance'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on doppio_brand_users
ALTER TABLE public.doppio_brand_users ENABLE ROW LEVEL SECURITY;

-- 4. Create the Master Menu Catalog table (owned by Brand corporate)
CREATE TABLE IF NOT EXISTS public.doppio_master_menu (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID NOT NULL REFERENCES public.saas_brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    is_veg BOOLEAN DEFAULT true,
    recipe_specs JSONB DEFAULT '{}'::jsonb, -- ingredients lists, allergen tags
    sku_code TEXT NOT NULL,                  -- matching inventory SKU across branches
    default_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on doppio_master_menu
ALTER TABLE public.doppio_master_menu ENABLE ROW LEVEL SECURITY;

-- 5. Update local outlet menu table for local override features
ALTER TABLE public.doppio_menu
ADD COLUMN IF NOT EXISTS master_id UUID REFERENCES public.doppio_master_menu(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS is_local_special BOOLEAN DEFAULT false;

-- 6. Create Inter-Outlet Stock Transfer logs and tracking
CREATE TABLE IF NOT EXISTS public.doppio_stock_transfers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID NOT NULL REFERENCES public.saas_brands(id) ON DELETE CASCADE,
    from_tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    to_tenant_id UUID NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'requested', -- 'requested', 'shipped', 'received', 'cancelled'
    requested_by UUID,
    approved_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    shipped_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ
);

-- Enable RLS on doppio_stock_transfers
ALTER TABLE public.doppio_stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.doppio_stock_transfer_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transfer_id UUID NOT NULL REFERENCES public.doppio_stock_transfers(id) ON DELETE CASCADE,
    item_sku TEXT NOT NULL,
    quantity_requested NUMERIC(10, 2) NOT NULL DEFAULT 0,
    quantity_shipped NUMERIC(10, 2),
    quantity_received NUMERIC(10, 2)
);

-- Enable RLS on doppio_stock_transfer_items
ALTER TABLE public.doppio_stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Row-Level Security Policies for Brand Isolation
-- ============================================================

-- Brand Users read policy
CREATE POLICY "Brand users read their own profile"
ON public.doppio_brand_users
FOR SELECT
USING (brand_id = (SELECT auth.jwt() ->> 'brand_id')::UUID);

-- Master Menu read policy: both corporate admins and outlet tenants belonging to the brand can read
CREATE POLICY "Brand and outlets read master menu"
ON public.doppio_master_menu
FOR SELECT
USING (
    brand_id = (SELECT auth.jwt() ->> 'brand_id')::UUID
    OR
    EXISTS (
        SELECT 1 FROM public.saas_tenants t
        WHERE t.id = (SELECT auth.jwt() ->> 'tenant_id')::UUID
          AND t.brand_id = doppio_master_menu.brand_id
    )
);

-- Stock transfers policy: visible to corporate admins or involved outlet tenants
CREATE POLICY "Brand and involved tenants access transfers"
ON public.doppio_stock_transfers
FOR ALL
USING (
    brand_id = (SELECT auth.jwt() ->> 'brand_id')::UUID
    OR
    from_tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::UUID
    OR
    to_tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::UUID
);
