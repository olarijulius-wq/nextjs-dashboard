CREATE TABLE IF NOT EXISTS public.workspace_email_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend', 'smtp')),
  smtp_host text,
  smtp_port integer,
  smtp_secure boolean,
  smtp_username text,
  smtp_password text,
  from_name text,
  from_email text,
  reply_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
