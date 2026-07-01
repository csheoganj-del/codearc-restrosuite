CREATE TABLE IF NOT EXISTS public.public_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('register', 'recovery')),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_otp_challenges FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_public_otp_challenges_phone_purpose
  ON public.public_otp_challenges (phone_hash, purpose, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_public_otp_challenges_cleanup
  ON public.public_otp_challenges (expires_at)
  WHERE used_at IS NULL;
