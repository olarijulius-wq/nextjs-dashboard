ALTER TABLE IF EXISTS public.reminder_runs
  ADD COLUMN IF NOT EXISTS workspace_id uuid NULL;

ALTER TABLE IF EXISTS public.reminder_runs
  ADD COLUMN IF NOT EXISTS user_email text NULL;

ALTER TABLE IF EXISTS public.reminder_runs
  ADD COLUMN IF NOT EXISTS actor_email text NULL;

ALTER TABLE IF EXISTS public.reminder_runs
  ADD COLUMN IF NOT EXISTS config jsonb NULL;

CREATE INDEX IF NOT EXISTS idx_reminder_runs_workspace_ran_at
  ON public.reminder_runs (workspace_id, ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminder_runs_user_email_ran_at
  ON public.reminder_runs (lower(user_email), ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminder_runs_ran_at
  ON public.reminder_runs (ran_at DESC);

CREATE OR REPLACE FUNCTION public.try_parse_jsonb(input_text text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN input_text::jsonb;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

DO $$
DECLARE
  reminder_runs_exists boolean;
  raw_json_type text;
  json_expr text;
BEGIN
  SELECT to_regclass('public.reminder_runs') IS NOT NULL INTO reminder_runs_exists;
  IF NOT reminder_runs_exists THEN
    RETURN;
  END IF;

  SELECT c.data_type
  INTO raw_json_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'reminder_runs'
    AND c.column_name = 'raw_json';

  IF raw_json_type IS NULL THEN
    RETURN;
  END IF;

  IF raw_json_type IN ('json', 'jsonb') THEN
    json_expr := 'rr.raw_json::jsonb';
  ELSE
    json_expr := 'public.try_parse_jsonb(rr.raw_json::text)';
  END IF;

  EXECUTE format(
    $sql$
      WITH parsed AS (
        SELECT rr.id, %1$s AS j
        FROM public.reminder_runs rr
      ),
      candidates AS (
        SELECT
          p.id,
          MIN(c->>'workspaceId') AS workspace_id_text
        FROM parsed p
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.j->'candidates', '[]'::jsonb)) AS c
        WHERE (c->>'workspaceId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        GROUP BY p.id
      )
      UPDATE public.reminder_runs rr
      SET workspace_id = candidates.workspace_id_text::uuid
      FROM candidates
      WHERE rr.id = candidates.id
        AND rr.workspace_id IS NULL
    $sql$,
    json_expr
  );

  EXECUTE format(
    $sql$
      WITH parsed AS (
        SELECT rr.id, %1$s AS j
        FROM public.reminder_runs rr
      ),
      ids AS (
        SELECT
          p.id,
          invoice_id_text
        FROM parsed p
        CROSS JOIN LATERAL jsonb_array_elements_text(
          COALESCE(p.j->'updatedInvoiceIds', '[]'::jsonb)
        ) AS invoice_id_text
        WHERE invoice_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ),
      matched AS (
        SELECT
          ids.id,
          MIN(inv.user_email) AS user_email
        FROM ids
        JOIN public.invoices inv ON inv.id::text = ids.invoice_id_text
        GROUP BY ids.id
      )
      UPDATE public.reminder_runs rr
      SET user_email = matched.user_email
      FROM matched
      WHERE rr.id = matched.id
        AND rr.user_email IS NULL
    $sql$,
    json_expr
  );
END;
$$;

DROP FUNCTION IF EXISTS public.try_parse_jsonb(text);
