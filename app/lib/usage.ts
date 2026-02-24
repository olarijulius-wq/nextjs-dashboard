import type postgres from 'postgres';
import { sql } from '@/app/lib/db';

export const USAGE_MIGRATION_REQUIRED_CODE = 'USAGE_MIGRATION_REQUIRED';

export type UsageEventType =
  | 'invoice_created'
  | 'invoice_updated'
  | 'reminder_sent'
  | 'reminder_skipped'
  | 'reminder_error'
  | 'unsubscribe'
  | 'resubscribe'
  | 'smtp_test_sent';

export type UsageSummary = Record<UsageEventType, number>;

export type InvoiceUsageMetric = 'created' | 'sent' | 'paid' | 'issued';
export type InvoiceDailyWindow = '7d' | '30d';
export type UsageTimezone = 'Europe/Tallinn';

export type UsageScope = {
  scopeType: 'workspace' | 'user';
  workspaceId?: string;
  userEmail: string;
};

export type UsageTopReason = {
  reason: string;
  count: number;
};

export type TallinnWindow = {
  startUtc: Date;
  endUtc: Date;
  startDate: string;
  endDate: string;
  timezone: UsageTimezone;
};

export type TallinnMonthWindow = {
  monthStart: Date;
  monthEnd: Date;
  monthStartDate: string;
  monthEndDate: string;
  timezone: UsageTimezone;
};

export type InvoiceMetricDebug = {
  metric: InvoiceUsageMetric;
  columnUsed: string;
  warning: string | null;
  error: string | null;
  createdFallback: 'issued_at' | null;
  scope: UsageScope;
  timezone: UsageTimezone;
};

export type InvoiceDailyPoint = {
  date: string;
  count: number;
};

export type ReminderDailyPoint = {
  date: string;
  sent: number;
  skipped: number;
  error: number;
};

export type UsageTimeseriesPoint = {
  date: string;
  invoiceCreated: number;
  reminderSent: number;
  reminderSkipped: number;
  reminderError: number;
};

export type UsageTimeseriesResult = {
  points: UsageTimeseriesPoint[];
  debug: {
    scopeKey: 'workspace' | 'user_email';
    normalizedDateColumn: string;
    timezone: UsageTimezone;
    invoiceMetric: InvoiceUsageMetric;
    warning: string | null;
    error: string | null;
  };
};

export type ReminderDailyDebug = {
  scope: UsageScope;
  warning: string | null;
  error: string | null;
  source: 'reminder_runs';
  timezone: UsageTimezone;
};

export type ReminderDailyResult = {
  points: ReminderDailyPoint[];
  totals: {
    sent: number;
    skipped: number;
    error: number;
  };
  debug: ReminderDailyDebug;
};

export type UsageVerifyResult = {
  scope: 'workspace' | 'user_email';
  timezone: UsageTimezone;
  monthWindow: {
    startUtc: string;
    endUtc: string;
  };
  dailyWindow: {
    startUtc: string;
    endUtc: string;
  };
  invoiceMetric: InvoiceUsageMetric;
  source: {
    table: 'invoices' | 'invoice_email_logs' | 'missing';
    column: string;
    fallbackUsed: boolean;
    notes: string[];
  };
  monthTotal: number;
  sumDaily: number;
  match: boolean;
  planMonthUsed: number;
  planMatch: boolean;
  reason: string | null;
};

type InvoiceMetricStrategy = {
  dateExpression: string | null;
  normalizedDateColumn: string;
  warning: string | null;
  error: string | null;
  createdFallback: 'issued_at' | null;
  extraPredicate?: postgres.PendingQuery<postgres.Row[]>;
};

type UsageSchemaCapabilities = {
  hasWorkspaceUsageEvents: boolean;
  hasInvoicesTable: boolean;
  hasInvoicesWorkspaceId: boolean;
  hasInvoicesUserEmail: boolean;
  hasInvoicesCreatedAt: boolean;
  hasInvoicesIssuedAt: boolean;
  hasInvoicesPaidAt: boolean;
  hasInvoicesUpdatedAt: boolean;
  hasInvoicesStatus: boolean;
  hasInvoiceEmailLogsTable: boolean;
  hasInvoiceEmailLogsWorkspaceId: boolean;
  hasInvoiceEmailLogsStatus: boolean;
  hasInvoiceEmailLogsSentAt: boolean;
  hasReminderRunsTable: boolean;
  hasReminderRunsWorkspaceId: boolean;
  hasReminderRunsUserEmail: boolean;
  hasReminderRunsRanAt: boolean;
  hasReminderRunsSent: boolean;
  hasReminderRunsSkipped: boolean;
  hasReminderRunsFailed: boolean;
  hasReminderRunsRawJson: boolean;
  reminderRunsRawJsonType: string | null;
};

function coerceValidDate(value: Date | string | null | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

function buildUsageMigrationRequiredError() {
  const error = new Error(USAGE_MIGRATION_REQUIRED_CODE) as Error & {
    code: string;
  };
  error.code = USAGE_MIGRATION_REQUIRED_CODE;
  return error;
}

export function isUsageMigrationRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === USAGE_MIGRATION_REQUIRED_CODE ||
      error.message === USAGE_MIGRATION_REQUIRED_CODE)
  );
}

let usageSchemaReadyPromise: Promise<void> | null = null;

export async function assertUsageSchemaReady(): Promise<void> {
  if (!usageSchemaReadyPromise) {
    usageSchemaReadyPromise = (async () => {
      const [result] = await sql<{ usage_events: string | null }[]>`
        select to_regclass('public.workspace_usage_events') as usage_events
      `;

      if (!result?.usage_events) {
        throw buildUsageMigrationRequiredError();
      }
    })();
  }

  return usageSchemaReadyPromise;
}

