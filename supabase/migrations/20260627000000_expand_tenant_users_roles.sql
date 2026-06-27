-- Expand tenant_users role CHECK constraint to include all supported roles.
-- Previously only: admin, cashier, kitchen, waiter, customer_display
-- Adding: manager, captain, inventory

ALTER TABLE public.tenant_users
  DROP CONSTRAINT IF EXISTS tenant_users_role_check;

ALTER TABLE public.tenant_users
  ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('admin', 'manager', 'cashier', 'waiter', 'captain', 'kitchen', 'inventory', 'customer_display'));

-- Also expand status constraint to allow 'inactive' in addition to 'active'/'suspended'
-- (needed for soft-delete / deactivation flow)
ALTER TABLE public.tenant_users
  DROP CONSTRAINT IF EXISTS tenant_users_status_check;

ALTER TABLE public.tenant_users
  ADD CONSTRAINT tenant_users_status_check
  CHECK (status IN ('active', 'suspended', 'inactive'));
