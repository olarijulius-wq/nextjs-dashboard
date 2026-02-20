import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const REMINDER_RUN_LOGS_MIGRATION_REQUIRED_CODE =
  'REMINDER_RUN_LOGS_MIGRATION_REQUIRED';

export type ReminderRunLogTriggeredBy = 'manual' | 'cron';

export type ReminderRunLogConfig = {
  batchSize: number;
  throttleMs: number;
  maxRunMs: number;
  dryRun: boolean;
};

export type ReminderRunLogInsertPayload = {
  triggeredBy: ReminderRunLogTriggeredBy;
  workspaceId?: string | null;
  userEmail?: string | null;
  actorEmail?: string | null;
  config?: ReminderRunLogConfig | null;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  hasMore: boolean;
  durationMs: number;
  rawJson: unknown;
  ranAt?: string | Date;
};

export type ReminderRunLogRecord = {
  id: string;
  ranAt: string;
  triggeredBy: string;
  workspaceId: string | null;
  userEmail: string | null;
  actorEmail: string | null;
  config: ReminderRunLogConfig | null;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  hasMore: boolean;
  durationMs: number;
  rawJson: Record<string, unknown> | null;
};

function buildReminderRunLogsMigrationRequiredError() {
  const error = new Error(REMINDER_RUN_LOGS_MIGRATION_REQUIRED_CODE) as Error & {
    code: string;
  };
  error.code = REMINDER_RUN_LOGS_MIGRATION_REQUIRED_CODE;
  return error;
}

export function isReminderRunLogsMigrationRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code ===
      REMINDER_RUN_LOGS_MIGRATION_REQUIRED_CODE ||
      error.message === REMINDER_RUN_LOGS_MIGRATION_REQUIRED_CODE)
  );
}

type ReminderRunLogsSchemaMeta = {
  hasWorkspaceId: boolean;
  hasUserEmail: boolean;
  hasActorEmail: boolean;
  hasConfig: boolean;
  rawJsonType: string | null;
};

export type ReminderRunLogsScopeMode = 'workspace' | 'account';

let reminderRunLogsSchemaReadyPromise: Promise<void> | null = null;
let reminderRunLogsSchemaMetaPromise: Promise<ReminderRunLogsSchemaMeta> | null = null;

async function getReminderRunLogsSchemaMeta() {
  if (!reminderRunLogsSchemaMetaPromise) {
    reminderRunLogsSchemaMetaPromise = (async () => {
      const [result] = await sql<{
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

      if (!result?.runs || !result.raw_json_type) {
        throw buildReminderRunLogsMigrationRequiredError();
      }

      return {
        hasWorkspaceId: result.has_workspace_id,
        hasUserEmail: result.has_user_email,
        hasActorEmail: result.has_actor_email,
        hasConfig: result.has_config,
        rawJsonType: result.raw_json_type,
      };
    })();
  }

  return reminderRunLogsSchemaMetaPromise;
}

export async function getReminderRunLogsScopeMode(): Promise<ReminderRunLogsScopeMode> {
  const schemaMeta = await getReminderRunLogsSchemaMeta();
  return schemaMeta.hasWorkspaceId ? 'workspace' : 'account';
}

export async function assertReminderRunLogsSchemaReady(): Promise<void> {
  if (!reminderRunLogsSchemaReadyPromise) {
    reminderRunLogsSchemaReadyPromise = (async () => {
      await getReminderRunLogsSchemaMeta();
    })();
  }

  return reminderRunLogsSchemaReadyPromise;
}

function normalizeConfig(value: unknown): ReminderRunLogConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const batchSize = Number(source.batchSize);
  const throttleMs = Number(source.throttleMs);
  const maxRunMs = Number(source.maxRunMs);
  const dryRun = source.dryRun;

  if (
    !Number.isFinite(batchSize) ||
    !Number.isFinite(throttleMs) ||
    !Number.isFinite(maxRunMs) ||
    typeof dryRun !== 'boolean'
  ) {
    return null;
  }

  return {
    batchSize: Math.trunc(batchSize),
    throttleMs: Math.trunc(throttleMs),
    maxRunMs: Math.trunc(maxRunMs),
    dryRun,
  };
}

