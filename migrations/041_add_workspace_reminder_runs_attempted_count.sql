ALTER TABLE IF EXISTS public.workspace_reminder_runs
  ADD COLUMN IF NOT EXISTS attempted_count integer NOT NULL DEFAULT 0;

UPDATE public.workspace_reminder_runs
SET attempted_count = sent_count + error_count
WHERE attempted_count = 0
  AND (sent_count > 0 OR error_count > 0);
