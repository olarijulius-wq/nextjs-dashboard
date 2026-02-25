CREATE TABLE IF NOT EXISTS public.workspace_reminder_run_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id uuid NOT NULL REFERENCES public.workspace_reminder_runs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('resend', 'smtp', 'unknown')),
  provider_message_id text,
  status text NOT NULL CHECK (status IN ('sent', 'error')),
  error_code text,
  error_type text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_reminder_run_items_run_id
  ON public.workspace_reminder_run_items (run_id);

CREATE INDEX IF NOT EXISTS idx_workspace_reminder_run_items_workspace_id_created_at
  ON public.workspace_reminder_run_items (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_reminder_run_items_provider_message_id
  ON public.workspace_reminder_run_items (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
