import 'server-only';

import type { Sql } from 'postgres';
import { listReminderRunLogs } from '@/app/lib/reminder-run-logs';

const UUID_V4_OR_V5_REGEX =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

export type ReminderRunsSchema = {
  tableExists: boolean;
  hasWorkspaceId: boolean;
  hasUserEmail: boolean;
  hasActorEmail: boolean;
  hasConfig: boolean;
  rawJsonType: string | null;
};

export type ReminderRunsBadRowCounts = {
  totalBadRows: number;
  cronRunsMissingWorkspaceId: number;
  rowsMissingUserEmail: number;
  rowsWithUpdatedInvoiceIdsMissingUserEmail: number;
  rowsWithCandidateWorkspaceIdMissingWorkspaceId: number;
};

export type ReminderRunsDiagnosticsSampleRow = {
  id: string;
  ranAt: string;
  triggeredBy: string;
  sent: number;
  workspaceId: string | null;
  userEmail: string | null;
  candidateWorkspaceIds: string[];
  updatedInvoiceIdsLength: number;
};

export type ReminderRunsScopeCounts = {
  totalRuns: number;
  workspaceScopedRuns: number;
};

export type ReminderRunsBackfillResult = {
  workspaceIdFilled: number;
  userEmailFilled: number;
};

export type ReminderLogVisibilityAssertion = {
  ok: boolean;
  warning: string | null;
};

