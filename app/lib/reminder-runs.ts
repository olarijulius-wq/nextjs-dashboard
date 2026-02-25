import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const REMINDER_RUNS_MIGRATION_REQUIRED_CODE =
  'REMINDER_RUNS_MIGRATION_REQUIRED';

export type ReminderRunTriggeredBy = 'manual' | 'cron' | 'dev';

export type ReminderRunSkippedBreakdown = {
  paused?: number;
  unsubscribed?: number;
  missing_email?: number;
  not_eligible?: number;
  other?: number;
};

export type ReminderRunErrorItem = {
  invoiceId: string;
  recipientEmail: string;
  provider: 'resend' | 'smtp' | 'unknown';
  providerMessageId: string | null;
  errorCode: string | null;
  errorType: string | null;
  message: string;
};

export type ReminderRunItem = {
  invoiceId: string;
  recipientEmail: string;
  provider: 'resend' | 'smtp' | 'unknown';
  providerMessageId: string | null;
  status: 'sent' | 'error';
  errorCode: string | null;
  errorType: string | null;
  errorMessage: string | null;
};

export type ReminderRunInsertPayload = {
  triggeredBy: ReminderRunTriggeredBy;
  dryRun: boolean;
  attemptedCount: number;
  sentCount: number;
  skippedCount: number;
  errorCount: number;
  skippedBreakdown: ReminderRunSkippedBreakdown;
  durationMs: number | null;
  errors: ReminderRunErrorItem[];
  ranAt?: string | Date;
};

export type ReminderRunRecord = {
  id: string;
  workspaceId: string;
  ranAt: string;
  triggeredBy: ReminderRunTriggeredBy;
  dryRun: boolean;
  attemptedCount: number;
  sentCount: number;
  skippedCount: number;
  errorCount: number;
  skippedBreakdown: ReminderRunSkippedBreakdown;
  durationMs: number | null;
  errors: ReminderRunErrorItem[];
};

function buildReminderRunsMigrationRequiredError() {
  const error = new Error(REMINDER_RUNS_MIGRATION_REQUIRED_CODE) as Error & {
    code: string;
  };
  error.code = REMINDER_RUNS_MIGRATION_REQUIRED_CODE;
  return error;
}

export function isReminderRunsMigrationRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === REMINDER_RUNS_MIGRATION_REQUIRED_CODE ||
      error.message === REMINDER_RUNS_MIGRATION_REQUIRED_CODE)
  );
}

let reminderRunsSchemaReadyPromise: Promise<void> | null = null;
let reminderRunsSchemaMetaPromise: Promise<{
  hasAttemptedCount: boolean;
  hasRunItemsTable: boolean;
}> | null = null;

async function getReminderRunsSchemaMeta() {
  if (!reminderRunsSchemaMetaPromise) {
    reminderRunsSchemaMetaPromise = (async () => {
      const [result] = await sql<{
        runs: string | null;
        has_attempted_count: boolean;
        has_run_items_table: boolean;
      }[]>`
        select
          to_regclass('public.workspace_reminder_runs') as runs,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'workspace_reminder_runs'
              and column_name = 'attempted_count'
          ) as has_attempted_count,
          to_regclass('public.workspace_reminder_run_items') is not null as has_run_items_table
      `;

      if (!result?.runs) {
        throw buildReminderRunsMigrationRequiredError();
      }

      return {
        hasAttemptedCount: result.has_attempted_count,
        hasRunItemsTable: result.has_run_items_table,
      };
    })();
  }

  return reminderRunsSchemaMetaPromise;
}

export async function assertReminderRunsSchemaReady(): Promise<void> {
  if (!reminderRunsSchemaReadyPromise) {
    reminderRunsSchemaReadyPromise = (async () => {
      await getReminderRunsSchemaMeta();
    })();
  }

  return reminderRunsSchemaReadyPromise;
}

