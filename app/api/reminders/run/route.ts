import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  hasReminderSenderConfigured,
} from '@/app/lib/email';
import { sendWorkspaceEmail } from '@/app/lib/smtp-settings';
import { generatePayLink } from '@/app/lib/pay-link';
import { sendWithThrottle } from '@/app/lib/throttled-batch-sender';
import { getEmailBaseUrl } from '@/app/lib/app-url';
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
  insertReminderRunItems,
  insertReminderRun,
  isReminderRunsMigrationRequiredError,
  type ReminderRunItem,
  type ReminderRunSkippedBreakdown,
  type ReminderRunTriggeredBy,
} from '@/app/lib/reminder-runs';
import {
  insertReminderRunLog,
  isReminderRunLogsMigrationRequiredError,
} from '@/app/lib/reminder-run-logs';
import { logFunnelEvent } from '@/app/lib/funnel-events';
import { auth } from '@/auth';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import {
  acquireJobLock,
  isJobLocksMigrationRequiredError,
  releaseJobLock,
} from '@/app/lib/job-locks';
import { sql } from '@/app/lib/db';
import {
  enforceRateLimit,
  parseOptionalJsonBody,
  parseQuery,
} from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';
const DEFAULT_EMAIL_THROTTLE_MS = 6000;
const DEFAULT_EMAIL_BATCH_SIZE = 25;
const DEFAULT_EMAIL_MAX_RUN_MS = 480000;
const TEST_HOOKS_ENABLED =
  process.env.NODE_ENV === 'test' && process.env.LATELLESS_TEST_MODE === '1';
export const __testHooksEnabled = TEST_HOOKS_ENABLED;
export const __testHooks = {
  sendWorkspaceEmailOverride: null as
    | null
    | ((input: {
      workspaceId: string;
      toEmail: string;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      useCase?: 'default' | 'reminder' | 'invoice';
    }) => Promise<{ provider: 'resend' | 'smtp'; messageId: string | null }>),
};
const remindersRunQuerySchema = z
  .object({
    dryRun: z.enum(['0', '1', 'true', 'false']).optional(),
    triggeredBy: z.enum(['manual', 'cron', 'dev']).optional(),
    source: z.enum(['manual', 'cron', 'dev']).optional(),
    token: z.string().trim().min(1).max(512).optional(),
  })
  .strict();
const remindersRunBodySchema = z
  .object({
    dryRun: z.boolean().optional(),
    triggeredBy: z.enum(['manual', 'cron', 'dev']).optional(),
    source: z.enum(['manual', 'cron', 'dev']).optional(),
  })
  .strict();

type ReminderCandidate = {
  id: string;
  amount: number;
  due_date: string;
  reminder_level: number;
  last_reminder_sent_at: string | null;
  user_email: string;
  customer_name: string;
  customer_email: string | null;
  invoice_number: string | null;
  workspace_id: string | null;
  owner_verified: boolean;
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
  | 'owner_unverified'
  | 'sender_not_configured'
  | 'not_eligible';

type CandidateDecision = {
  invoiceId: string;
  workspaceId: string | null;
  willSend: boolean;
  reason: DecisionReason;
};

type RunErrorItem = {
  invoiceId: string;
  recipientEmail: string;
  provider: 'resend' | 'smtp' | 'unknown';
  providerMessageId: string | null;
  errorCode: string | null;
  errorType: string | null;
  message: string;
};

type RunLogScope = {
  workspaceId: string | null;
  userEmail: string | null;
};

type WorkspaceAccumulator = {
  attemptedCount: number;
  sentCount: number;
  skippedCount: number;
  errorCount: number;
  skippedBreakdown: Required<ReminderRunSkippedBreakdown>;
  errors: RunErrorItem[];
  items: ReminderRunItem[];
};

const emptyBreakdown: Required<ReminderRunSkippedBreakdown> = {
  paused: 0,
  unsubscribed: 0,
  missing_email: 0,
  not_eligible: 0,
  other: 0,
};

// Local smoke tests:
// curl -i -H "Authorization: Bearer $REMINDER_CRON_TOKEN" http://localhost:3000/api/reminders/run?dryRun=1
// curl -i -H "x-reminder-cron-token: $REMINDER_CRON_TOKEN" http://localhost:3000/api/reminders/run?dryRun=1
function getCronAuthToken(
  req: Request,
  query: z.infer<typeof remindersRunQuerySchema>,
) {
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

  return query.token?.trim() ?? null;
}

async function authorizeRunRequest(
  req: Request,
  query: z.infer<typeof remindersRunQuerySchema>,
) {
  const expectedCronToken = process.env.REMINDER_CRON_TOKEN?.trim() || '';
  const providedCronToken = getCronAuthToken(req, query)?.trim() || '';
  if (expectedCronToken && providedCronToken === expectedCronToken) {
    return {
      ok: true as const,
      source: 'cron' as const,
      userEmail: null,
      workspaceId: null,
      actorEmail: null,
    };
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
    return {
      ok: true as const,
      source: 'manual' as const,
      userEmail: context.userEmail.trim().toLowerCase(),
      workspaceId: context.workspaceId,
      actorEmail: context.userEmail.trim().toLowerCase(),
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return {
        ok: false as const,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      };
    }
    throw error;
  }
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

function normalizeRunErrorMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return 'Delivery failed.';
  }

  if (trimmed.startsWith('Resend failed:')) {
    return trimmed.slice('Resend failed:'.length).trim() || 'Resend rejected the request.';
  }

  return trimmed.slice(0, 300);
}