function mapReminderRunLogRow(row: {
  id: string;
  ran_at: Date;
  triggered_by: string;
  workspace_id: string | null;
  user_email: string | null;
  actor_email: string | null;
  config: Record<string, unknown> | null;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  has_more: boolean;
  duration_ms: number;
  raw_json: unknown;
}): ReminderRunLogRecord {
  let raw: Record<string, unknown> | null = null;
  if (row.raw_json && typeof row.raw_json === 'object') {
    raw = row.raw_json as Record<string, unknown>;
  } else if (typeof row.raw_json === 'string') {
    try {
      const parsed = JSON.parse(row.raw_json);
      raw = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      raw = null;
    }
  }
  const rawActorEmail =
    raw && typeof raw.actorEmail === 'string' ? raw.actorEmail.trim().toLowerCase() : null;
  const rawConfig =
    raw && typeof raw.config === 'object' && raw.config !== null ? raw.config : null;

  return {
    id: row.id,
    ranAt: row.ran_at.toISOString(),
    triggeredBy: row.triggered_by,
    workspaceId: row.workspace_id,
    userEmail: row.user_email,
    actorEmail: row.actor_email ?? rawActorEmail,
    config: normalizeConfig(row.config) ?? normalizeConfig(rawConfig),
    attempted: row.attempted,
    sent: row.sent,
    failed: row.failed,
    skipped: row.skipped,
    hasMore: row.has_more,
    durationMs: row.duration_ms,
    rawJson: raw,
  };
}

export async function insertReminderRunLog(payload: ReminderRunLogInsertPayload) {
  const schemaMeta = await getReminderRunLogsSchemaMeta();

  const ranAt =
    payload.ranAt instanceof Date
      ? payload.ranAt.toISOString()
      : typeof payload.ranAt === 'string'
        ? payload.ranAt
        : null;
  const workspaceId = payload.workspaceId?.trim() || null;
  const userEmail = payload.userEmail?.trim().toLowerCase() || null;
  const actorEmail = payload.actorEmail?.trim().toLowerCase() || null;
  const config = payload.config ? JSON.stringify(payload.config) : null;

  const columns = [
    'ran_at',
    'triggered_by',
    'attempted',
    'sent',
    'failed',
    'skipped',
    'has_more',
    'duration_ms',
    'raw_json',
  ];
  const values: Array<string | number | boolean | null> = [
    ranAt,
    payload.triggeredBy,
    payload.attempted,
    payload.sent,
    payload.failed,
    payload.skipped,
    payload.hasMore,
    payload.durationMs,
    JSON.stringify(payload.rawJson),
  ];

  if (schemaMeta.hasWorkspaceId) {
    columns.push('workspace_id');
    values.push(workspaceId);
  }

  if (schemaMeta.hasUserEmail) {
    columns.push('user_email');
    values.push(userEmail);
  }

  if (schemaMeta.hasActorEmail) {
    columns.push('actor_email');
    values.push(actorEmail);
  }

  if (schemaMeta.hasConfig) {
    columns.push('config');
    values.push(config);
  }

  const valueExpressions = [
    'coalesce($1::timestamptz, now())',
    '$2',
    '$3',
    '$4',
    '$5',
    '$6',
    '$7',
    '$8',
    schemaMeta.rawJsonType === 'json' || schemaMeta.rawJsonType === 'jsonb'
      ? '$9::jsonb'
      : '$9::text',
  ];

  valueExpressions.push(
    ...columns.slice(9).map((column, index) => {
      const placeholder = `$${10 + index}`;
      if (column === 'workspace_id') {
        return `${placeholder}::uuid`;
      }
      if (column === 'config') {
        return `${placeholder}::jsonb`;
      }
      return placeholder;
    }),
  );

  const query = `
    insert into public.reminder_runs (${columns.join(', ')})
    values (${valueExpressions.join(', ')})
    returning
      id,
      ran_at,
      triggered_by,
      ${schemaMeta.hasWorkspaceId ? 'workspace_id' : 'null::uuid as workspace_id'},
      ${schemaMeta.hasUserEmail ? 'user_email' : 'null::text as user_email'},
      ${schemaMeta.hasActorEmail ? 'actor_email' : 'null::text as actor_email'},
      ${schemaMeta.hasConfig ? 'config' : 'null::jsonb as config'},
      attempted,
      sent,
      failed,
      skipped,
      has_more,
      duration_ms,
      ${
        schemaMeta.rawJsonType === 'json' || schemaMeta.rawJsonType === 'jsonb'
          ? 'raw_json::jsonb as raw_json'
          : 'raw_json::text as raw_json'
      }
  `;

  const [row] = await sql.unsafe<{
    id: string;
    ran_at: Date;
    triggered_by: string;
    workspace_id: string | null;
    user_email: string | null;
    actor_email: string | null;
    config: Record<string, unknown> | null;
    attempted: number;
    sent: number;
    failed: number;
    skipped: number;
    has_more: boolean;
    duration_ms: number;
    raw_json: unknown;
  }[]>(query, values);

  if (!row) {
    throw new Error('Failed to write reminder run log.');
  }

  return mapReminderRunLogRow(row);
}

