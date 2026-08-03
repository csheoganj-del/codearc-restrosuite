-- Super-admin internal notes per workspace (shared across browsers; not shown to tenants)
ALTER TABLE public.saas_tenants
  ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.saas_tenants.admin_notes IS
  'Internal Super-Admin notes (support history, onboarding). Never exposed to tenant UI.';