type RecordUsageEventInput = {
  workspaceId: string;
  eventType: UsageEventType;
  entityId?: string | null;
  metadata?: Record<string, string | number | boolean | null> | null;
};

export async function recordUsageEvent(input: RecordUsageEventInput) {
  await assertUsageSchemaReady();
  const metadataJson = input.metadata ? sql.json(input.metadata) : null;

  await sql`
    insert into public.workspace_usage_events (
      workspace_id,
      event_type,
      entity_id,
      metadata
    )
    values (
      ${input.workspaceId},
      ${input.eventType},
      ${input.entityId ?? null},
      ${metadataJson}
    )
  `;
}

function emptySummary(): UsageSummary {
  return {
    invoice_created: 0,
    invoice_updated: 0,
    reminder_sent: 0,
    reminder_skipped: 0,
    reminder_error: 0,
    unsubscribe: 0,
    resubscribe: 0,
    smtp_test_sent: 0,
  };
}

let usageSchemaCapabilitiesPromise: Promise<UsageSchemaCapabilities> | null = null;

async function getUsageSchemaCapabilities(): Promise<UsageSchemaCapabilities> {
  if (!usageSchemaCapabilitiesPromise) {
    usageSchemaCapabilitiesPromise = (async () => {
      const [tables] = await sql<{
        workspace_usage_events: string | null;
        invoices: string | null;
        invoice_email_logs: string | null;
        reminder_runs: string | null;
      }[]>`
        select
          to_regclass('public.workspace_usage_events')::text as workspace_usage_events,
          to_regclass('public.invoices')::text as invoices,
          to_regclass('public.invoice_email_logs')::text as invoice_email_logs,
          to_regclass('public.reminder_runs')::text as reminder_runs
      `;

      const columns = await sql<{
        table_name: string;
        column_name: string;
        data_type: string;
      }[]>`
        select table_name, column_name, data_type
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('invoices', 'invoice_email_logs', 'reminder_runs')
      `;

      const columnSet = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
      const reminderRunsRawJson = columns.find(
        (row) => row.table_name === 'reminder_runs' && row.column_name === 'raw_json',
      );

      return {
        hasWorkspaceUsageEvents: Boolean(tables?.workspace_usage_events),
        hasInvoicesTable: Boolean(tables?.invoices),
        hasInvoicesWorkspaceId: columnSet.has('invoices.workspace_id'),
        hasInvoicesUserEmail: columnSet.has('invoices.user_email'),
        hasInvoicesCreatedAt: columnSet.has('invoices.created_at'),
        hasInvoicesIssuedAt: columnSet.has('invoices.issued_at'),
        hasInvoicesPaidAt: columnSet.has('invoices.paid_at'),
        hasInvoicesUpdatedAt: columnSet.has('invoices.updated_at'),
        hasInvoicesStatus: columnSet.has('invoices.status'),
        hasInvoiceEmailLogsTable: Boolean(tables?.invoice_email_logs),
        hasInvoiceEmailLogsWorkspaceId: columnSet.has('invoice_email_logs.workspace_id'),
        hasInvoiceEmailLogsStatus: columnSet.has('invoice_email_logs.status'),
        hasInvoiceEmailLogsSentAt: columnSet.has('invoice_email_logs.sent_at'),
        hasReminderRunsTable: Boolean(tables?.reminder_runs),
        hasReminderRunsWorkspaceId: columnSet.has('reminder_runs.workspace_id'),
        hasReminderRunsUserEmail: columnSet.has('reminder_runs.user_email'),
        hasReminderRunsRanAt: columnSet.has('reminder_runs.ran_at'),
        hasReminderRunsSent: columnSet.has('reminder_runs.sent'),
        hasReminderRunsSkipped: columnSet.has('reminder_runs.skipped'),
        hasReminderRunsFailed: columnSet.has('reminder_runs.failed'),
        hasReminderRunsRawJson: columnSet.has('reminder_runs.raw_json'),
        reminderRunsRawJsonType: reminderRunsRawJson?.data_type ?? null,
      };
    })();
  }

  return usageSchemaCapabilitiesPromise;
}

export async function resolveUsageScope(input: {
  workspaceId?: string | null;
  userEmail: string;
  preferWorkspace: boolean;
  workspaceColumnAvailable: boolean;
}): Promise<UsageScope> {
  const normalizedUserEmail = input.userEmail.trim().toLowerCase();

  if (
    input.preferWorkspace &&
    input.workspaceColumnAvailable &&
    typeof input.workspaceId === 'string' &&
    input.workspaceId.trim() !== ''
  ) {
    return {
      scopeType: 'workspace',
      workspaceId: input.workspaceId,
      userEmail: normalizedUserEmail,
    };
  }

  return {
    scopeType: 'user',
    userEmail: normalizedUserEmail,
  };
}

export async function getTallinnMonthWindow(now: Date = new Date()): Promise<TallinnWindow> {
  const safeNow = coerceValidDate(now, new Date());
  const nowIso = safeNow.toISOString();
  const [row] = await sql<{
    start_utc: Date;
    end_utc: Date;
    start_date: string;
    end_date: string;
  }[]>`
    select
      (date_trunc('month', ${nowIso}::timestamptz at time zone 'Europe/Tallinn')
        at time zone 'Europe/Tallinn') as start_utc,
      ((date_trunc('month', ${nowIso}::timestamptz at time zone 'Europe/Tallinn') + interval '1 month')
        at time zone 'Europe/Tallinn') as end_utc,
      to_char(date_trunc('month', ${nowIso}::timestamptz at time zone 'Europe/Tallinn'), 'YYYY-MM-DD') as start_date,
      to_char(date_trunc('month', ${nowIso}::timestamptz at time zone 'Europe/Tallinn') + interval '1 month', 'YYYY-MM-DD') as end_date
  `;

  const fallbackStart = new Date(Date.UTC(safeNow.getUTCFullYear(), safeNow.getUTCMonth(), 1));
  const fallbackEnd = new Date(Date.UTC(safeNow.getUTCFullYear(), safeNow.getUTCMonth() + 1, 1));

  return {
    startUtc: coerceValidDate(row?.start_utc, fallbackStart),
    endUtc: coerceValidDate(row?.end_utc, fallbackEnd),
    startDate: row.start_date,
    endDate: row.end_date,
    timezone: 'Europe/Tallinn',
  };
}