export async function listReminderRunLogs(options?: {
  limit?: number;
  workspaceId?: string | null;
  userEmail?: string | null;
}) {
  await assertReminderRunLogsSchemaReady();

  const schemaMeta = await getReminderRunLogsSchemaMeta();
  const safeLimit = Number.isFinite(options?.limit)
    ? Math.max(1, Math.min(100, Math.trunc(options?.limit ?? 20)))
    : 20;
  const workspaceId = options?.workspaceId?.trim() || null;
  const userEmail = options?.userEmail?.trim().toLowerCase() || null;

  const baseSelect = `
    select
      id,
      ran_at,
      triggered_by,
      ${schemaMeta.hasWorkspaceId ? 'workspace_id' : 'null::uuid as workspace_id'},
      ${schemaMeta.hasUserEmail ? 'user_email' : 'null::text as user_email'},
      ${schemaMeta.hasActorEmail ? 'actor_email' : 'null::text as actor_email'},
      ${schemaMeta.hasConfig ? 'config' : 'null::jsonb as config'},
      attempted,
      sent,
      failed,
      skipped,
      has_more,
      duration_ms,
      ${
        schemaMeta.rawJsonType === 'json' || schemaMeta.rawJsonType === 'jsonb'
          ? 'raw_json::jsonb as raw_json'
          : 'raw_json::text as raw_json'
      }
    from public.reminder_runs
  `;

  let rows: Array<{
    id: string;
    ran_at: Date;
    triggered_by: string;
    workspace_id: string | null;
    user_email: string | null;
    actor_email: string | null;
    config: Record<string, unknown> | null;
    attempted: number;
    sent: number;
    failed: number;
    skipped: number;
    has_more: boolean;
    duration_ms: number;
    raw_json: unknown;
  }> = [];

  if (schemaMeta.hasWorkspaceId && workspaceId) {
    rows = await sql.unsafe(
      `${baseSelect}
       where workspace_id = $1::uuid
       order by ran_at desc
       limit $2`,
      [workspaceId, safeLimit],
    );
  } else if (schemaMeta.hasUserEmail && userEmail) {
    rows = await sql.unsafe(
      `${baseSelect}
       where lower(user_email) = $1
       order by ran_at desc
       limit $2`,
      [userEmail, safeLimit],
    );
  } else {
    rows = await sql.unsafe(
      `${baseSelect}
       order by ran_at desc
       limit $1`,
      [safeLimit],
    );
  }

  return rows.map((row) => mapReminderRunLogRow(row));
}