function toNumber(value: number | string | bigint | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function buildScopeWhereClause(
  schema: ReminderRunsSchema,
  workspaceId: string | null,
  userEmail: string | null,
) {
  const normalizedWorkspaceId = workspaceId?.trim() || null;
  const normalizedUserEmail = userEmail?.trim().toLowerCase() || null;

  if (schema.hasWorkspaceId && normalizedWorkspaceId) {
    return {
      whereClause: 'where rr.workspace_id = $1::uuid',
      values: [normalizedWorkspaceId],
      scopedBy: 'workspace' as const,
    };
  }

  if (schema.hasUserEmail && normalizedUserEmail) {
    return {
      whereClause: 'where lower(rr.user_email) = $1',
      values: [normalizedUserEmail],
      scopedBy: 'user' as const,
    };
  }

  return {
    whereClause: '',
    values: [] as string[],
    scopedBy: 'none' as const,
  };
}

async function withJsonExpr<T>(
  sql: Sql,
  rawJsonType: string | null,
  callback: (tx: Sql, jsonExpr: string) => Promise<T>,
) {
  if (rawJsonType === 'json' || rawJsonType === 'jsonb') {
    return callback(sql, 'rr.raw_json::jsonb');
  }

  return sql.begin(async (tx) => {
    const scopedTx = tx as unknown as Sql;

    await scopedTx`
      create or replace function pg_temp.try_parse_jsonb(input_text text)
      returns jsonb
      language plpgsql
      as $$
      begin
        return input_text::jsonb;
      exception
        when others then
          return null;
      end;
      $$
    `;

    return callback(scopedTx, 'pg_temp.try_parse_jsonb(rr.raw_json::text)');
  });
}

export async function getReminderRunsSchema(sql: Sql): Promise<ReminderRunsSchema> {
  const [row] = await sql<{
    runs: string | null;
    has_workspace_id: boolean;
    has_user_email: boolean;
    has_actor_email: boolean;
    has_config: boolean;
    raw_json_type: string | null;
  }[]>`
    select
      to_regclass('public.reminder_runs') as runs,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'reminder_runs'
          and column_name = 'workspace_id'
      ) as has_workspace_id,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'reminder_runs'
          and column_name = 'user_email'
      ) as has_user_email,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'reminder_runs'
          and column_name = 'actor_email'
      ) as has_actor_email,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'reminder_runs'
          and column_name = 'config'
      ) as has_config,
      (
        select c.data_type
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'reminder_runs'
          and c.column_name = 'raw_json'
        limit 1
      ) as raw_json_type
  `;

  if (!row?.runs) {
    return {
      tableExists: false,
      hasWorkspaceId: false,
      hasUserEmail: false,
      hasActorEmail: false,
      hasConfig: false,
      rawJsonType: null,
    };
  }

  return {
    tableExists: true,
    hasWorkspaceId: row.has_workspace_id,
    hasUserEmail: row.has_user_email,
    hasActorEmail: row.has_actor_email,
    hasConfig: row.has_config,
    rawJsonType: row.raw_json_type,
  };
}

export async function countBadRows(
  sql: Sql,
  schema?: ReminderRunsSchema,
): Promise<ReminderRunsBadRowCounts> {
  const resolvedSchema = schema ?? (await getReminderRunsSchema(sql));

  if (!resolvedSchema.tableExists) {
    return {
      totalBadRows: 0,
      cronRunsMissingWorkspaceId: 0,
      rowsMissingUserEmail: 0,
      rowsWithUpdatedInvoiceIdsMissingUserEmail: 0,
      rowsWithCandidateWorkspaceIdMissingWorkspaceId: 0,
    };
  }

  if (!resolvedSchema.rawJsonType) {
    const [row] = await sql<{ count: string }[]>`
      select count(*)::text as count
      from public.reminder_runs
    `;
    const total = toNumber(row?.count);
    return {
      totalBadRows: total,
      cronRunsMissingWorkspaceId: 0,
      rowsMissingUserEmail: 0,
      rowsWithUpdatedInvoiceIdsMissingUserEmail: 0,
      rowsWithCandidateWorkspaceIdMissingWorkspaceId: 0,
    };
  }

  return withJsonExpr(sql, resolvedSchema.rawJsonType, async (tx, jsonExpr) => {
    const query = `
      with parsed as (
        select
          rr.triggered_by,
          ${resolvedSchema.hasWorkspaceId ? 'rr.workspace_id::text' : 'null::text'} as workspace_id,
          ${resolvedSchema.hasUserEmail ? 'rr.user_email' : 'null::text'} as user_email,
          ${jsonExpr} as j
        from public.reminder_runs rr
      )
      select
        sum(case when parsed.triggered_by = 'cron' and parsed.workspace_id is null then 1 else 0 end)::text as cron_missing_workspace_id,
        sum(case when parsed.user_email is null then 1 else 0 end)::text as rows_missing_user_email,
        sum(case when jsonb_array_length(coalesce(parsed.j->'updatedInvoiceIds', '[]'::jsonb)) > 0 and parsed.user_email is null then 1 else 0 end)::text as rows_with_updated_invoice_ids_missing_user_email,
        sum(case when exists (
          select 1
          from jsonb_array_elements(coalesce(parsed.j->'candidates', '[]'::jsonb)) as c
          where nullif(c->>'workspaceId', '') is not null
        ) and parsed.workspace_id is null then 1 else 0 end)::text as rows_with_candidate_workspace_id_missing_workspace_id,
        sum(case when (
          (parsed.triggered_by = 'cron' and parsed.workspace_id is null)
          or parsed.user_email is null
          or (
            jsonb_array_length(coalesce(parsed.j->'updatedInvoiceIds', '[]'::jsonb)) > 0
            and parsed.user_email is null
          )
          or (
            exists (
              select 1
              from jsonb_array_elements(coalesce(parsed.j->'candidates', '[]'::jsonb)) as c
              where nullif(c->>'workspaceId', '') is not null
            )
            and parsed.workspace_id is null
          )
        ) then 1 else 0 end)::text as total_bad_rows
      from parsed
    `;

    const [row] = await tx.unsafe<{
      cron_missing_workspace_id: string;
      rows_missing_user_email: string;
      rows_with_updated_invoice_ids_missing_user_email: string;
      rows_with_candidate_workspace_id_missing_workspace_id: string;
      total_bad_rows: string;
    }[]>(query);

    return {
      totalBadRows: toNumber(row?.total_bad_rows),
      cronRunsMissingWorkspaceId: toNumber(row?.cron_missing_workspace_id),
      rowsMissingUserEmail: toNumber(row?.rows_missing_user_email),
      rowsWithUpdatedInvoiceIdsMissingUserEmail: toNumber(
        row?.rows_with_updated_invoice_ids_missing_user_email,
      ),
      rowsWithCandidateWorkspaceIdMissingWorkspaceId: toNumber(
        row?.rows_with_candidate_workspace_id_missing_workspace_id,
      ),
    };
  });
}

export async function sampleBadRows(
  sql: Sql,
  limit = 10,
  schema?: ReminderRunsSchema,
): Promise<ReminderRunsDiagnosticsSampleRow[]> {
  const resolvedSchema = schema ?? (await getReminderRunsSchema(sql));

  if (!resolvedSchema.tableExists || !resolvedSchema.rawJsonType) {
    return [];
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit))) : 10;

  return withJsonExpr(sql, resolvedSchema.rawJsonType, async (tx, jsonExpr) => {
    const query = `
      with parsed as (
        select
          rr.id,
          rr.ran_at,
          rr.triggered_by,
          rr.sent,
          ${resolvedSchema.hasWorkspaceId ? 'rr.workspace_id::text' : 'null::text'} as workspace_id,
          ${resolvedSchema.hasUserEmail ? 'rr.user_email' : 'null::text'} as user_email,
          ${jsonExpr} as j
        from public.reminder_runs rr
      )
      select
        parsed.id,
        parsed.ran_at,
        parsed.triggered_by,
        parsed.sent,
        parsed.workspace_id,
        parsed.user_email,
        coalesce((
          select array_agg(distinct c->>'workspaceId')
          from jsonb_array_elements(coalesce(parsed.j->'candidates', '[]'::jsonb)) as c
          where nullif(c->>'workspaceId', '') is not null
        ), '{}'::text[]) as candidate_workspace_ids,
        jsonb_array_length(coalesce(parsed.j->'updatedInvoiceIds', '[]'::jsonb))::integer as updated_invoice_ids_length
      from parsed
      where
        (parsed.triggered_by = 'cron' and parsed.workspace_id is null)
        or parsed.user_email is null
        or (
          jsonb_array_length(coalesce(parsed.j->'updatedInvoiceIds', '[]'::jsonb)) > 0
          and parsed.user_email is null
        )
        or (
          exists (
            select 1
            from jsonb_array_elements(coalesce(parsed.j->'candidates', '[]'::jsonb)) as c
            where nullif(c->>'workspaceId', '') is not null
          )
          and parsed.workspace_id is null
        )
      order by parsed.ran_at desc
      limit $1
    `;

    const rows = await tx.unsafe<{
      id: string;
      ran_at: Date;
      triggered_by: string;
      sent: number;
      workspace_id: string | null;
      user_email: string | null;
      candidate_workspace_ids: string[] | null;
      updated_invoice_ids_length: number;
    }[]>(query, [safeLimit]);

    return rows.map((row) => ({
      id: row.id,
      ranAt: row.ran_at.toISOString(),
      triggeredBy: row.triggered_by,
      sent: row.sent,
      workspaceId: row.workspace_id,
      userEmail: row.user_email,
      candidateWorkspaceIds: Array.isArray(row.candidate_workspace_ids)
        ? row.candidate_workspace_ids
        : [],
      updatedInvoiceIdsLength: toNumber(row.updated_invoice_ids_length),
    }));
  });
}

