CREATE TABLE IF NOT EXISTS public.launch_checks (
  id BIGSERIAL PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT NOT NULL,
  env TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS launch_checks_ran_at_desc_idx
  ON public.launch_checks (ran_at DESC);
