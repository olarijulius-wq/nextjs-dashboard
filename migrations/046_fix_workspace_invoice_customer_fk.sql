DO $$
DECLARE
  legacy_constraint record;
BEGIN
  -- Remove legacy invoice->customer constraints that rely on user_email matching.
  FOR legacy_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'invoices'
      AND c.contype = 'f'
      AND c.confrelid = 'public.customers'::regclass
      AND EXISTS (
        SELECT 1
        FROM unnest(c.conkey) AS key(attnum)
        JOIN pg_attribute a
          ON a.attrelid = t.oid
         AND a.attnum = key.attnum
        WHERE a.attname = 'user_email'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS %I',
      legacy_constraint.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_customer_same_owner;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'customers'
      AND c.contype IN ('u', 'p')
      AND (
        SELECT array_agg(a.attname::text ORDER BY cols.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = t.oid
         AND a.attnum = cols.attnum
      ) = ARRAY['id', 'workspace_id']::text[]
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_id_workspace_id_key
      UNIQUE (id, workspace_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t
      ON t.oid = c.conrelid
    JOIN pg_namespace n
      ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'invoices'
      AND c.contype = 'f'
      AND c.confrelid = 'public.customers'::regclass
      AND (
        SELECT array_agg(a.attname::text ORDER BY cols.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = t.oid
         AND a.attnum = cols.attnum
      ) = ARRAY['customer_id', 'workspace_id']::text[]
      AND (
        SELECT array_agg(a.attname::text ORDER BY cols.ordinality)
        FROM unnest(c.confkey) WITH ORDINALITY AS cols(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = c.confrelid
         AND a.attnum = cols.attnum
      ) = ARRAY['id', 'workspace_id']::text[]
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_customer_workspace_fkey
      FOREIGN KEY (customer_id, workspace_id)
      REFERENCES public.customers (id, workspace_id)
      ON DELETE CASCADE;
  END IF;
END $$;