export async function getTallinnLastNDaysWindow(
  days: number,
  now: Date = new Date(),
): Promise<TallinnWindow> {
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(90, Math.trunc(days))) : 30;
  const safeNow = coerceValidDate(now, new Date());
  const nowIso = safeNow.toISOString();
  const [row] = await sql<{
    start_utc: Date;
    end_utc: Date;
    start_date: string;
    end_date: string;
  }[]>`
    with local_bounds as (
      select
        date_trunc('day', ${nowIso}::timestamptz at time zone 'Europe/Tallinn') - (${safeDays - 1} * interval '1 day') as start_day,
        date_trunc('day', ${nowIso}::timestamptz at time zone 'Europe/Tallinn') + interval '1 day' as end_day
    )
    select
      ((select start_day from local_bounds) at time zone 'Europe/Tallinn') as start_utc,
      ((select end_day from local_bounds) at time zone 'Europe/Tallinn') as end_utc,
      to_char((select start_day from local_bounds), 'YYYY-MM-DD') as start_date,
      to_char((select end_day from local_bounds), 'YYYY-MM-DD') as end_date
  `;

  const fallbackEnd = safeNow;
  const fallbackStart = new Date(safeNow.getTime() - (safeDays - 1) * 24 * 60 * 60 * 1000);

  return {
    startUtc: coerceValidDate(row?.start_utc, fallbackStart),
    endUtc: coerceValidDate(row?.end_utc, fallbackEnd),
    startDate: row.start_date,
    endDate: row.end_date,
    timezone: 'Europe/Tallinn',
  };
}

export async function fetchCurrentTallinnMonthWindow(): Promise<TallinnMonthWindow> {
  const month = await getTallinnMonthWindow();
  return {
    monthStart: month.startUtc,
    monthEnd: month.endUtc,
    monthStartDate: month.startDate,
    monthEndDate: month.endDate,
    timezone: month.timezone,
  };
}

function normalizeMetric(metric: string | null | undefined): InvoiceUsageMetric {
  if (metric === 'sent' || metric === 'paid' || metric === 'issued') {
    return metric;
  }
  return 'created';
}

function resolveInvoiceMetricStrategy(
  metric: InvoiceUsageMetric,
  schema: UsageSchemaCapabilities,
): InvoiceMetricStrategy {
  if (metric === 'created') {
    if (schema.hasInvoicesCreatedAt) {
      return {
        dateExpression: 'i.created_at',
        normalizedDateColumn: 'invoices.created_at',
        warning: null,
        error: null,
        createdFallback: null,
      };
    }

    if (schema.hasInvoicesIssuedAt) {
      return {
        dateExpression: 'i.issued_at',
        normalizedDateColumn: 'invoices.issued_at',
        warning: 'Created timestamp not available; using Issued date.',
        error: null,
        createdFallback: 'issued_at',
      };
    }

    return {
      dateExpression: null,
      normalizedDateColumn: 'missing(invoices.created_at|invoices.issued_at)',
      warning: null,
      error:
        'Invoice created metric is unavailable: missing invoices.created_at and invoices.issued_at. Add one of these columns.',
      createdFallback: null,
    };
  }

  if (metric === 'issued') {
    if (schema.hasInvoicesIssuedAt) {
      return {
        dateExpression: 'i.issued_at',
        normalizedDateColumn: 'invoices.issued_at',
        warning: null,
        error: null,
        createdFallback: null,
      };
    }

    return {
      dateExpression: null,
      normalizedDateColumn: 'missing(invoices.issued_at)',
      warning: null,
      error: 'Issued metric is unavailable: missing invoices.issued_at.',
      createdFallback: null,
    };
  }

  if (metric === 'paid') {
    if (schema.hasInvoicesPaidAt) {
      return {
        dateExpression: 'i.paid_at',
        normalizedDateColumn: 'invoices.paid_at',
        warning: null,
        error: null,
        createdFallback: null,
      };
    }

    return {
      dateExpression: null,
      normalizedDateColumn: 'missing(invoices.paid_at)',
      warning: null,
      error: 'Paid metric is unavailable: missing invoices.paid_at.',
      createdFallback: null,
    };
  }

  if (!schema.hasInvoiceEmailLogsTable) {
    return {
      dateExpression: null,
      normalizedDateColumn: 'missing(invoice_email_logs)',
      warning: null,
      error:
        'Sent metric is unavailable: missing table invoice_email_logs (migration 033_add_job_locks_and_invoice_email_logs.sql).',
      createdFallback: null,
    };
  }

  if (!schema.hasInvoiceEmailLogsSentAt) {
    return {
      dateExpression: null,
      normalizedDateColumn: 'missing(invoice_email_logs.sent_at)',
      warning: null,
      error:
        'Sent metric is unavailable: missing invoice_email_logs.sent_at (migration 033_add_job_locks_and_invoice_email_logs.sql).',
      createdFallback: null,
    };
  }

  return {
    dateExpression: 'l.sent_at',
    normalizedDateColumn: 'invoice_email_logs.sent_at',
    warning: null,
    error: null,
    createdFallback: null,
    extraPredicate: schema.hasInvoiceEmailLogsStatus ? sql`and l.status = 'sent'` : sql``,
  };
}