function classifyDeliveryError(input: {
  reminder: ReminderCandidate;
  error: unknown;
  provider: 'resend' | 'smtp' | 'unknown';
  providerMessageId: string | null;
}): RunErrorItem {
  const rawMessage = safeErrorMessage(input.error);
  const normalizedMessage = normalizeRunErrorMessage(rawMessage);
  let errorCode: string | null = null;
  let errorType: string | null = null;
  const resendPattern = /^([a-z0-9_.-]+):\s*(.+)$/i;
  const resendMatch = normalizedMessage.match(resendPattern);
  if (resendMatch) {
    errorType = resendMatch[1].slice(0, 80).toLowerCase();
    errorCode = resendMatch[1].slice(0, 80).toUpperCase();
  }

  return {
    invoiceId: input.reminder.id,
    recipientEmail: input.reminder.customer_email?.trim().toLowerCase() ?? '',
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    errorCode,
    errorType,
    message: normalizedMessage.slice(0, 300),
  };
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
    attemptedCount: 0,
    sentCount: 0,
    skippedCount: 0,
    errorCount: 0,
    skippedBreakdown: { ...emptyBreakdown },
    errors: [],
    items: [],
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

async function parseRunOptions(
  req: Request,
  query: z.infer<typeof remindersRunQuerySchema>,
) {
  const dryRunFromQuery = query.dryRun;
  const dryRunFromHeader = req.headers.get('x-dry-run') ?? req.headers.get('x-reminders-dry-run');
  const triggeredByFromQuery = query.triggeredBy ?? query.source;
  const triggeredByFromHeader = req.headers.get('x-reminders-triggered-by');
  const runLogWorkspaceIdFromHeader = req.headers.get('x-reminders-workspace-id');
  const runLogUserEmailFromHeader = req.headers.get('x-reminders-user-email');
  const runLogActorEmailFromHeader = req.headers.get('x-reminders-actor-email');

  let dryRun = dryRunFromQuery === '1' || dryRunFromQuery === 'true';
  if (!dryRun) {
    dryRun = dryRunFromHeader === '1' || dryRunFromHeader === 'true';
  }

  let triggeredBy = resolveTriggeredBy(triggeredByFromQuery ?? triggeredByFromHeader);

  if (req.method !== 'GET') {
    const body = await parseOptionalJsonBody(req, remindersRunBodySchema);
    if (body) {
      if (!dryRun && typeof body.dryRun === 'boolean') {
        dryRun = body.dryRun;
      }

      if (triggeredBy === 'manual') {
        triggeredBy = resolveTriggeredBy(body.triggeredBy ?? body.source);
      }
    }
  }

  return {
    ok: true as const,
    dryRun,
    triggeredBy,
    runLogWorkspaceId: runLogWorkspaceIdFromHeader?.trim() || null,
    runLogUserEmail: runLogUserEmailFromHeader?.trim().toLowerCase() || null,
    runLogActorEmail: runLogActorEmailFromHeader?.trim().toLowerCase() || null,
  };
}

async function fetchReminderCandidates(
  includeReminderPauseJoin: boolean,
  selectionLimit: number,
  scopeWorkspaceId: string | null,
) {
  if (includeReminderPauseJoin) {
    return sql<ReminderCandidate[]>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.due_date,
        invoices.reminder_level,
        invoices.last_reminder_sent_at,
        invoices.user_email,
        invoices.invoice_number,
        invoices.status,
        customers.name AS customer_name,
        customers.email AS customer_email,
        workspace_scope.workspace_id AS workspace_id,
        users.is_verified AS owner_verified,
        (invoice_pauses.invoice_id IS NOT NULL) AS invoice_paused,
        (customer_pauses.normalized_email IS NOT NULL) AS customer_paused
      FROM invoices
      JOIN customers
        ON customers.id = invoices.customer_id
      JOIN users
        ON lower(users.email) = lower(invoices.user_email)
      JOIN LATERAL (
        SELECT wm.workspace_id
        FROM public.workspace_members wm
        WHERE wm.user_id = users.id
          AND (${scopeWorkspaceId}::uuid is null OR wm.workspace_id = ${scopeWorkspaceId}::uuid)
        ORDER BY
          CASE WHEN wm.workspace_id = users.active_workspace_id THEN 0 ELSE 1 END ASC,
          wm.created_at ASC
        LIMIT 1
      ) workspace_scope ON true
      LEFT JOIN public.invoice_reminder_pauses invoice_pauses
        ON invoice_pauses.invoice_id = invoices.id
      LEFT JOIN public.workspace_reminder_customer_pauses customer_pauses
        ON customer_pauses.workspace_id = workspace_scope.workspace_id
       AND customer_pauses.normalized_email = lower(trim(customers.email))
      WHERE
        lower(coalesce(invoices.status, '')) NOT IN ('paid', 'void', 'draft')
        AND invoices.due_date IS NOT NULL
        AND invoices.due_date < ((now() at time zone 'Europe/Tallinn')::date)
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
      invoices.last_reminder_sent_at,
      invoices.user_email,
      invoices.invoice_number,
      invoices.status,
      customers.name AS customer_name,
      customers.email AS customer_email,
      workspace_scope.workspace_id AS workspace_id,
      users.is_verified AS owner_verified,
      false AS invoice_paused,
      false AS customer_paused
    FROM invoices
    JOIN customers
      ON customers.id = invoices.customer_id
    JOIN users
      ON lower(users.email) = lower(invoices.user_email)
    JOIN LATERAL (
      SELECT wm.workspace_id
      FROM public.workspace_members wm
      WHERE wm.user_id = users.id
        AND (${scopeWorkspaceId}::uuid is null OR wm.workspace_id = ${scopeWorkspaceId}::uuid)
      ORDER BY
        CASE WHEN wm.workspace_id = users.active_workspace_id THEN 0 ELSE 1 END ASC,
        wm.created_at ASC
      LIMIT 1
    ) workspace_scope ON true
    WHERE
      lower(coalesce(invoices.status, '')) NOT IN ('paid', 'void', 'draft')
      AND invoices.due_date IS NOT NULL
      AND invoices.due_date < ((now() at time zone 'Europe/Tallinn')::date)
    ORDER BY invoices.due_date ASC, invoices.id ASC
    LIMIT ${selectionLimit}
  `;
}

function resolveRunLogScope(input: {
  headerWorkspaceId: string | null;
  headerUserEmail: string | null;
  candidates: ReminderCandidate[];
  eligibleCandidates: ReminderCandidate[];
}): RunLogScope {
  const candidatesForScope =
    input.eligibleCandidates.length > 0 ? input.eligibleCandidates : input.candidates;

  const fromCandidatesWorkspaceId =
    candidatesForScope.find((candidate) => candidate.workspace_id)?.workspace_id ?? null;
  const workspaceId = input.headerWorkspaceId ?? fromCandidatesWorkspaceId;

  if (input.headerUserEmail) {
    return { workspaceId, userEmail: input.headerUserEmail };
  }

  const matchingWorkspaceCandidate = workspaceId
    ? candidatesForScope.find((candidate) => candidate.workspace_id === workspaceId)
    : null;
  const firstCandidateWithUser = candidatesForScope.find((candidate) =>
    Boolean(candidate.user_email?.trim()),
  );

  const userEmail =
    matchingWorkspaceCandidate?.user_email?.trim().toLowerCase() ||
    firstCandidateWithUser?.user_email?.trim().toLowerCase() ||
    null;

  return { workspaceId, userEmail };
}

// ÜHINE job, mida POST ja GET mõlemad kasutavad
async function runReminderJob(req: Request) {
  const parsedQuery = parseQuery(remindersRunQuerySchema, new URL(req.url));
  if (!parsedQuery.ok) {
    return parsedQuery.response;
  }

  const authorization = await authorizeRunRequest(req, parsedQuery.data);
  if (!authorization.ok) {
    return authorization.response;
  }

  const rateLimitResponse = await enforceRateLimit(
    req,
    authorization.source === 'cron'
      ? {
        bucket: 'reminders_run_cron',
        windowSec: 60,
        ipLimit: 30,
      }
      : {
        bucket: 'reminders_run_manual',
        windowSec: 300,
        ipLimit: 20,
        userLimit: 6,
      },
    { userKey: authorization.userEmail },
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const startedAt = Date.now();
  const ranAtIso = new Date(startedAt).toISOString();
  const runOptions = await parseRunOptions(req, parsedQuery.data);
  const {
    dryRun,
    triggeredBy,
    runLogWorkspaceId,
    runLogUserEmail,
    runLogActorEmail,
  } = runOptions;
  const baseUrl = getEmailBaseUrl();
  const batchSize = parsePositiveInt(process.env.EMAIL_BATCH_SIZE, DEFAULT_EMAIL_BATCH_SIZE);
  const delayMs = parsePositiveInt(process.env.EMAIL_THROTTLE_MS, DEFAULT_EMAIL_THROTTLE_MS);
  const maxRunMs = parsePositiveInt(process.env.EMAIL_MAX_RUN_MS, DEFAULT_EMAIL_MAX_RUN_MS);
  const selectionLimit = Math.max(batchSize * 10, batchSize + 1);
  const runConfig = {
    batchSize,
    throttleMs: delayMs,
    maxRunMs,
    dryRun,
  };
  const scopeWorkspaceId =
    runLogWorkspaceId?.trim() ||
    (authorization.source === 'manual' ? authorization.workspaceId : null) ||
    null;
  const lockKey = `reminders_run:${scopeWorkspaceId ?? 'global'}`;
  const lockHolder = `${triggeredBy}:${ranAtIso}:${Math.random().toString(36).slice(2, 10)}`;

  let lockAcquired = false;
  try {
    lockAcquired = await acquireJobLock({
      lockKey,
      holder: lockHolder,
      ttlSeconds: Math.max(120, Math.ceil(maxRunMs / 1000) + 30),
    });
  } catch (error) {
    if (isJobLocksMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Reminders locking requires DB migration 033_add_job_locks_and_invoice_email_logs.sql. Run migrations and retry.',
          code: 'REMINDER_LOCK_MIGRATION_REQUIRED',
        },
        { status: 503 },
      );
    }
    throw error;
  }

  if (!lockAcquired) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'lock_not_acquired',
      lockKey,
      triggeredBy,
      dryRun,
    });
  }

  try {

    let includeReminderPauseJoin = false;
    try {
      await assertReminderPauseSchemaReady();
      includeReminderPauseJoin = true;
    } catch (error) {
      if (!isReminderPauseMigrationRequiredError(error)) {
        throw error;
      }
    }

    const reminders = await fetchReminderCandidates(
      includeReminderPauseJoin,
      selectionLimit,
      scopeWorkspaceId,
    );
    const hasMoreFromSelection = reminders.length >= selectionLimit;
    const updatedInvoiceIds: string[] = [];
    const workspaceStats = new Map<string, WorkspaceAccumulator>();
    const decisions: CandidateDecision[] = [];
    const errors: RunErrorItem[] = [];
    const eligibleReminders: ReminderCandidate[] = [];
    const seenInvoiceIds = new Set<string>();
    const sentByUser = new Map<string, number>();
    let concurrentClaimSkips = 0;

    const senderConfigured = hasReminderSenderConfigured();

    if (reminders.length === 0) {
      console.log('No overdue invoices found for reminder run.');
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

      if (!reminder.owner_verified) {
        decisions.push({
          invoiceId: reminder.id,
          workspaceId: reminder.workspace_id,
          willSend: false,
          reason: 'owner_unverified',
        });
        incrementSkip(workspaceAccumulator, 'owner_unverified');
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

      if (!senderConfigured) {
        decisions.push({
          invoiceId: reminder.id,
          workspaceId: reminder.workspace_id,
          willSend: false,
          reason: 'sender_not_configured',
        });
        incrementSkip(workspaceAccumulator, 'sender_not_configured');
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

    if (process.env.NODE_ENV !== 'production') {
      const reasonCounts = decisions.reduce<Record<string, number>>((acc, decision) => {
        const key = decision.reason;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      console.log(
        `[reminders] candidates total=${reminders.length} eligible=${eligibleReminders.length} reasons=${JSON.stringify(reasonCounts)}`,
      );
    }

    const run = await sendWithThrottle(eligibleReminders, {
      delayMs: dryRun ? 0 : delayMs,
      maxItems: batchSize,
      maxRunMs,
      onItem: async (reminder) => {
        const workspaceAccumulator = getWorkspaceAccumulator(workspaceStats, reminder.workspace_id);
        const customerEmail = reminder.customer_email?.trim() ?? '';

        if (dryRun) {
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
          const claimed = await sql<{ id: string }[]>`
          update invoices
          set reminder_level = reminder_level + 1,
              last_reminder_sent_at = now()
          where id = ${reminder.id}
            and reminder_level = ${reminder.reminder_level}
          returning id
        `;

          if (claimed.length === 0) {
            concurrentClaimSkips += 1;
            incrementSkip(workspaceAccumulator, 'duplicate_in_run');
            return;
          }

          if (workspaceAccumulator) {
            workspaceAccumulator.attemptedCount += 1;
          }

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
          ${includeUnsubscribeLink && unsubscribeUrl
              ? `<p style="margin-top:12px;"><a href="${unsubscribeUrl}">Unsubscribe from reminder emails</a></p>`
              : ''
            }
          <p>Thank you,<br />Lateless</p>
        `;

          if (!reminder.workspace_id) {
            throw new Error('Workspace context is required to send reminder emails.');
          }

          const delivery =
            TEST_HOOKS_ENABLED && __testHooks.sendWorkspaceEmailOverride
              ? await __testHooks.sendWorkspaceEmailOverride({
                workspaceId: reminder.workspace_id,
                toEmail: customerEmail,
                subject,
                bodyHtml,
                bodyText,
                useCase: 'reminder',
              })
              : await sendWorkspaceEmail({
                workspaceId: reminder.workspace_id,
                toEmail: customerEmail,
                subject,
                bodyHtml,
                bodyText,
                useCase: 'reminder',
              });

          updatedInvoiceIds.push(reminder.id);
          if (workspaceAccumulator) {
            workspaceAccumulator.items.push({
              invoiceId: reminder.id,
              recipientEmail: customerEmail.toLowerCase(),
              provider: delivery.provider,
              providerMessageId: delivery.messageId,
              status: 'sent',
              errorCode: null,
              errorType: null,
              errorMessage: null,
            });
          }
          const normalizedUserEmail = reminder.user_email.trim().toLowerCase();
          sentByUser.set(
            normalizedUserEmail,
            (sentByUser.get(normalizedUserEmail) ?? 0) + 1,
          );
          if (workspaceAccumulator) {
            workspaceAccumulator.sentCount += 1;
          }
        } catch (error) {
          try {
            await sql`
            update invoices
            set
              reminder_level = ${reminder.reminder_level},
              last_reminder_sent_at = ${reminder.last_reminder_sent_at}
            where id = ${reminder.id}
              and reminder_level = ${reminder.reminder_level + 1}
          `;
          } catch (rollbackError) {
            console.error('Reminder rollback failed:', reminder.id, rollbackError);
          }

          console.error('Reminder send failed:', reminder.id, error);
          const errorItem = classifyDeliveryError({
            reminder,
            error,
            provider: 'unknown',
            providerMessageId: null,
          });
          errors.push(errorItem);

          if (workspaceAccumulator) {
            workspaceAccumulator.errorCount += 1;
            workspaceAccumulator.errors.push(errorItem);
            workspaceAccumulator.items.push({
              invoiceId: reminder.id,
              recipientEmail: customerEmail.toLowerCase(),
              provider: errorItem.provider,
              providerMessageId: errorItem.providerMessageId,
              status: 'error',
              errorCode: errorItem.errorCode,
              errorType: errorItem.errorType,
              errorMessage: errorItem.message,
            });
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
        const insertedRuns = await Promise.all(
          Array.from(workspaceStats.entries()).map(([workspaceId, stats]) =>
            insertReminderRun(workspaceId, {
              triggeredBy,
              dryRun,
              attemptedCount: stats.attemptedCount,
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
        await Promise.all(
          insertedRuns.map((runRecord) => {
            const stats = workspaceStats.get(runRecord.workspaceId);
            if (!stats || dryRun) {
              return Promise.resolve();
            }
            return insertReminderRunItems({
              runId: runRecord.id,
              workspaceId: runRecord.workspaceId,
              items: stats.items,
            });
          }),
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

    const aggregatedStats = Array.from(workspaceStats.values()).reduce(
      (acc, stats) => {
        acc.attempted += stats.attemptedCount;
        acc.sent += stats.sentCount;
        acc.errors += stats.errorCount;
        return acc;
      },
      { attempted: 0, sent: 0, errors: 0 },
    );
    const sentCount = aggregatedStats.sent;
    const attemptedCount = aggregatedStats.attempted;
    const errorCount = aggregatedStats.errors;
    const skippedCount =
      decisions.filter((decision) => !decision.willSend).length + concurrentClaimSkips;
    const skippedBreakdown = decisions.reduce<Required<ReminderRunSkippedBreakdown>>(
      (acc, decision) => {
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

        if (
          decision.reason === 'not_eligible' ||
          decision.reason === 'owner_unverified' ||
          decision.reason === 'sender_not_configured'
        ) {
          acc.not_eligible += 1;
          return acc;
        }

        acc.other += 1;
        return acc;
      },
      { ...emptyBreakdown },
    );
    skippedBreakdown.other += concurrentClaimSkips;

    console.log(
      `[reminders] ranAt=${ranAtIso} dryRun=${dryRun} attempted=${attemptedCount} sent=${sentCount} skipped=${skippedCount} errors=${errorCount} hasMore=${run.hasMore || hasMoreFromSelection}`,
    );

    const hasMore = run.hasMore || hasMoreFromSelection;
    const runLogScope = resolveRunLogScope({
      headerWorkspaceId: runLogWorkspaceId,
      headerUserEmail: runLogUserEmail || authorization.userEmail,
      candidates: reminders,
      eligibleCandidates: eligibleReminders,
    });

    if (!dryRun && sentByUser.size > 0) {
      await Promise.all(
        Array.from(sentByUser.entries()).map(([userEmail, sentCountForUser]) =>
          logFunnelEvent({
            userEmail,
            eventName: 'first_reminder_sent',
            source: 'nudge',
            meta: { sentCount: sentCountForUser, triggeredBy },
          }),
        ),
      );
    }

    const eligibleCount = decisions.filter((decision) => decision.willSend).length;
    const responseMessage =
      reminders.length === 0
        ? 'No overdue invoices found.'
        : eligibleCount === 0
          ? `No eligible reminders to send. Skipped ${skippedCount} overdue invoice(s).`
          : null;

    const responsePayload = {
      ranAt: ranAtIso,
      attempted: attemptedCount,
      sent: sentCount,
      failed: errorCount,
      skipped: skippedCount,
      hasMore,
      updatedCount: sentCount,
      updatedInvoiceIds,
      dryRun,
      triggeredBy,
      durationMs,
      actorEmail:
        triggeredBy === 'manual'
          ? runLogActorEmail || authorization.actorEmail
          : null,
      workspaceId: runLogScope.workspaceId,
      userEmail: runLogScope.userEmail || authorization.userEmail,
      config: runConfig,
      message: responseMessage,
      summary: {
        attempted: attemptedCount,
        sent: sentCount,
        failed: errorCount,
        skipped: skippedCount,
        hasMore,
        sentCount,
        skippedCount,
        errorCount,
        skippedBreakdown,
        wouldSendCount: eligibleCount,
      },
      candidates: decisions,
      errors: errors.slice(-10),
    };

    let runLogWritten = false;
    const runWarnings: string[] = [];

    try {
      await insertReminderRunLog({
        triggeredBy: triggeredBy === 'cron' ? 'cron' : 'manual',
        workspaceId: runLogScope.workspaceId,
        userEmail: runLogScope.userEmail || authorization.userEmail,
        actorEmail:
          triggeredBy === 'manual'
            ? runLogActorEmail || authorization.actorEmail
            : null,
        config: runConfig,
        attempted: attemptedCount,
        sent: sentCount,
        failed: errorCount,
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
  } finally {
    await releaseJobLock({
      lockKey,
      holder: lockHolder,
    }).catch((error) => {
      console.error('Failed to release reminders lock:', lockKey, error);
    });
  }
}

// SIIT ALATES AINULT 2 HANDLERIT
export async function POST(req: Request) {
  return runReminderJob(req);
}

// GET must NEVER trigger a mutation. Always 405.
// (The previous ALLOW_REMINDERS_RUN_GET=1 escape hatch has been removed as a
//  P0 security fix \u2014 cron jobs MUST use POST with a cron token.)
export async function GET() {
  return NextResponse.json(
    { ok: false, error: 'Method Not Allowed. Use POST.' },
    { status: 405 },
  );
}
