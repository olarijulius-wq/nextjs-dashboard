import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

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

export type UsageTimeseriesPoint = {
  date: string;
  invoiceCreated: number;
  reminderSent: number;
  reminderSkipped: number;
  reminderError: number;
};

export type InvoiceUsageMetric = 'created' | 'sent' | 'paid';

type UsageTimeseriesDebug = {
  scopeKey: 'workspace_id' | 'user_email';
  normalizedDateColumn: string;
  timezone: 'Europe/Tallinn';
  invoiceMetric: InvoiceUsageMetric;
};

export type UsageTimeseriesResult = {
  points: UsageTimeseriesPoint[];
  debug: UsageTimeseriesDebug;
};

export type UsageTopReason = {
  reason: string;
  count: number;
};

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

export async function fetchUsageSummary(
  workspaceId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<UsageSummary> {
  await assertUsageSchemaReady();

  const rows = await sql<{ event_type: UsageEventType; count: string }[]>`
    select event_type, count(*)::text as count
    from public.workspace_usage_events
    where workspace_id = ${workspaceId}
      and occurred_at >= ${monthStart.toISOString()}
      and occurred_at < ${monthEnd.toISOString()}
    group by event_type
  `;

  const summary = emptySummary();

  for (const row of rows) {
    summary[row.event_type] = Number(row.count);
  }

  return summary;
}

function startOfUtcDay(value: Date) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function addUtcDays(value: Date, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function normalizeMetric(metric: string | null | undefined): InvoiceUsageMetric {
  if (metric === 'sent' || metric === 'paid') {
    return metric;
  }
  return 'created';
}

type InvoiceUsageSchemaCapabilities = {
  hasInvoicesWorkspaceId: boolean;
  hasInvoicesCreatedAt: boolean;
  hasInvoicesIssuedAt: boolean;
  hasInvoiceEmailLogsTable: boolean;
  hasInvoiceEmailLogsSentAt: boolean;
  hasInvoiceEmailLogsStatus: boolean;
};

let invoiceUsageSchemaCapabilitiesPromise: Promise<InvoiceUsageSchemaCapabilities> | null =
  null;

async function getInvoiceUsageSchemaCapabilities(): Promise<InvoiceUsageSchemaCapabilities> {
  if (!invoiceUsageSchemaCapabilitiesPromise) {
    invoiceUsageSchemaCapabilitiesPromise = (async () => {
      const columns = await sql<{ table_name: string; column_name: string }[]>`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('invoices', 'invoice_email_logs')
          and column_name in ('workspace_id', 'created_at', 'issued_at', 'sent_at', 'status')
      `;

      const columnSet = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
      const [emailLogTable] = await sql<{ regclass: string | null }[]>`
        select to_regclass('public.invoice_email_logs')::text as regclass
      `;

      return {
        hasInvoicesWorkspaceId: columnSet.has('invoices.workspace_id'),
        hasInvoicesCreatedAt: columnSet.has('invoices.created_at'),
        hasInvoicesIssuedAt: columnSet.has('invoices.issued_at'),
        hasInvoiceEmailLogsTable: Boolean(emailLogTable?.regclass),
        hasInvoiceEmailLogsSentAt: columnSet.has('invoice_email_logs.sent_at'),
        hasInvoiceEmailLogsStatus: columnSet.has('invoice_email_logs.status'),
      };
    })();
  }

  return invoiceUsageSchemaCapabilitiesPromise;
}

function buildTallinnDateKeys(days: number): string[] {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Tallinn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const keys: string[] = [];
  const now = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - offset);
    keys.push(formatter.format(date));
  }
  return keys;
}