export async function insertReminderRun(
  workspaceId: string,
  payload: ReminderRunInsertPayload,
) {
  const schemaMeta = await getReminderRunsSchemaMeta();

  const ranAt =
    payload.ranAt instanceof Date
      ? payload.ranAt.toISOString()
      : typeof payload.ranAt === 'string'
        ? payload.ranAt
        : null;

  const [row] = await (schemaMeta.hasAttemptedCount
    ? sql<{
      id: string;
      workspace_id: string;
      ran_at: Date;
      triggered_by: ReminderRunTriggeredBy;
      dry_run: boolean;
      attempted_count: number | null;
      sent_count: number;
      skipped_count: number;
      error_count: number;
      skipped_breakdown: ReminderRunSkippedBreakdown;
      duration_ms: number | null;
      errors: ReminderRunErrorItem[];
    }[]>`
    insert into public.workspace_reminder_runs (
      workspace_id,
      ran_at,
      triggered_by,
      dry_run,
      attempted_count,
      sent_count,
      skipped_count,
      error_count,
      skipped_breakdown,
      duration_ms,
      errors
    )
    values (
      ${workspaceId},
      coalesce(${ranAt}::timestamptz, now()),
      ${payload.triggeredBy},
      ${payload.dryRun},
      ${payload.attemptedCount},
      ${payload.sentCount},
      ${payload.skippedCount},
      ${payload.errorCount},
      ${JSON.stringify(payload.skippedBreakdown)}::jsonb,
      ${payload.durationMs},
      ${JSON.stringify(payload.errors)}::jsonb
    )
    returning
      id,
      workspace_id,
      ran_at,
      triggered_by,
      dry_run,
      attempted_count,
      sent_count,
      skipped_count,
      error_count,
      skipped_breakdown,
      duration_ms,
      errors
  `
    : sql<{
    id: string;
    workspace_id: string;
    ran_at: Date;
    triggered_by: ReminderRunTriggeredBy;
    dry_run: boolean;
    attempted_count: number | null;
    sent_count: number;
    skipped_count: number;
    error_count: number;
    skipped_breakdown: ReminderRunSkippedBreakdown;
    duration_ms: number | null;
    errors: ReminderRunErrorItem[];
  }[]>`
    insert into public.workspace_reminder_runs (
      workspace_id,
      ran_at,
      triggered_by,
      dry_run,
      sent_count,
      skipped_count,
      error_count,
      skipped_breakdown,
      duration_ms,
      errors
    )
    values (
      ${workspaceId},
      coalesce(${ranAt}::timestamptz, now()),
      ${payload.triggeredBy},
      ${payload.dryRun},
      ${payload.sentCount},
      ${payload.skippedCount},
      ${payload.errorCount},
      ${JSON.stringify(payload.skippedBreakdown)}::jsonb,
      ${payload.durationMs},
      ${JSON.stringify(payload.errors)}::jsonb
    )
    returning
      id,
      workspace_id,
      ran_at,
      triggered_by,
      dry_run,
      null::integer as attempted_count,
      sent_count,
      skipped_count,
      error_count,
      skipped_breakdown,
      duration_ms,
      errors
  `);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ranAt: row.ran_at.toISOString(),
    triggeredBy: row.triggered_by,
    dryRun: row.dry_run,
    attemptedCount:
      typeof row.attempted_count === 'number'
        ? row.attempted_count
        : payload.attemptedCount,
    sentCount: row.sent_count,
    skippedCount: row.skipped_count,
    errorCount: row.error_count,
    skippedBreakdown: row.skipped_breakdown ?? {},
    durationMs: row.duration_ms,
    errors: Array.isArray(row.errors) ? row.errors : [],
  } satisfies ReminderRunRecord;
}

export async function insertReminderRunItems(input: {
  runId: string;
  workspaceId: string;
  items: ReminderRunItem[];
}) {
  const schemaMeta = await getReminderRunsSchemaMeta();
  if (!schemaMeta.hasRunItemsTable || input.items.length === 0) {
    return;
  }

  for (const item of input.items) {
    await sql`
      insert into public.workspace_reminder_run_items (
        run_id,
        workspace_id,
        invoice_id,
        recipient_email,
        provider,
        provider_message_id,
        status,
        error_code,
        error_type,
        error_message
      )
      values (
        ${input.runId},
        ${input.workspaceId},
        ${item.invoiceId},
        ${item.recipientEmail.toLowerCase()},
        ${item.provider},
        ${item.providerMessageId},
        ${item.status},
        ${item.errorCode},
        ${item.errorType},
        ${item.errorMessage}
      )
    `;
  }
}

