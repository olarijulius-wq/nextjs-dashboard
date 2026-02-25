ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

WITH resolved AS (
  SELECT
    i.id,
    COALESCE(u.active_workspace_id, owner_membership.workspace_id) AS workspace_id
  FROM public.invoices i
  JOIN public.users u
    ON lower(u.email) = lower(i.user_email)
  LEFT JOIN LATERAL (
    SELECT wm.workspace_id
    FROM public.workspace_members wm
    WHERE wm.user_id = u.id
      AND wm.role = 'owner'
    ORDER BY wm.created_at ASC, wm.workspace_id ASC
    LIMIT 1
  ) owner_membership ON true
  WHERE i.workspace_id IS NULL
)
UPDATE public.invoices i
SET workspace_id = resolved.workspace_id
FROM resolved
WHERE i.id = resolved.id
  AND resolved.workspace_id IS NOT NULL;

WITH resolved AS (
  SELECT
    c.id,
    COALESCE(u.active_workspace_id, owner_membership.workspace_id) AS workspace_id
  FROM public.customers c
  JOIN public.users u
    ON lower(u.email) = lower(c.user_email)
  LEFT JOIN LATERAL (
    SELECT wm.workspace_id
    FROM public.workspace_members wm
    WHERE wm.user_id = u.id
      AND wm.role = 'owner'
    ORDER BY wm.created_at ASC, wm.workspace_id ASC
    LIMIT 1
  ) owner_membership ON true
  WHERE c.workspace_id IS NULL
)
UPDATE public.customers c
SET workspace_id = resolved.workspace_id
FROM resolved
WHERE c.id = resolved.id
  AND resolved.workspace_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_invoices_workspace_id'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT fk_invoices_workspace_id
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_customers_workspace_id'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT fk_customers_workspace_id
      FOREIGN KEY (workspace_id)
      REFERENCES public.workspaces(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_id
  ON public.invoices (workspace_id);

CREATE INDEX IF NOT EXISTS idx_customers_workspace_id
  ON public.customers (workspace_id);
