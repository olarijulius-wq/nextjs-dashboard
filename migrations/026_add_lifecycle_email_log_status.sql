ALTER TABLE public.lifecycle_email_logs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.lifecycle_email_logs
  ALTER COLUMN sent_at DROP NOT NULL;

ALTER TABLE public.lifecycle_email_logs
  ALTER COLUMN sent_at DROP DEFAULT;

UPDATE public.lifecycle_email_logs
SET status = 'sent'
WHERE sent_at IS NOT NULL
  AND status = 'pending';

CREATE INDEX IF NOT EXISTS idx_lifecycle_email_logs_status
  ON public.lifecycle_email_logs (status, last_attempt_at DESC);
