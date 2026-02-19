CREATE TABLE IF NOT EXISTS public.funnel_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email text NOT NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  source text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_user_email_event_at
  ON public.funnel_events (user_email, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_funnel_events_event_name_event_at
  ON public.funnel_events (event_name, event_at DESC);
