CREATE TABLE IF NOT EXISTS public.reminder_runs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  triggered_by text NOT NULL,
  attempted integer NOT NULL,
  sent integer NOT NULL,
  failed integer NOT NULL,
  skipped integer NOT NULL,
  has_more boolean NOT NULL,
  duration_ms integer NOT NULL,
  raw_json jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_runs_ran_at
  ON public.reminder_runs (ran_at DESC);