async function backfillWorkspaceIdOnly(
  tx: Sql,
  schema: ReminderRunsSchema,
): Promise<number> {
  if (!schema.hasWorkspaceId || !schema.rawJsonType) {
    return 0;
  }

  const jsonExpr =
    schema.rawJsonType === 'json' || schema.rawJsonType === 'jsonb'
      ? 'rr.raw_json::jsonb'
      : 'pg_temp.try_parse_jsonb(rr.raw_json::text)';

  const [row] = await tx.unsafe<{ filled: string }[]>(
    `
      with parsed as (
        select rr.id, ${jsonExpr} as j
        from public.reminder_runs rr
      ),
      candidates as (
        select
          p.id,
          min(c->>'workspaceId') as workspace_id_text
        from parsed p
        cross join lateral jsonb_array_elements(coalesce(p.j->'candidates', '[]'::jsonb)) as c
        where (c->>'workspaceId') ~* '${UUID_V4_OR_V5_REGEX}'
        group by p.id
      ),
      updated as (
        update public.reminder_runs rr
        set workspace_id = candidates.workspace_id_text::uuid
        from candidates
        where rr.id = candidates.id
          and rr.workspace_id is null
        returning rr.id
      )
      select count(*)::text as filled from updated
    `,
  );

  return toNumber(row?.filled);
}

