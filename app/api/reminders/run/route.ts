import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { sendInvoiceReminderEmail } from '@/app/lib/email';
import { generatePayLink } from '@/app/lib/pay-link';
import { sendWithThrottle } from '@/app/lib/throttled-batch-sender';
import {
  fetchUnsubscribeSettings,
  isRecipientUnsubscribed,
  isUnsubscribeMigrationRequiredError,
  issueUnsubscribeToken,
} from '@/app/lib/unsubscribe';
import {
  assertReminderPauseSchemaReady,
  isReminderPauseMigrationRequiredError,
} from '@/app/lib/reminder-pauses';
import {
  assertReminderRunsSchemaReady,
  insertReminderRun,
  isReminderRunsMigrationRequiredError,
  type ReminderRunSkippedBreakdown,
  type ReminderRunTriggeredBy,
} from '@/app/lib/reminder-runs';
import {
  insertReminderRunLog,
  isReminderRunLogsMigrationRequiredError,
} from '@/app/lib/reminder-run-logs';
import { auth } from '@/auth';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
const DEFAULT_EMAIL_THROTTLE_MS = 6000;
const DEFAULT_EMAIL_BATCH_SIZE = 25;
const DEFAULT_EMAIL_MAX_RUN_MS = 480000;

type ReminderCandidate = {
  id: string;
  amount: number;
  due_date: string;
  reminder_level: number;
  user_email: string;
  customer_name: string;
  customer_email: string | null;
  invoice_number: string | null;
  workspace_id: string | null;
  invoice_paused: boolean;
  customer_paused: boolean;
  status: string;
};

type DecisionReason =
  | 'eligible'
  | 'paused_invoice'
  | 'paused_customer'
  | 'unsubscribed'
  | 'missing_email'
  | 'duplicate_in_run'
  | 'not_eligible';

type CandidateDecision = {
  invoiceId: string;
  workspaceId: string | null;
  willSend: boolean;
  reason: DecisionReason;
};

type RunErrorItem = {
  invoiceId: string;
  message: string;
};

type WorkspaceAccumulator = {
  sentCount: number;
  skippedCount: number;
  errorCount: number;
  skippedBreakdown: Required<ReminderRunSkippedBreakdown>;
  errors: RunErrorItem[];
};

const emptyBreakdown: Required<ReminderRunSkippedBreakdown> = {
  paused: 0,
  unsubscribed: 0,
  missing_email: 0,
  not_eligible: 0,
  other: 0,
};

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')
  );
}

// Local smoke tests:
// curl -i -H "Authorization: Bearer $REMINDER_CRON_TOKEN" http://localhost:3000/api/reminders/run?dryRun=1
// curl -i -H "x-reminder-cron-token: $REMINDER_CRON_TOKEN" http://localhost:3000/api/reminders/run?dryRun=1
function getCronAuthToken(req: Request) {
  const authorization = req.headers.get('authorization')?.trim() ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authorization.slice(7).trim();
    if (bearerToken) {
      return bearerToken;
    }
  }

  const headerToken = req.headers.get('x-reminder-cron-token')?.trim();
  if (headerToken) {
    return headerToken;
  }

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const url = new URL(req.url);
  return url.searchParams.get('token')?.trim() ?? null;
}