async function fetchInvoiceDailyCounts(input: {
  workspaceId: string;
  userEmail: string;
  days: number;
  metric: InvoiceUsageMetric;
}): Promise<{ rows: { date: string; count: string }[]; debug: UsageTimeseriesDebug }> {
  const schema = await getInvoiceUsageSchemaCapabilities();
  const scopeKey: 'workspace_id' | 'user_email' = schema.hasInvoicesWorkspaceId
    ? 'workspace_id'
    : 'user_email';
  const normalizedUserEmail = input.userEmail.trim().toLowerCase();

  if (input.metric === 'sent') {
    if (!schema.hasInvoiceEmailLogsTable || !schema.hasInvoiceEmailLogsSentAt) {
      const emptyRows = buildTallinnDateKeys(input.days).map((date) => ({ date, count: '0' }));
      return {
        rows: emptyRows,
        debug: {
          scopeKey,
          normalizedDateColumn: 'invoice_email_logs.sent_at',
          timezone: 'Europe/Tallinn',
          invoiceMetric: input.metric,
        },
      };
    }

    const scopePredicate = schema.hasInvoicesWorkspaceId
      ? sql`i.workspace_id = ${input.workspaceId}`
      : sql`lower(i.user_email) = ${normalizedUserEmail}`;
    const sentStatusPredicate = schema.hasInvoiceEmailLogsStatus
      ? sql`and l.status = 'sent'`
      : sql``;

    const rows = await sql<{ date: string; count: string }[]>`
      with bounds as (
        select
          date_trunc('day', now() at time zone 'Europe/Tallinn') - (${input.days - 1} * interval '1 day') as start_day,
          date_trunc('day', now() at time zone 'Europe/Tallinn') as end_day
      ),
      days as (
        select generate_series(
          (select start_day from bounds),
          (select end_day from bounds),
          interval '1 day'
        ) as day
      ),
      grouped as (
        select
          date_trunc('day', l.sent_at at time zone 'Europe/Tallinn') as day,
          count(*)::text as count
        from public.invoice_email_logs l
        join public.invoices i on i.id = l.invoice_id
        where ${scopePredicate}
          and l.sent_at is not null
          ${sentStatusPredicate}
          and l.sent_at >= ((select start_day from bounds) at time zone 'Europe/Tallinn')
          and l.sent_at < (((select end_day from bounds) + interval '1 day') at time zone 'Europe/Tallinn')
        group by date_trunc('day', l.sent_at at time zone 'Europe/Tallinn')
      )
      select
        to_char(days.day, 'YYYY-MM-DD') as date,
        coalesce(grouped.count, '0') as count
      from days
      left join grouped on grouped.day = days.day
      order by days.day asc
    `;

    return {
      rows,
      debug: {
        scopeKey,
        normalizedDateColumn: 'invoice_email_logs.sent_at',
        timezone: 'Europe/Tallinn',
        invoiceMetric: input.metric,
      },
    };
  }

  const dateColumn = input.metric === 'paid'
    ? 'i.paid_at'
    : schema.hasInvoicesCreatedAt
      ? 'i.created_at'
      : schema.hasInvoicesIssuedAt
        ? 'i.issued_at'
        : 'i.issued_at';
  const scopePredicate = schema.hasInvoicesWorkspaceId
    ? sql`i.workspace_id = ${input.workspaceId}`
    : sql`lower(i.user_email) = ${normalizedUserEmail}`;

  const rows = await sql<{ date: string; count: string }[]>`
    with bounds as (
      select
        date_trunc('day', now() at time zone 'Europe/Tallinn') - (${input.days - 1} * interval '1 day') as start_day,
        date_trunc('day', now() at time zone 'Europe/Tallinn') as end_day
    ),
    days as (
      select generate_series(
        (select start_day from bounds),
        (select end_day from bounds),
        interval '1 day'
      ) as day
    ),
    grouped as (
      select
        date_trunc('day', (${sql.unsafe(dateColumn)} at time zone 'Europe/Tallinn')) as day,
        count(*)::text as count
      from public.invoices i
      where ${scopePredicate}
        and ${sql.unsafe(dateColumn)} is not null
        and ${sql.unsafe(dateColumn)} >= ((select start_day from bounds) at time zone 'Europe/Tallinn')
        and ${sql.unsafe(dateColumn)} < (((select end_day from bounds) + interval '1 day') at time zone 'Europe/Tallinn')
      group by date_trunc('day', (${sql.unsafe(dateColumn)} at time zone 'Europe/Tallinn'))
    )
    select
      to_char(days.day, 'YYYY-MM-DD') as date,
      coalesce(grouped.count, '0') as count
    from days
    left join grouped on grouped.day = days.day
    order by days.day asc
  `;

  return {
    rows,
    debug: {
      scopeKey,
      normalizedDateColumn:
        input.metric === 'paid'
          ? 'invoices.paid_at'
          : schema.hasInvoicesCreatedAt
            ? 'invoices.created_at'
            : 'invoices.issued_at',
      timezone: 'Europe/Tallinn',
      invoiceMetric: input.metric,
    },
  };
}