export async function backfillWorkspaceFromCandidatesEvenIfNoSchemaCols(
  sql: Sql,
): Promise<number> {
  const schema = await getReminderRunsSchema(sql);
  if (!schema.tableExists || !schema.hasWorkspaceId) {
    return 0;
  }

  return sql.begin(async (tx) => {
    const scopedTx = tx as unknown as Sql;

    if (schema.rawJsonType !== 'json' && schema.rawJsonType !== 'jsonb') {
      await scopedTx`
        create or replace function pg_temp.try_parse_jsonb(input_text text)
        returns jsonb
        language plpgsql
        as $$
        begin
          return input_text::jsonb;
        exception
          when others then
            return null;
        end;
        $$
      `;
    }

    return backfillWorkspaceIdOnly(scopedTx, schema);
  });
}

export async function backfillScope(sql: Sql): Promise<ReminderRunsBackfillResult> {
  const schema = await getReminderRunsSchema(sql);

  if (!schema.tableExists) {
    return { workspaceIdFilled: 0, userEmailFilled: 0 };
  }

  return sql.begin(async (tx) => {
    const scopedTx = tx as unknown as Sql;

    if (schema.rawJsonType !== 'json' && schema.rawJsonType !== 'jsonb') {
      await scopedTx`
        create or replace function pg_temp.try_parse_jsonb(input_text text)
        returns jsonb
        language plpgsql
        as $$
        begin
          return input_text::jsonb;
        exception
          when others then
            return null;
        end;
        $$
      `;
    }

    const workspaceIdFilled = await backfillWorkspaceIdOnly(scopedTx, schema);

    let userEmailFilled = 0;
    if (schema.hasUserEmail && schema.rawJsonType) {
      const jsonExpr =
        schema.rawJsonType === 'json' || schema.rawJsonType === 'jsonb'
          ? 'rr.raw_json::jsonb'
          : 'pg_temp.try_parse_jsonb(rr.raw_json::text)';

      const [row] = await scopedTx.unsafe<{ filled: string }[]>(
        `
          with parsed as (
            select rr.id, ${jsonExpr} as j
            from public.reminder_runs rr
          ),
          ids as (
            select
              p.id,
              invoice_id_text
            from parsed p
            cross join lateral jsonb_array_elements_text(
              coalesce(p.j->'updatedInvoiceIds', '[]'::jsonb)
            ) as invoice_id_text
            where invoice_id_text ~* '${UUID_V4_OR_V5_REGEX}'
          ),
          matched as (
            select
              ids.id,
              min(lower(inv.user_email)) as user_email
            from ids
            join public.invoices inv on inv.id::text = ids.invoice_id_text
            group by ids.id
          ),
          updated as (
            update public.reminder_runs rr
            set user_email = matched.user_email
            from matched
            where rr.id = matched.id
              and rr.user_email is null
            returning rr.id
          )
          select count(*)::text as filled from updated
        `,
      );

      userEmailFilled = toNumber(row?.filled);
    }

    return {
      workspaceIdFilled,
      userEmailFilled,
    };
  });
}