function buildInvoiceScopePredicate(scope: UsageScope, schema: UsageSchemaCapabilities) {
  if (scope.scopeType === 'workspace' && schema.hasInvoicesWorkspaceId) {
    return sql`i.workspace_id = ${scope.workspaceId!}`;
  }

  if (schema.hasInvoicesUserEmail) {
    return sql`lower(i.user_email) = ${scope.userEmail}`;
  }

  return null;
}

function buildReminderScopePredicate(scope: UsageScope, schema: UsageSchemaCapabilities) {
  if (scope.scopeType === 'workspace' && schema.hasReminderRunsWorkspaceId) {
    return sql`rr.workspace_id = ${scope.workspaceId!}`;
  }

  if (schema.hasReminderRunsUserEmail) {
    return sql`lower(rr.user_email) = ${scope.userEmail}`;
  }

  return null;
}

async function fetchInvoiceMetricCountForWindow(input: {
  workspaceId?: string | null;
  userEmail: string;
  metric: InvoiceUsageMetric;
  window: TallinnWindow;
}): Promise<{ count: number; debug: InvoiceMetricDebug }> {
  const schema = await getUsageSchemaCapabilities();
  const strategy = resolveInvoiceMetricStrategy(input.metric, schema);

  const scope = await resolveUsageScope({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    preferWorkspace: true,
    workspaceColumnAvailable:
      schema.hasInvoicesWorkspaceId || schema.hasInvoiceEmailLogsWorkspaceId,
  });

  if (!schema.hasInvoicesTable) {
    return {
      count: 0,
      debug: {
        metric: input.metric,
        columnUsed: 'missing(invoices)',
        warning: null,
        error: 'Invoices table is missing.',
        createdFallback: null,
        scope,
        timezone: 'Europe/Tallinn',
      },
    };
  }

  if (strategy.error || !strategy.dateExpression) {
    return {
      count: 0,
      debug: {
        metric: input.metric,
        columnUsed: strategy.normalizedDateColumn,
        warning: strategy.warning,
        error: strategy.error,
        createdFallback: strategy.createdFallback,
        scope,
        timezone: 'Europe/Tallinn',
      },
    };
  }

  if (input.metric === 'sent') {
    const invoiceScopePredicate = buildInvoiceScopePredicate(scope, schema);
    if (!invoiceScopePredicate) {
      return {
        count: 0,
        debug: {
          metric: input.metric,
          columnUsed: strategy.normalizedDateColumn,
          warning: strategy.warning,
          error:
            'Cannot apply sent metric scope: invoices.user_email/workspace_id columns are unavailable.',
          createdFallback: strategy.createdFallback,
          scope,
          timezone: 'Europe/Tallinn',
        },
      };
    }

    const [row] = await sql<{ count: string }[]>`
      select count(*)::text as count
      from public.invoice_email_logs l
      join public.invoices i on i.id = l.invoice_id
      where ${invoiceScopePredicate}
        and l.sent_at is not null
        ${strategy.extraPredicate ?? sql``}
        and l.sent_at >= ${input.window.startUtc.toISOString()}
        and l.sent_at < ${input.window.endUtc.toISOString()}
    `;

    return {
      count: Number(row?.count ?? '0'),
      debug: {
        metric: input.metric,
        columnUsed: strategy.normalizedDateColumn,
        warning: strategy.warning,
        error: null,
        createdFallback: strategy.createdFallback,
        scope,
        timezone: 'Europe/Tallinn',
      },
    };
  }

  const scopePredicate = buildInvoiceScopePredicate(scope, schema);
  if (!scopePredicate) {
    return {
      count: 0,
      debug: {
        metric: input.metric,
        columnUsed: strategy.normalizedDateColumn,
        warning: strategy.warning,
        error:
          'Cannot apply invoice metric scope: invoices.user_email/workspace_id columns are unavailable.',
        createdFallback: strategy.createdFallback,
        scope,
        timezone: 'Europe/Tallinn',
      },
    };
  }

  const [row] = await sql<{ count: string }[]>`
    select count(*)::text as count
    from public.invoices i
    where ${scopePredicate}
      and ${sql.unsafe(strategy.dateExpression)} is not null
      ${strategy.extraPredicate ?? sql``}
      and ${sql.unsafe(strategy.dateExpression)} >= ${input.window.startUtc.toISOString()}
      and ${sql.unsafe(strategy.dateExpression)} < ${input.window.endUtc.toISOString()}
  `;

  return {
    count: Number(row?.count ?? '0'),
    debug: {
      metric: input.metric,
      columnUsed: strategy.normalizedDateColumn,
      warning: strategy.warning,
      error: null,
      createdFallback: strategy.createdFallback,
      scope,
      timezone: 'Europe/Tallinn',
    },
  };
}

async function fetchDateSeries(window: TallinnWindow): Promise<string[]> {
  const rows = await sql<{ date: string }[]>`
    select to_char(day, 'YYYY-MM-DD') as date
    from generate_series(
      ${window.startDate}::date,
      (${window.endDate}::date - interval '1 day')::date,
      interval '1 day'
    ) as day
    order by day asc
  `;
  return rows.map((row) => row.date);
}