async function authorizeRunRequest(req: Request) {
  const expectedCronToken = process.env.REMINDER_CRON_TOKEN?.trim() || '';
  const providedCronToken = getCronAuthToken(req)?.trim() || '';
  if (expectedCronToken && providedCronToken === expectedCronToken) {
    return { ok: true as const, source: 'cron' as const };
  }

  const session = await auth();
  if (!session?.user?.email) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    if (context.userRole !== 'owner' && context.userRole !== 'admin') {
      return {
        ok: false as const,
        response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      };
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return {
        ok: false as const,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
    throw error;
  }

  return { ok: true as const, source: 'manual' as const };
}

function formatAmount(amount: number) {
  return (amount / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'EUR',
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 200) || 'Unknown error';
  }

  return 'Unknown error';
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getWorkspaceAccumulator(
  workspaceStats: Map<string, WorkspaceAccumulator>,
  workspaceId: string | null,
) {
  if (!workspaceId) {
    return null;
  }

  const existing = workspaceStats.get(workspaceId);
  if (existing) {
    return existing;
  }

  const created: WorkspaceAccumulator = {
    sentCount: 0,
    skippedCount: 0,
    errorCount: 0,
    skippedBreakdown: { ...emptyBreakdown },
    errors: [],
  };
  workspaceStats.set(workspaceId, created);
  return created;
}

function incrementSkip(
  accumulator: WorkspaceAccumulator | null,
  reason: DecisionReason,
) {
  if (!accumulator) {
    return;
  }

  accumulator.skippedCount += 1;

  if (reason === 'paused_customer' || reason === 'paused_invoice') {
    accumulator.skippedBreakdown.paused += 1;
    return;
  }

  if (reason === 'unsubscribed') {
    accumulator.skippedBreakdown.unsubscribed += 1;
    return;
  }

  if (reason === 'missing_email') {
    accumulator.skippedBreakdown.missing_email += 1;
    return;
  }

  if (reason === 'not_eligible') {
    accumulator.skippedBreakdown.not_eligible += 1;
    return;
  }

  accumulator.skippedBreakdown.other += 1;
}

function resolveTriggeredBy(value: string | null | undefined): ReminderRunTriggeredBy {
  if (value === 'dev' || value === 'cron') {
    return value;
  }

  return 'manual';
}

async function parseRunOptions(req: Request) {
  const url = new URL(req.url);

  const dryRunFromQuery = url.searchParams.get('dryRun');
  const dryRunFromHeader = req.headers.get('x-dry-run') ?? req.headers.get('x-reminders-dry-run');
  const triggeredByFromQuery =
    url.searchParams.get('triggeredBy') ?? url.searchParams.get('source');
  const triggeredByFromHeader = req.headers.get('x-reminders-triggered-by');

  let dryRun = dryRunFromQuery === '1' || dryRunFromQuery === 'true';
  if (!dryRun) {
    dryRun = dryRunFromHeader === '1' || dryRunFromHeader === 'true';
  }

  let triggeredBy = resolveTriggeredBy(triggeredByFromQuery ?? triggeredByFromHeader);

  if (req.method !== 'GET') {
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.toLowerCase().includes('application/json')) {
      try {
        const body = (await req.json()) as
          | {
              dryRun?: boolean;
              triggeredBy?: string;
              source?: string;
            }
          | null;

        if (!dryRun && typeof body?.dryRun === 'boolean') {
          dryRun = body.dryRun;
        }

        if (triggeredBy === 'manual') {
          triggeredBy = resolveTriggeredBy(body?.triggeredBy ?? body?.source);
        }
      } catch {
        // Ignore malformed optional body and fall back to query/header parsing.
      }
    }
  }

  return { dryRun, triggeredBy };
}

