-- Guest reviews: moderation + homepage publish flags
ALTER TABLE public.doppio_guest_reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS homepage_approved boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_doppio_guest_reviews_homepage
  ON public.doppio_guest_reviews (tenant_id, homepage_approved, created_at DESC)
  WHERE homepage_approved = true;

COMMENT ON COLUMN public.doppio_guest_reviews.status IS 'pending | approved | hidden | internal';
COMMENT ON COLUMN public.doppio_guest_reviews.homepage_approved IS 'Owner approved for marketing homepage / public stars';