async function fetchInvoiceDailySeriesForWindow(input: {
  workspaceId?: string | null;
  userEmail: string;
  window: TallinnWindow;
  metric: InvoiceUsageMetric;
}): Promise<{ points: InvoiceDailyPoint[]; debug: InvoiceMetricDebug }> {
  const schema = await getUsageSchemaCapabilities();
  const strategy = resolveInvoiceMetricStrategy(input.metric, schema);
  const scope = await resolveUsageScope({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    preferWorkspace: true,
    workspaceColumnAvailable:
      schema.hasInvoicesWorkspaceId || schema.hasInvoiceEmailLogsWorkspaceId,
  });
  const dates = await fetchDateSeries(input.window);

  if (strategy.error || !strategy.dateExpression) {
    return {
      points: dates.map((date) => ({ date, count: 0 })),
      debug: {
        metric: input.metric,
        columnUsed: strategy.normalizedDateColumn,
        warning: strategy.warning,
        error: strategy.error,
        createdFallback: strategy.createdFallback,
        scope,
        timezone: 'Europe/Tallinn',
      },
    };
  }

  if (input.metric === 'sent') {
    const invoiceScopePredicate = buildInvoiceScopePredicate(scope, schema);
    if (!invoiceScopePredicate) {
      return {
        points: dates.map((date) => ({ date, count: 0 })),
        debug: {
          metric: input.metric,
          columnUsed: strategy.normalizedDateColumn,
          warning: strategy.warning,
          error:
            'Cannot apply sent metric scope: invoices.user_email/workspace_id columns are unavailable.',
          createdFallback: strategy.createdFallback,
          scope,
          timezone: 'Europe/Tallinn',
        },
      };
    }

    const rows = await sql<{ date: string; count: string }[]>`
      with grouped as (
        select
          date_trunc('day', l.sent_at at time zone 'Europe/Tallinn') as day,
          count(*)::text as count
        from public.invoice_email_logs l
        join public.invoices i on i.id = l.invoice_id
        where ${invoiceScopePredicate}
          and l.sent_at is not null
          ${strategy.extraPredicate ?? sql``}
          and l.sent_at >= ${input.window.startUtc.toISOString()}
          and l.sent_at < ${input.window.endUtc.toISOString()}
        group by date_trunc('day', l.sent_at at time zone 'Europe/Tallinn')
      )
      select
        to_char(gs.day, 'YYYY-MM-DD') as date,
        coalesce(grouped.count, '0') as count
      from generate_series(
        ${input.window.startDate}::date,
        (${input.window.endDate}::date - interval '1 day')::date,
        interval '1 day'
      ) as gs(day)
      left join grouped on grouped.day = gs.day
      order by gs.day asc
    `;

    return {
      points: rows.map((row) => ({ date: row.date, count: Number(row.count) })),
      debug: {
        metric: input.metric,
        columnUsed: strategy.normalizedDateColumn,
        warning: strategy.warning,
        error: null,
        createdFallback: strategy.createdFallback,
        scope,
        timezone: 'Europe/Tallinn',
      },
    };
  }

  const scopePredicate = buildInvoiceScopePredicate(scope, schema);
  if (!scopePredicate) {
    return {
      points: dates.map((date) => ({ date, count: 0 })),
      debug: {
        metric: input.metric,
        columnUsed: strategy.normalizedDateColumn,
        warning: strategy.warning,
        error:
          'Cannot apply invoice metric scope: invoices.user_email/workspace_id columns are unavailable.',
        createdFallback: strategy.createdFallback,
        scope,
        timezone: 'Europe/Tallinn',
      },
    };
  }

  const rows = await sql<{ date: string; count: string }[]>`
    with grouped as (
      select
        date_trunc('day', ${sql.unsafe(strategy.dateExpression)} at time zone 'Europe/Tallinn') as day,
        count(*)::text as count
      from public.invoices i
      where ${scopePredicate}
        and ${sql.unsafe(strategy.dateExpression)} is not null
        ${strategy.extraPredicate ?? sql``}
        and ${sql.unsafe(strategy.dateExpression)} >= ${input.window.startUtc.toISOString()}
        and ${sql.unsafe(strategy.dateExpression)} < ${input.window.endUtc.toISOString()}
      group by date_trunc('day', ${sql.unsafe(strategy.dateExpression)} at time zone 'Europe/Tallinn')
    )
    select
      to_char(gs.day, 'YYYY-MM-DD') as date,
      coalesce(grouped.count, '0') as count
    from generate_series(
      ${input.window.startDate}::date,
      (${input.window.endDate}::date - interval '1 day')::date,
      interval '1 day'
    ) as gs(day)
    left join grouped on grouped.day = gs.day
    order by gs.day asc
  `;

  return {
    points: rows.map((row) => ({ date: row.date, count: Number(row.count) })),
    debug: {
      metric: input.metric,
      columnUsed: strategy.normalizedDateColumn,
      warning: strategy.warning,
      error: null,
      createdFallback: strategy.createdFallback,
      scope,
      timezone: 'Europe/Tallinn',
    },
  };
}

export async function fetchInvoiceDailySeries(input: {
  workspaceId?: string | null;
  userEmail: string;
  days?: number;
  win?: InvoiceDailyWindow;
  timezone?: UsageTimezone;
  metric: InvoiceUsageMetric;
}): Promise<{ points: InvoiceDailyPoint[]; debug: InvoiceMetricDebug }> {
  const window = Number.isFinite(input.days)
    ? await getTallinnLastNDaysWindow(input.days as number)
    : await getDailyWindow(input.win ?? '7d', input.timezone ?? 'Europe/Tallinn');
  return fetchInvoiceDailySeriesForWindow({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    window,
    metric: input.metric,
  });
}

export async function fetchCurrentMonthInvoiceMetricDailySeries(input: {
  workspaceId?: string | null;
  userEmail: string;
  metric: InvoiceUsageMetric;
}): Promise<{
  points: InvoiceDailyPoint[];
  debug: InvoiceMetricDebug;
  window: TallinnMonthWindow;
}> {
  const month = await getTallinnMonthWindow();
  const daily = await fetchInvoiceDailySeriesForWindow({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    window: month,
    metric: input.metric,
  });

  return {
    ...daily,
    window: {
      monthStart: month.startUtc,
      monthEnd: month.endUtc,
      monthStartDate: month.startDate,
      monthEndDate: month.endDate,
      timezone: month.timezone,
    },
  };
}