async function fetchReminderCandidates(
  includeReminderPauseJoin: boolean,
  selectionLimit: number,
) {
  if (includeReminderPauseJoin) {
    return sql<ReminderCandidate[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.due_date,
        invoices.reminder_level,
        invoices.user_email,
        invoices.invoice_number,
        invoices.status,
        customers.name AS customer_name,
        customers.email AS customer_email,
        workspaces.id AS workspace_id,
        (invoice_pauses.invoice_id IS NOT NULL) AS invoice_paused,
        (customer_pauses.normalized_email IS NOT NULL) AS customer_paused
      FROM invoices
      JOIN customers
        ON customers.id = invoices.customer_id
      JOIN users
        ON lower(users.email) = lower(invoices.user_email)
      LEFT JOIN LATERAL (
        SELECT id
        FROM workspaces
        WHERE owner_user_id = users.id
        ORDER BY created_at ASC
        LIMIT 1
      ) workspaces ON true
      LEFT JOIN public.invoice_reminder_pauses invoice_pauses
        ON invoice_pauses.invoice_id = invoices.id
      LEFT JOIN public.workspace_reminder_customer_pauses customer_pauses
        ON customer_pauses.workspace_id = workspaces.id
       AND customer_pauses.normalized_email = lower(trim(customers.email))
      WHERE
        users.plan in ('solo', 'pro', 'studio')
        AND users.is_verified = true
        AND users.subscription_status in ('active', 'trialing')
        AND invoices.status = 'pending'
        AND invoices.due_date IS NOT NULL
        AND invoices.due_date < current_date
        AND invoices.reminder_level < 3
        AND (
          (invoices.reminder_level = 0 AND current_date > invoices.due_date)
          OR (
            invoices.reminder_level = 1
            AND invoices.last_reminder_sent_at <= now() - interval '7 days'
          )
          OR (
            invoices.reminder_level = 2
            AND invoices.last_reminder_sent_at <= now() - interval '14 days'
          )
        )
      ORDER BY invoices.due_date ASC, invoices.id ASC
      LIMIT ${selectionLimit}
    `;
  }

  return sql<ReminderCandidate[]>`
    SELECT
      invoices.id,
      invoices.amount,
      invoices.due_date,
      invoices.reminder_level,
      invoices.user_email,
      invoices.invoice_number,
      invoices.status,
      customers.name AS customer_name,
      customers.email AS customer_email,
      workspaces.id AS workspace_id,
      false AS invoice_paused,
      false AS customer_paused
    FROM invoices
    JOIN customers
      ON customers.id = invoices.customer_id
    JOIN users
      ON lower(users.email) = lower(invoices.user_email)
    LEFT JOIN LATERAL (
      SELECT id
      FROM workspaces
      WHERE owner_user_id = users.id
      ORDER BY created_at ASC
      LIMIT 1
    ) workspaces ON true
    WHERE
      users.plan in ('solo', 'pro', 'studio')
      AND users.is_verified = true
      AND users.subscription_status in ('active', 'trialing')
      AND invoices.status = 'pending'
      AND invoices.due_date IS NOT NULL
      AND invoices.due_date < current_date
      AND invoices.reminder_level < 3
      AND (
        (invoices.reminder_level = 0 AND current_date > invoices.due_date)
        OR (
          invoices.reminder_level = 1
          AND invoices.last_reminder_sent_at <= now() - interval '7 days'
        )
        OR (
          invoices.reminder_level = 2
          AND invoices.last_reminder_sent_at <= now() - interval '14 days'
        )
      )
    ORDER BY invoices.due_date ASC, invoices.id ASC
    LIMIT ${selectionLimit}
  `;
}

// ÜHINE job, mida POST ja GET mõlemad kasutavad
async function runReminderJob(req: Request) {
  const authorization = await authorizeRunRequest(req);
  if (!authorization.ok) {
    return authorization.response;
  }

  const startedAt = Date.now();
  const ranAtIso = new Date(startedAt).toISOString();
  const { dryRun, triggeredBy } = await parseRunOptions(req);
  const baseUrl = getBaseUrl();
  const batchSize = parsePositiveInt(process.env.EMAIL_BATCH_SIZE, DEFAULT_EMAIL_BATCH_SIZE);
  const delayMs = parsePositiveInt(process.env.EMAIL_THROTTLE_MS, DEFAULT_EMAIL_THROTTLE_MS);
  const maxRunMs = parsePositiveInt(process.env.EMAIL_MAX_RUN_MS, DEFAULT_EMAIL_MAX_RUN_MS);
  const selectionLimit = Math.max(batchSize * 10, batchSize + 1);

  let includeReminderPauseJoin = false;
  try {
    await assertReminderPauseSchemaReady();
    includeReminderPauseJoin = true;
  } catch (error) {
    if (!isReminderPauseMigrationRequiredError(error)) {
      throw error;
    }
  }

  const reminders = await fetchReminderCandidates(includeReminderPauseJoin, selectionLimit);
  const hasMoreFromSelection = reminders.length >= selectionLimit;
  const updatedInvoiceIds: string[] = [];
  const workspaceStats = new Map<string, WorkspaceAccumulator>();
  const decisions: CandidateDecision[] = [];
  const errors: RunErrorItem[] = [];
  const eligibleReminders: ReminderCandidate[] = [];
  const seenInvoiceIds = new Set<string>();

  if (reminders.length === 0) {
    console.log('No reminders to send (either none overdue or owners not verified).');
  }

  for (const reminder of reminders) {
    if (seenInvoiceIds.has(reminder.id)) {
      const workspaceAccumulator = getWorkspaceAccumulator(workspaceStats, reminder.workspace_id);
      decisions.push({
        invoiceId: reminder.id,
        workspaceId: reminder.workspace_id,
        willSend: false,
        reason: 'duplicate_in_run',
      });
      incrementSkip(workspaceAccumulator, 'duplicate_in_run');
      continue;
    }
    seenInvoiceIds.add(reminder.id);

    const workspaceAccumulator = getWorkspaceAccumulator(workspaceStats, reminder.workspace_id);
    const customerEmail = reminder.customer_email?.trim() ?? '';

    if (reminder.status !== 'pending') {
      decisions.push({
        invoiceId: reminder.id,
        workspaceId: reminder.workspace_id,
        willSend: false,
        reason: 'not_eligible',
      });
      incrementSkip(workspaceAccumulator, 'not_eligible');
      continue;
    }

    if (reminder.invoice_paused) {
      decisions.push({
        invoiceId: reminder.id,
        workspaceId: reminder.workspace_id,
        willSend: false,
        reason: 'paused_invoice',
      });
      incrementSkip(workspaceAccumulator, 'paused_invoice');
      continue;
    }

    if (reminder.customer_paused) {
      decisions.push({
        invoiceId: reminder.id,
        workspaceId: reminder.workspace_id,
        willSend: false,
        reason: 'paused_customer',
      });
      incrementSkip(workspaceAccumulator, 'paused_customer');
      continue;
    }

    if (!customerEmail) {
      decisions.push({
        invoiceId: reminder.id,
        workspaceId: reminder.workspace_id,
        willSend: false,
        reason: 'missing_email',
      });
      incrementSkip(workspaceAccumulator, 'missing_email');
      continue;
    }

    if (reminder.workspace_id) {
      try {
        const unsubscribeSettings = await fetchUnsubscribeSettings(reminder.workspace_id);
        if (unsubscribeSettings.enabled) {
          const alreadyUnsubscribed = await isRecipientUnsubscribed(
            reminder.workspace_id,
            customerEmail,
          );

          if (alreadyUnsubscribed) {
            decisions.push({
              invoiceId: reminder.id,
              workspaceId: reminder.workspace_id,
              willSend: false,
              reason: 'unsubscribed',
            });
            incrementSkip(workspaceAccumulator, 'unsubscribed');
            continue;
          }
        }
      } catch (unsubscribeError) {
        if (!isUnsubscribeMigrationRequiredError(unsubscribeError)) {
          console.error('Unsubscribe check failed:', reminder.id, unsubscribeError);
        }
      }
    }

    decisions.push({
      invoiceId: reminder.id,
      workspaceId: reminder.workspace_id,
      willSend: true,
      reason: 'eligible',
    });
    eligibleReminders.push(reminder);
  }

  const run = await sendWithThrottle(eligibleReminders, {
    delayMs: dryRun ? 0 : delayMs,
    maxItems: batchSize,
    maxRunMs,
    onItem: async (reminder) => {
      const workspaceAccumulator = getWorkspaceAccumulator(workspaceStats, reminder.workspace_id);
      const customerEmail = reminder.customer_email?.trim() ?? '';

      if (dryRun) {
        if (workspaceAccumulator) {
          workspaceAccumulator.sentCount += 1;
        }
        return;
      }

      let includeUnsubscribeLink = false;
      let unsubscribeUrl: string | null = null;
      if (reminder.workspace_id) {
        try {
          const unsubscribeSettings = await fetchUnsubscribeSettings(reminder.workspace_id);
          if (unsubscribeSettings.enabled) {
            const unsubscribePath = await issueUnsubscribeToken(reminder.workspace_id, customerEmail);
            unsubscribeUrl = `${baseUrl}${unsubscribePath}`;
            includeUnsubscribeLink = true;
          }
        } catch (unsubscribeError) {
          if (!isUnsubscribeMigrationRequiredError(unsubscribeError)) {
            console.error('Unsubscribe token generation failed:', reminder.id, unsubscribeError);
          }
        }
      }

      try {
        const payLink = generatePayLink(baseUrl, reminder.id);
        const amountLabel = formatAmount(reminder.amount);
        const dueDateLabel = formatDate(reminder.due_date);
        const reminderNumber = reminder.reminder_level + 1;
        const subject = `Invoice reminder #${reminderNumber}: ${amountLabel} due`;

        const bodyText = [
          `Hi ${reminder.customer_name},`,
          '',
          `This is a reminder that your invoice is overdue.`,
          `Amount: ${amountLabel}`,
          `Due date: ${dueDateLabel}`,
          `Pay here: ${payLink}`,
          ...(includeUnsubscribeLink && unsubscribeUrl
            ? ['', `Unsubscribe from reminder emails: ${unsubscribeUrl}`]
            : []),
          '',
          'Thank you,',
          'Lateless',
        ].join('\n');

        const bodyHtml = `
          <p>Hi ${reminder.customer_name},</p>
          <p>This is a reminder that your invoice is overdue.</p>
          <ul>
            <li><strong>Amount:</strong> ${amountLabel}</li>
            <li><strong>Due date:</strong> ${dueDateLabel}</li>
          </ul>
          <p><a href="${payLink}">Pay this invoice now</a></p>
          ${
            includeUnsubscribeLink && unsubscribeUrl
              ? `<p style="margin-top:12px;"><a href="${unsubscribeUrl}">Unsubscribe from reminder emails</a></p>`
              : ''
          }
          <p>Thank you,<br />Lateless</p>
        `;

        await sendInvoiceReminderEmail({
          to: customerEmail,
          subject,
          bodyHtml,
          bodyText,
        });

        await sql`
          update invoices
          set reminder_level = reminder_level + 1,
              last_reminder_sent_at = now()
          where id = ${reminder.id}
            and reminder_level = ${reminder.reminder_level}
        `;

        updatedInvoiceIds.push(reminder.id);
        if (workspaceAccumulator) {
          workspaceAccumulator.sentCount += 1;
        }
      } catch (error) {
        console.error('Reminder send failed:', reminder.id, error);
        const errorItem = {
          invoiceId: reminder.id,
          message: safeErrorMessage(error),
        } satisfies RunErrorItem;
        errors.push(errorItem);

        if (workspaceAccumulator) {
          workspaceAccumulator.errorCount += 1;
          workspaceAccumulator.errors.push(errorItem);
        }
        throw error;
      }
    },
  });

  const durationMs = Date.now() - startedAt;

  let workspaceRunLogWritten = false;
  let workspaceRunLogWarning: string | null = null;
  if (workspaceStats.size > 0) {
    try {
      await assertReminderRunsSchemaReady();
      await Promise.all(
        Array.from(workspaceStats.entries()).map(([workspaceId, stats]) =>
          insertReminderRun(workspaceId, {
            triggeredBy,
            dryRun,
            sentCount: stats.sentCount,
            skippedCount: stats.skippedCount,
            errorCount: stats.errorCount,
            skippedBreakdown: stats.skippedBreakdown,
            durationMs,
            errors: stats.errors.slice(-10),
            ranAt: ranAtIso,
          }),
        ),
      );
      workspaceRunLogWritten = true;
    } catch (error) {
      if (isReminderRunsMigrationRequiredError(error)) {
        workspaceRunLogWarning = 'REMINDER_RUNS_LOGGING_SKIPPED_MIGRATION_REQUIRED';
      } else {
        console.error('Reminder run logging failed:', error);
        workspaceRunLogWarning = 'REMINDER_RUNS_LOGGING_SKIPPED';
      }
    }
  }

  const sentCount = dryRun ? run.attempted : updatedInvoiceIds.length;
  const skippedCount = decisions.filter((decision) => !decision.willSend).length;
  const skippedBreakdown = decisions.reduce<Required<ReminderRunSkippedBreakdown>>((acc, decision) => {
    if (decision.willSend) {
      return acc;
    }

    if (decision.reason === 'paused_customer' || decision.reason === 'paused_invoice') {
      acc.paused += 1;
      return acc;
    }

    if (decision.reason === 'unsubscribed') {
      acc.unsubscribed += 1;
      return acc;
    }

    if (decision.reason === 'missing_email') {
      acc.missing_email += 1;
      return acc;
    }

    if (decision.reason === 'not_eligible') {
      acc.not_eligible += 1;
      return acc;
    }

    acc.other += 1;
    return acc;
  }, { ...emptyBreakdown });

  console.log(
    `[reminders] ranAt=${ranAtIso} dryRun=${dryRun} attempted=${run.attempted} sent=${sentCount} skipped=${skippedCount} errors=${errors.length} hasMore=${run.hasMore || hasMoreFromSelection}`,
  );

  const hasMore = run.hasMore || hasMoreFromSelection;

  const responsePayload = {
    ranAt: ranAtIso,
    attempted: run.attempted,
    sent: sentCount,
    failed: run.failed,
    skipped: skippedCount,
    hasMore,
    updatedCount: sentCount,
    updatedInvoiceIds,
    dryRun,
    triggeredBy,
    durationMs,
    summary: {
      attempted: run.attempted,
      sent: sentCount,
      failed: run.failed,
      skipped: skippedCount,
      hasMore,
      sentCount,
      skippedCount,
      errorCount: errors.length,
      skippedBreakdown,
      wouldSendCount: decisions.filter((decision) => decision.willSend).length,
    },
    candidates: decisions,
    errors: errors.slice(-10),
  };

  let runLogWritten = false;
  const runWarnings: string[] = [];

  try {
    await insertReminderRunLog({
      triggeredBy: triggeredBy === 'cron' ? 'cron' : 'manual',
      attempted: run.attempted,
      sent: sentCount,
      failed: run.failed,
      skipped: skippedCount,
      hasMore,
      durationMs,
      rawJson: responsePayload,
      ranAt: ranAtIso,
    });
    runLogWritten = true;
  } catch (error) {
    if (isReminderRunLogsMigrationRequiredError(error)) {
      runWarnings.push('REMINDER_RUN_LOGS_MIGRATION_REQUIRED');
    } else {
      console.error('Reminder run log write failed:', error);
      runWarnings.push('REMINDER_RUN_LOGS_WRITE_FAILED');
    }
  }

  if (!workspaceRunLogWritten && workspaceRunLogWarning) {
    runWarnings.push(workspaceRunLogWarning);
  }

  return NextResponse.json({
    ...responsePayload,
    runLogWritten,
    runLogWarning: runWarnings.length > 0 ? runWarnings.join('; ') : null,
  });
}

// SIIT ALATES AINULT 2 HANDLERIT
export async function POST(req: Request) {
  return runReminderJob(req);
}

export async function GET(req: Request) {
  return POST(req);
}
