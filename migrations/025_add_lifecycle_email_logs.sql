CREATE TABLE IF NOT EXISTS public.lifecycle_email_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email_type text NOT NULL,
  idempotency_key text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lifecycle_email_logs_unique
  ON public.lifecycle_email_logs (user_id, email_type, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_lifecycle_email_logs_user_sent_at
  ON public.lifecycle_email_logs (user_id, sent_at DESC);
