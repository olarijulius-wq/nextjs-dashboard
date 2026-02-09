CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_user_id
  ON public.workspaces (owner_user_id);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id
  ON public.workspace_members (user_id);

CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  token text NOT NULL UNIQUE,
  invited_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  CONSTRAINT workspace_invites_email_not_empty CHECK (length(trim(email)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace_id
  ON public.workspace_invites (workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_email
  ON public.workspace_invites (lower(email));