export async function countScopeRuns(
  sql: Sql,
  input: { workspaceId: string | null; userEmail: string | null },
  schema?: ReminderRunsSchema,
): Promise<ReminderRunsScopeCounts> {
  const resolvedSchema = schema ?? (await getReminderRunsSchema(sql));
  if (!resolvedSchema.tableExists) {
    return { totalRuns: 0, workspaceScopedRuns: 0 };
  }

  const [totalRow] = await sql<{ count: string }[]>`
    select count(*)::text as count
    from public.reminder_runs
  `;

  const scope = buildScopeWhereClause(
    resolvedSchema,
    input.workspaceId,
    input.userEmail,
  );

  if (!scope.whereClause) {
    return {
      totalRuns: toNumber(totalRow?.count),
      workspaceScopedRuns: toNumber(totalRow?.count),
    };
  }

  const [scopeRow] = await sql.unsafe<{ count: string }[]>(
    `
      select count(*)::text as count
      from public.reminder_runs rr
      ${scope.whereClause}
    `,
    scope.values,
  );

  return {
    totalRuns: toNumber(totalRow?.count),
    workspaceScopedRuns: toNumber(scopeRow?.count),
  };
}

export async function assertLogVisibilityForWorkspace(
  sql: Sql,
  input: { workspaceId: string | null; userEmail: string | null },
): Promise<ReminderLogVisibilityAssertion> {
  try {
    const schema = await getReminderRunsSchema(sql);
    if (!schema.tableExists) {
      return { ok: true, warning: null };
    }

    const scopedRuns = await listReminderRunLogs({
      workspaceId: input.workspaceId,
      userEmail: input.userEmail,
      limit: 1000,
    });
    const scopedRunIds = new Set(scopedRuns.map((run) => run.id));
    const scope = buildScopeWhereClause(schema, input.workspaceId, input.userEmail);

    const whereParts = [scope.whereClause.replace(/^where\s+/i, '').trim(), "rr.triggered_by = 'manual'"]
      .filter(Boolean);
    const manualWhere = whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : '';

    const [latestManualRow] = await sql.unsafe<{
      id: string;
      ran_at: Date;
    }[]>(
      `
        select rr.id, rr.ran_at
        from public.reminder_runs rr
        ${manualWhere}
        order by rr.ran_at desc
        limit 1
      `,
      scope.values,
    );

    if (latestManualRow && !scopedRunIds.has(latestManualRow.id)) {
      return {
        ok: false,
        warning:
          'Visibility check failed: latest manual run for this scope was not returned by listReminderRunLogs().',
      };
    }

    if (!input.workspaceId || !schema.rawJsonType) {
      return { ok: true, warning: null };
    }

    const cronRows = await withJsonExpr(sql, schema.rawJsonType, async (tx, jsonExpr) => {
      const query = `
        with parsed as (
          select
            rr.id,
            rr.ran_at,
            rr.triggered_by,
            rr.sent,
            ${jsonExpr} as j
          from public.reminder_runs rr
        )
        select parsed.id
        from parsed
        where parsed.triggered_by = 'cron'
          and parsed.sent > 0
          and parsed.ran_at >= now() - interval '7 days'
          and exists (
            select 1
            from jsonb_array_elements(coalesce(parsed.j->'candidates', '[]'::jsonb)) as c
            where c->>'workspaceId' = $1
          )
      `;

      return tx.unsafe<{ id: string }[]>(query, [input.workspaceId]);
    });

    const missingCronIds = cronRows
      .map((row) => row.id)
      .filter((id) => !scopedRunIds.has(id));

    if (missingCronIds.length > 0) {
      return {
        ok: false,
        warning:
          'Visibility check failed: at least one recent sent cron run for this workspace is still missing from workspace-scoped logs.',
      };
    }

    return { ok: true, warning: null };
  } catch (error) {
    console.error('assertLogVisibilityForWorkspace failed:', error);
    return {
      ok: false,
      warning:
        'Visibility check failed unexpectedly while validating workspace-scoped reminder logs.',
    };
  }
}