export async function fetchReminderDailySeries(input: {
  workspaceId?: string | null;
  userEmail: string;
  days: number;
}): Promise<ReminderDailyResult> {
  const schema = await getUsageSchemaCapabilities();
  const window = await getTallinnLastNDaysWindow(input.days);
  const scope = await resolveUsageScope({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    preferWorkspace: true,
    workspaceColumnAvailable: schema.hasReminderRunsWorkspaceId,
  });

  const dates = await fetchDateSeries(window);

  if (!schema.hasReminderRunsTable || !schema.hasReminderRunsRanAt) {
    return {
      points: dates.map((date) => ({ date, sent: 0, skipped: 0, error: 0 })),
      totals: { sent: 0, skipped: 0, error: 0 },
      debug: {
        scope,
        warning: null,
        error:
          'Reminder analytics is unavailable: missing reminder_runs or reminder_runs.ran_at.',
        source: 'reminder_runs',
        timezone: 'Europe/Tallinn',
      },
    };
  }

  const scopePredicate = buildReminderScopePredicate(scope, schema);
  if (!scopePredicate) {
    return {
      points: dates.map((date) => ({ date, sent: 0, skipped: 0, error: 0 })),
      totals: { sent: 0, skipped: 0, error: 0 },
      debug: {
        scope,
        warning: null,
        error:
          'Cannot apply reminder scope: reminder_runs.workspace_id/user_email columns are unavailable.',
        source: 'reminder_runs',
        timezone: 'Europe/Tallinn',
      },
    };
  }

  if (!schema.hasReminderRunsSent || !schema.hasReminderRunsSkipped || !schema.hasReminderRunsFailed) {
    return {
      points: dates.map((date) => ({ date, sent: 0, skipped: 0, error: 0 })),
      totals: { sent: 0, skipped: 0, error: 0 },
      debug: {
        scope,
        warning: null,
        error:
          'Reminder analytics is unavailable: missing reminder_runs sent/skipped/failed columns.',
        source: 'reminder_runs',
        timezone: 'Europe/Tallinn',
      },
    };
  }

  const rows = await sql<{
    date: string;
    sent: string;
    skipped: string;
    error: string;
  }[]>`
    with grouped as (
      select
        date_trunc('day', rr.ran_at at time zone 'Europe/Tallinn') as day,
        sum(rr.sent)::text as sent,
        sum(rr.skipped)::text as skipped,
        sum(rr.failed)::text as error
      from public.reminder_runs rr
      where ${scopePredicate}
        and rr.ran_at >= ${window.startUtc.toISOString()}
        and rr.ran_at < ${window.endUtc.toISOString()}
      group by date_trunc('day', rr.ran_at at time zone 'Europe/Tallinn')
    )
    select
      to_char(gs.day, 'YYYY-MM-DD') as date,
      coalesce(grouped.sent, '0') as sent,
      coalesce(grouped.skipped, '0') as skipped,
      coalesce(grouped.error, '0') as error
    from generate_series(
      ${window.startDate}::date,
      (${window.endDate}::date - interval '1 day')::date,
      interval '1 day'
    ) as gs(day)
    left join grouped on grouped.day = gs.day
    order by gs.day asc
  `;

  const points = rows.map((row) => ({
    date: row.date,
    sent: Number(row.sent),
    skipped: Number(row.skipped),
    error: Number(row.error),
  }));

  return {
    points,
    totals: {
      sent: points.reduce((acc, point) => acc + point.sent, 0),
      skipped: points.reduce((acc, point) => acc + point.skipped, 0),
      error: points.reduce((acc, point) => acc + point.error, 0),
    },
    debug: {
      scope,
      warning:
        scope.scopeType === 'workspace' && schema.hasReminderRunsWorkspaceId
          ? 'Legacy reminder runs with NULL workspace_id are excluded from workspace scope.'
          : null,
      error: null,
      source: 'reminder_runs',
      timezone: 'Europe/Tallinn',
    },
  };
}

