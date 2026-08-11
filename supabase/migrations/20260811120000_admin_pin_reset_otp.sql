-- Allow Admin PIN reset OTP challenges (WhatsApp/email OTP, no static reset codes)
ALTER TABLE public.public_otp_challenges
  DROP CONSTRAINT IF EXISTS public_otp_challenges_purpose_check;

ALTER TABLE public.public_otp_challenges
  ADD CONSTRAINT public_otp_challenges_purpose_check
  CHECK (purpose IN ('register', 'recovery', 'admin_pin_reset'));
