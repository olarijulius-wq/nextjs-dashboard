ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_code_hash text,
  ADD COLUMN IF NOT EXISTS two_factor_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS two_factor_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_reset_token text,
  ADD COLUMN IF NOT EXISTS password_reset_sent_at timestamptz;