export async function applyReminderDeliveryFailureByProviderMessageId(input: {
  provider: 'resend' | 'smtp' | 'unknown';
  providerMessageId: string;
  errorCode: string | null;
  errorType: string | null;
  errorMessage: string;
}) {
  const schemaMeta = await getReminderRunsSchemaMeta();
  if (!schemaMeta.hasRunItemsTable) {
    return { updatedRuns: 0, updatedItems: 0 };
  }

  const updatedItems = await sql<{
    run_id: string;
  }[]>`
    update public.workspace_reminder_run_items
    set
      status = 'error',
      error_code = ${input.errorCode},
      error_type = ${input.errorType},
      error_message = ${input.errorMessage.slice(0, 400)},
      updated_at = now()
    where lower(provider) = lower(${input.provider})
      and lower(provider_message_id) = lower(${input.providerMessageId})
      and status <> 'error'
    returning run_id
  `;

  if (updatedItems.length === 0) {
    return { updatedRuns: 0, updatedItems: 0 };
  }

  const runIds = Array.from(new Set(updatedItems.map((row) => row.run_id)));

  for (const runId of runIds) {
    const [counts] = await sql<{
      attempted_count: number;
      sent_count: number;
      error_count: number;
    }[]>`
      select
        count(*)::int as attempted_count,
        count(*) filter (where status = 'sent')::int as sent_count,
        count(*) filter (where status = 'error')::int as error_count
      from public.workspace_reminder_run_items
      where run_id = ${runId}
    `;

    const errorRows = await sql<{
      invoice_id: string;
      recipient_email: string;
      provider: 'resend' | 'smtp' | 'unknown';
      provider_message_id: string | null;
      error_code: string | null;
      error_type: string | null;
      error_message: string | null;
    }[]>`
      select
        invoice_id,
        recipient_email,
        provider,
        provider_message_id,
        error_code,
        error_type,
        error_message
      from public.workspace_reminder_run_items
      where run_id = ${runId}
        and status = 'error'
      order by updated_at desc, created_at desc
      limit 10
    `;

    const errorSamples = errorRows.map((row) => ({
      invoiceId: row.invoice_id,
      recipientEmail: row.recipient_email,
      provider: row.provider,
      providerMessageId: row.provider_message_id,
      errorCode: row.error_code,
      errorType: row.error_type,
      message: row.error_message ?? 'Delivery failed.',
    }));

    await sql`
      update public.workspace_reminder_runs
      set
        attempted_count = ${counts?.attempted_count ?? 0},
        sent_count = ${counts?.sent_count ?? 0},
        error_count = ${counts?.error_count ?? 0},
        errors = ${JSON.stringify(errorSamples)}::jsonb
      where id = ${runId}
    `;
  }

  return {
    updatedRuns: runIds.length,
    updatedItems: updatedItems.length,
  };
}

export async function listReminderRuns(workspaceId: string, limit = 25) {
  const schemaMeta = await getReminderRunsSchemaMeta();

  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(100, Math.trunc(limit)))
    : 25;

  const rows = await (schemaMeta.hasAttemptedCount
    ? sql<{
      id: string;
      workspace_id: string;
      ran_at: Date;
      triggered_by: ReminderRunTriggeredBy;
      dry_run: boolean;
      attempted_count: number | null;
      sent_count: number;
      skipped_count: number;
      error_count: number;
      skipped_breakdown: ReminderRunSkippedBreakdown;
      duration_ms: number | null;
      errors: ReminderRunErrorItem[];
    }[]>`
    select
      id,
      workspace_id,
      ran_at,
      triggered_by,
      dry_run,
      attempted_count,
      sent_count,
      skipped_count,
      error_count,
      skipped_breakdown,
      duration_ms,
      errors
    from public.workspace_reminder_runs
    where workspace_id = ${workspaceId}
    order by ran_at desc
    limit ${safeLimit}
  `
    : sql<{
    id: string;
    workspace_id: string;
    ran_at: Date;
    triggered_by: ReminderRunTriggeredBy;
    dry_run: boolean;
    attempted_count: number | null;
    sent_count: number;
    skipped_count: number;
    error_count: number;
    skipped_breakdown: ReminderRunSkippedBreakdown;
    duration_ms: number | null;
    errors: ReminderRunErrorItem[];
  }[]>`
    select
      id,
      workspace_id,
      ran_at,
      triggered_by,
      dry_run,
      null::integer as attempted_count,
      sent_count,
      skipped_count,
      error_count,
      skipped_breakdown,
      duration_ms,
      errors
    from public.workspace_reminder_runs
    where workspace_id = ${workspaceId}
    order by ran_at desc
    limit ${safeLimit}
  `);

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    ranAt: row.ran_at.toISOString(),
    triggeredBy: row.triggered_by,
    dryRun: row.dry_run,
    attemptedCount:
      typeof row.attempted_count === 'number'
        ? row.attempted_count
        : row.sent_count + row.error_count,
    sentCount: row.sent_count,
    skippedCount: row.skipped_count,
    errorCount: row.error_count,
    skippedBreakdown: row.skipped_breakdown ?? {},
    durationMs: row.duration_ms,
    errors: Array.isArray(row.errors) ? row.errors : [],
  })) satisfies ReminderRunRecord[];
}