export async function fetchUsageTimeseries(
  input: {
    workspaceId: string;
    userEmail: string;
    days?: number;
    invoiceMetric?: string | null;
  },
): Promise<UsageTimeseriesResult> {
  await assertUsageSchemaReady();

  const safeDays = Number.isFinite(input.days)
    ? Math.max(1, Math.min(90, input.days ?? 30))
    : 30;
  const metric = normalizeMetric(input.invoiceMetric);
  const invoiceSeries = await fetchInvoiceDailyCounts({
    workspaceId: input.workspaceId,
    userEmail: input.userEmail,
    days: safeDays,
    metric,
  });
  const todayUtc = startOfUtcDay(new Date());
  const startDate = addUtcDays(todayUtc, -(safeDays - 1));
  const endDateExclusive = addUtcDays(todayUtc, 1);

  const rows = await sql<{
    date: string;
    event_type: 'invoice_created' | 'reminder_sent' | 'reminder_skipped' | 'reminder_error';
    count: string;
  }[]>`
    select
      (occurred_at at time zone 'Europe/Tallinn')::date::text as date,
      event_type,
      count(*)::text as count
    from public.workspace_usage_events
    where workspace_id = ${input.workspaceId}
      and occurred_at >= ${startDate.toISOString()}
      and occurred_at < ${endDateExclusive.toISOString()}
      and event_type in (
        'invoice_created',
        'reminder_sent',
        'reminder_skipped',
        'reminder_error'
      )
    group by (occurred_at at time zone 'Europe/Tallinn')::date, event_type
  `;

  const byDate = new Map<string, UsageTimeseriesPoint>();
  for (const row of invoiceSeries.rows) {
    const date = row.date;
    byDate.set(date, {
      date,
      invoiceCreated: Number(row.count),
      reminderSent: 0,
      reminderSkipped: 0,
      reminderError: 0,
    });
  }

  for (const row of rows) {
    const point = byDate.get(row.date);
    if (!point) {
      continue;
    }

    const count = Number(row.count);
    if (row.event_type === 'reminder_sent') {
      point.reminderSent = count;
      continue;
    }

    if (row.event_type === 'reminder_skipped') {
      point.reminderSkipped = count;
      continue;
    }

    point.reminderError = count;
  }

  return {
    points: Array.from(byDate.values()),
    debug: invoiceSeries.debug,
  };
}

export function normalizeUsageInvoiceMetric(metric: string | null | undefined): InvoiceUsageMetric {
  return normalizeMetric(metric);
}

export async function fetchUsageTopReasons(
  workspaceId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<UsageTopReason[]> {
  await assertUsageSchemaReady();

  const rows = await sql<{ reason: string; count: string }[]>`
    select
      coalesce(nullif(trim(metadata->>'reason'), ''), 'other') as reason,
      count(*)::text as count
    from public.workspace_usage_events
    where workspace_id = ${workspaceId}
      and event_type = 'reminder_skipped'
      and occurred_at >= ${monthStart.toISOString()}
      and occurred_at < ${monthEnd.toISOString()}
    group by coalesce(nullif(trim(metadata->>'reason'), ''), 'other')
    order by count(*) desc, reason asc
    limit 5
  `;

  return rows.map((row) => ({
    reason: row.reason,
    count: Number(row.count),
  }));
}