export async function fetchUsageSummary(
  workspaceId: string,
  userEmail: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<UsageSummary> {
  await assertUsageSchemaReady();
  const safeMonthStart = coerceValidDate(monthStart, new Date());
  const safeMonthEnd = coerceValidDate(
    monthEnd,
    new Date(safeMonthStart.getTime() + 31 * 24 * 60 * 60 * 1000),
  );

  const window: TallinnWindow = {
    startUtc: safeMonthStart,
    endUtc: safeMonthEnd,
    startDate: safeMonthStart.toISOString().slice(0, 10),
    endDate: safeMonthEnd.toISOString().slice(0, 10),
    timezone: 'Europe/Tallinn',
  };

  const [eventRows, created] = await Promise.all([
    sql<{ event_type: UsageEventType; count: string }[]>`
      select event_type, count(*)::text as count
      from public.workspace_usage_events
      where workspace_id = ${workspaceId}
        and occurred_at >= ${safeMonthStart.toISOString()}
        and occurred_at < ${safeMonthEnd.toISOString()}
        and event_type in ('invoice_updated', 'unsubscribe', 'resubscribe', 'smtp_test_sent')
      group by event_type
    `,
    fetchInvoiceMetricCountForWindow({
      workspaceId,
      userEmail,
      metric: 'created',
      window,
    }),
  ]);

  const summary = emptySummary();
  for (const row of eventRows) {
    summary[row.event_type] = Number(row.count);
  }

  summary.invoice_created = created.count;

  const monthReminderTotals = await fetchReminderTotalsForWindow({
    workspaceId,
    userEmail,
    window,
  });

  summary.reminder_sent = monthReminderTotals.sent;
  summary.reminder_skipped = monthReminderTotals.skipped;
  summary.reminder_error = monthReminderTotals.error;

  return summary;
}

async function fetchReminderTotalsForWindow(input: {
  workspaceId?: string | null;
  userEmail: string;
  window: TallinnWindow;
}) {
  const schema = await getUsageSchemaCapabilities();
  const scope = await resolveUsageScope({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    preferWorkspace: true,
    workspaceColumnAvailable: schema.hasReminderRunsWorkspaceId,
  });
  const scopePredicate = buildReminderScopePredicate(scope, schema);

  if (
    !schema.hasReminderRunsTable ||
    !schema.hasReminderRunsRanAt ||
    !schema.hasReminderRunsSent ||
    !schema.hasReminderRunsSkipped ||
    !schema.hasReminderRunsFailed ||
    !scopePredicate
  ) {
    return { sent: 0, skipped: 0, error: 0 };
  }

  const [row] = await sql<{ sent: string; skipped: string; error: string }[]>`
    select
      coalesce(sum(rr.sent), 0)::text as sent,
      coalesce(sum(rr.skipped), 0)::text as skipped,
      coalesce(sum(rr.failed), 0)::text as error
    from public.reminder_runs rr
    where ${scopePredicate}
      and rr.ran_at >= ${input.window.startUtc.toISOString()}
      and rr.ran_at < ${input.window.endUtc.toISOString()}
  `;

  return {
    sent: Number(row?.sent ?? '0'),
    skipped: Number(row?.skipped ?? '0'),
    error: Number(row?.error ?? '0'),
  };
}

export async function fetchUsageTimeseries(input: {
  workspaceId: string;
  userEmail: string;
  days?: number;
  invoiceMetric?: string | null;
}): Promise<UsageTimeseriesResult> {
  await assertUsageSchemaReady();

  const safeDays = Number.isFinite(input.days)
    ? Math.max(1, Math.min(90, input.days ?? 30))
    : 30;
  const metric = normalizeMetric(input.invoiceMetric);

  const [invoiceSeries, reminderSeries] = await Promise.all([
    fetchInvoiceDailySeries({
      workspaceId: input.workspaceId,
      userEmail: input.userEmail,
      days: safeDays,
      metric,
    }),
    fetchReminderDailySeries({
      workspaceId: input.workspaceId,
      userEmail: input.userEmail,
      days: safeDays,
    }),
  ]);

  const points = invoiceSeries.points.map((invoicePoint, index) => {
    const reminderPoint = reminderSeries.points[index];
    return {
      date: invoicePoint.date,
      invoiceCreated: invoicePoint.count,
      reminderSent: reminderPoint?.sent ?? 0,
      reminderSkipped: reminderPoint?.skipped ?? 0,
      reminderError: reminderPoint?.error ?? 0,
    };
  });

  return {
    points,
    debug: {
      scopeKey: invoiceSeries.debug.scope.scopeType === 'workspace' ? 'workspace' : 'user_email',
      normalizedDateColumn: invoiceSeries.debug.columnUsed,
      timezone: invoiceSeries.debug.timezone,
      invoiceMetric: metric,
      warning: invoiceSeries.debug.warning,
      error: invoiceSeries.debug.error,
    },
  };
}

export function normalizeUsageInvoiceMetric(metric: string | null | undefined): InvoiceUsageMetric {
  return normalizeMetric(metric);
}

export function normalizeUsageInvoiceWindow(
  win: string | null | undefined,
): InvoiceDailyWindow {
  return win === '30d' ? '30d' : '7d';
}

export async function getDailyWindow(
  win: InvoiceDailyWindow,
  timezone: UsageTimezone = 'Europe/Tallinn',
): Promise<TallinnWindow> {
  const days = win === '30d' ? 30 : 7;
  const window = await getTallinnLastNDaysWindow(days);
  return {
    ...window,
    timezone,
  };
}

export async function fetchCurrentMonthInvoiceMetricCount(input: {
  userEmail: string;
  workspaceId?: string | null;
  metric: InvoiceUsageMetric;
}): Promise<{
  count: number;
  normalizedDateColumn: string;
  scopeKey: 'workspace' | 'user_email';
  createdFallback: 'issued_at' | null;
  warning: string | null;
  error: string | null;
  window: TallinnMonthWindow;
}> {
  const month = await getTallinnMonthWindow();
  const metricCount = await fetchInvoiceMetricCountForWindow({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    metric: input.metric,
    window: month,
  });

  return {
    count: metricCount.count,
    normalizedDateColumn: metricCount.debug.columnUsed,
    scopeKey: metricCount.debug.scope.scopeType === 'workspace' ? 'workspace' : 'user_email',
    createdFallback: metricCount.debug.createdFallback,
    warning: metricCount.debug.warning,
    error: metricCount.debug.error,
    window: {
      monthStart: month.startUtc,
      monthEnd: month.endUtc,
      monthStartDate: month.startDate,
      monthEndDate: month.endDate,
      timezone: month.timezone,
    },
  };
}

export async function fetchCurrentMonthCreatedInvoiceDailySum(input: {
  userEmail: string;
  workspaceId?: string | null;
}): Promise<{
  sum: number;
  normalizedDateColumn: string;
  scopeKey: 'workspace' | 'user_email';
  createdFallback: 'issued_at' | null;
  warning: string | null;
  error: string | null;
  window: TallinnMonthWindow;
}> {
  const daily = await fetchCurrentMonthInvoiceMetricDailySeries({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    metric: 'created',
  });

  return {
    sum: daily.points.reduce((acc, point) => acc + point.count, 0),
    normalizedDateColumn: daily.debug.columnUsed,
    scopeKey: daily.debug.scope.scopeType === 'workspace' ? 'workspace' : 'user_email',
    createdFallback: daily.debug.createdFallback,
    warning: daily.debug.warning,
    error: daily.debug.error,
    window: {
      monthStart: daily.window.monthStart,
      monthEnd: daily.window.monthEnd,
      monthStartDate: daily.window.monthStartDate,
      monthEndDate: daily.window.monthEndDate,
      timezone: daily.window.timezone,
    },
  };
}

export async function fetchUsageTopReasons(input: {
  workspaceId?: string | null;
  userEmail: string;
  monthStart: Date;
  monthEnd: Date;
}): Promise<UsageTopReason[]> {
  const schema = await getUsageSchemaCapabilities();
  const scope = await resolveUsageScope({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    preferWorkspace: true,
    workspaceColumnAvailable: schema.hasReminderRunsWorkspaceId,
  });
  const scopePredicate = buildReminderScopePredicate(scope, schema);

  if (
    !schema.hasReminderRunsTable ||
    !schema.hasReminderRunsRawJson ||
    !scopePredicate ||
    (schema.reminderRunsRawJsonType !== 'json' && schema.reminderRunsRawJsonType !== 'jsonb')
  ) {
    return [];
  }

  const rows = await sql<{ reason: string; count: string }[]>`
    with reasons as (
      select
        coalesce(nullif(trim(reason_key), ''), 'other') as reason,
        (summary->>'skippedBreakdown')::jsonb as skipped_breakdown
      from public.reminder_runs rr
      cross join lateral (
        select rr.raw_json::jsonb -> 'summary' as summary
      ) s
      cross join lateral jsonb_object_keys(coalesce((s.summary->'skippedBreakdown'), '{}'::jsonb)) reason_key
      where ${scopePredicate}
        and rr.ran_at >= ${input.monthStart.toISOString()}
        and rr.ran_at < ${input.monthEnd.toISOString()}
    ),
    expanded as (
      select
        reason,
        case
          when jsonb_typeof(skipped_breakdown -> reason) = 'number'
            then (skipped_breakdown ->> reason)::int
          else 0
        end as value
      from reasons
    )
    select reason, sum(value)::text as count
    from expanded
    group by reason
    having sum(value) > 0
    order by sum(value) desc, reason asc
    limit 5
  `;

  return rows.map((row) => ({
    reason: row.reason,
    count: Number(row.count),
  }));
}

export async function fetchUsageVerify(input: {
  workspaceId?: string | null;
  userEmail: string;
  metric: InvoiceUsageMetric;
}): Promise<UsageVerifyResult> {
  const month = await getTallinnMonthWindow();
  const [monthMetric, dailySeries, planUsage] = await Promise.all([
    fetchInvoiceMetricCountForWindow({
      workspaceId: input.workspaceId,
      userEmail: input.userEmail,
      metric: input.metric,
      window: month,
    }),
    fetchInvoiceDailySeriesForWindow({
      workspaceId: input.workspaceId,
      userEmail: input.userEmail,
      window: month,
      metric: input.metric,
    }),
    fetchInvoiceMetricCountForWindow({
      workspaceId: input.workspaceId,
      userEmail: input.userEmail,
      metric: 'created',
      window: month,
    }),
  ]);

  const sumDaily = dailySeries.points.reduce((acc, point) => acc + point.count, 0);
  const match = monthMetric.count === sumDaily;
  const planMonthUsed = planUsage.count;
  const planMatch = monthMetric.count === planMonthUsed;

  let reason: string | null = null;
  if (monthMetric.debug.error) {
    reason = monthMetric.debug.error;
  } else if (!match) {
    reason = `Mismatch: monthTotal=${monthMetric.count} while sumDaily=${sumDaily} for metric=${input.metric}.`;
  }

  const notes: string[] = [];
  if (monthMetric.debug.warning) {
    notes.push(monthMetric.debug.warning);
  }
  if (monthMetric.debug.error) {
    notes.push(monthMetric.debug.error);
  }
  if (input.metric !== 'created') {
    notes.push('Plan monthly usage is based on Created (app).');
  }

  const sourceTable =
    monthMetric.debug.columnUsed.startsWith('invoice_email_logs.')
      ? 'invoice_email_logs'
      : monthMetric.debug.columnUsed.startsWith('invoices.')
        ? 'invoices'
        : 'missing';
  const sourceColumn = monthMetric.debug.columnUsed.includes('.')
    ? monthMetric.debug.columnUsed.split('.')[1] ?? monthMetric.debug.columnUsed
    : monthMetric.debug.columnUsed;

  return {
    scope: monthMetric.debug.scope.scopeType === 'workspace' ? 'workspace' : 'user_email',
    timezone: month.timezone,
    monthWindow: {
      startUtc: month.startUtc.toISOString(),
      endUtc: month.endUtc.toISOString(),
    },
    dailyWindow: {
      startUtc: month.startUtc.toISOString(),
      endUtc: month.endUtc.toISOString(),
    },
    invoiceMetric: input.metric,
    source: {
      table: sourceTable,
      column: sourceColumn,
      fallbackUsed: monthMetric.debug.createdFallback !== null,
      notes,
    },
    monthTotal: monthMetric.count,
    sumDaily,
    match,
    planMonthUsed,
    planMatch,
    reason,
  };
}

export async function getUsageCapabilities() {
  const schema = await getUsageSchemaCapabilities();
  return {
    hasIssuedMetric: schema.hasInvoicesIssuedAt,
    hasPaidMetric: schema.hasInvoicesPaidAt,
  };
}
