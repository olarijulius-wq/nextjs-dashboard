CREATE TABLE IF NOT EXISTS public.workspace_unsubscribe_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  page_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_unsubscribes (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  normalized_email text NOT NULL,
  unsubscribed_at timestamptz NOT NULL DEFAULT now(),
  source text,
  PRIMARY KEY (workspace_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS idx_workspace_unsubscribes_workspace_id
  ON public.workspace_unsubscribes (workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_unsubscribes_normalized_email
  ON public.workspace_unsubscribes (normalized_email);

CREATE TABLE IF NOT EXISTS public.workspace_unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  normalized_email text NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_unsubscribe_tokens_workspace_id
  ON public.workspace_unsubscribe_tokens (workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_unsubscribe_tokens_normalized_email
  ON public.workspace_unsubscribe_tokens (normalized_email);
