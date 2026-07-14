-- Guest feedback / reviews collected via QR bill link or staff log
CREATE TABLE IF NOT EXISTS public.doppio_guest_reviews (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.saas_tenants(id) ON DELETE CASCADE,
    guest_name text,
    rating integer NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
    comment text,
    source text NOT NULL DEFAULT 'staff',
    table_number text,
    bill_no text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doppio_guest_reviews_tenant_created
  ON public.doppio_guest_reviews (tenant_id, created_at DESC);

ALTER TABLE public.doppio_guest_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'doppio_guest_reviews' AND policyname = 'tenant_isolation_guest_reviews'
  ) THEN
    CREATE POLICY tenant_isolation_guest_reviews ON public.doppio_guest_reviews
      FOR ALL
      USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')::uuid
        OR tenant_id::text = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'tenant_id')::uuid
        OR tenant_id::text = current_setting('app.tenant_id', true));
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Policy creation may fail on hosts that use service-role-only access; table still usable via edge functions.
  RAISE NOTICE 'guest_reviews RLS policy skipped: %', SQLERRM;
END $$;
