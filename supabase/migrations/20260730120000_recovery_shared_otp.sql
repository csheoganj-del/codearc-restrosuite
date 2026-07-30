-- Shared email + WhatsApp OTP recovery (same OTP both channels)
ALTER TABLE public.tenant_password_resets
  ADD COLUMN IF NOT EXISTS challenge_id uuid,
  ADD COLUMN IF NOT EXISTS otp_hash text,
  ADD COLUMN IF NOT EXISTS otp_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivered_whatsapp boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_password_resets_challenge_id_uidx
  ON public.tenant_password_resets (challenge_id)
  WHERE challenge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_password_resets_challenge_lookup_idx
  ON public.tenant_password_resets (challenge_id, expires_at DESC)
  WHERE used_at IS NULL;
