-- Keep tenant-level allowed_tabs aligned with the dashboard tab ids.
-- Earlier functions used online-tab/crm-tab internally while the UI exposes
-- aggregator-tab/customers-tab/floor-tab.

UPDATE public.saas_tenants
SET allowed_tabs = (
  SELECT array_agg(DISTINCT tab)
  FROM unnest(allowed_tabs || ARRAY['floor-tab', 'customers-tab', 'aggregator-tab']::text[]) AS tab
)
WHERE allowed_tabs IS NOT NULL;
