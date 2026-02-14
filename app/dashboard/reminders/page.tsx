import { Metadata } from 'next';
import postgres from 'postgres';
import RemindersPanel from './reminders-panel';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  fetchWorkspaceEmailSettings,
  isSmtpMigrationRequiredError,
  type WorkspaceEmailSettings,
} from '@/app/lib/smtp-settings';
import {
  fetchUnsubscribeSettings,
  isUnsubscribeMigrationRequiredError,
} from '@/app/lib/unsubscribe';
import {
  assertReminderPauseSchemaReady,
  isReminderPauseMigrationRequiredError,
} from '@/app/lib/reminder-pauses';
import { generatePayLink } from '@/app/lib/pay-link';
import type { ReminderPanelItem } from './reminders-panel';

export const metadata: Metadata = {
  title: 'Reminders',
};

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

type ReminderQueryRow = {
  invoice_id: string;
  invoice_number: string | null;
  amount: number;
  due_date: string | Date;
  reminder_level: number;
  last_reminder_sent_at: string | Date | null;
  status: string;
  customer_name: string;
  customer_email: string | null;
  next_send_date: string | Date;
  cadence_reason: string;
  unsubscribe_enabled: boolean;
  is_unsubscribed: boolean;
  invoice_paused: boolean;
  customer_paused: boolean;
  pause_state: 'invoice_paused' | 'customer_paused' | null;
  skip_reason: string | null;
  will_send: boolean;
};

function formatAmount(amount: number) {
  return (amount / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'EUR',
  });
}

function formatDate(value: string | Date) {
  const parsed =
    value instanceof Date
      ? value
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00Z`)
        : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 'Invalid date';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(parsed);
}

function resolveBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')
  );
}

function getEmailDomain(email: string) {
  const [, domain] = email.trim().toLowerCase().split('@');
  return domain || null;
}

async function fetchUpcomingReminders(
  workspaceId: string,
  includeUnsubscribeJoin: boolean,
  includeReminderPauseJoin: boolean,
) {
  if (includeUnsubscribeJoin && includeReminderPauseJoin) {
    return sql<ReminderQueryRow[]>`
      SELECT
        invoices.id AS invoice_id,
        invoices.invoice_number,
        invoices.amount,
        invoices.due_date,
        invoices.reminder_level,
        invoices.last_reminder_sent_at,
        invoices.status,
        customers.name AS customer_name,
        customers.email AS customer_email,
        CASE
          WHEN invoices.reminder_level = 0 THEN GREATEST(invoices.due_date + 1, current_date)
          WHEN invoices.reminder_level = 1 THEN (invoices.last_reminder_sent_at + interval '7 days')::date
          WHEN invoices.reminder_level = 2 THEN (invoices.last_reminder_sent_at + interval '14 days')::date
          ELSE current_date
        END AS next_send_date,
        CASE
          WHEN invoices.reminder_level = 0 THEN 'Overdue'
          WHEN invoices.reminder_level = 1 THEN '7d since last reminder'
          WHEN invoices.reminder_level = 2 THEN '14d since last reminder'
          ELSE 'Pending'
        END AS cadence_reason,
        COALESCE(unsub_settings.enabled, true) AS unsubscribe_enabled,
        (unsub.normalized_email IS NOT NULL) AS is_unsubscribed,
        (invoice_pauses.invoice_id IS NOT NULL) AS invoice_paused,
        (customer_pauses.normalized_email IS NOT NULL) AS customer_paused,
        CASE
          WHEN invoice_pauses.invoice_id IS NOT NULL THEN 'invoice_paused'
          WHEN customer_pauses.normalized_email IS NOT NULL THEN 'customer_paused'
          ELSE null
        END AS pause_state,
        CASE
          WHEN invoice_pauses.invoice_id IS NOT NULL THEN 'Skipped (paused)'
          WHEN customer_pauses.normalized_email IS NOT NULL THEN 'Skipped (paused)'
          WHEN trim(coalesce(customers.email, '')) = '' THEN 'Skipped (missing customer email)'
          WHEN COALESCE(unsub_settings.enabled, true) AND unsub.normalized_email IS NOT NULL THEN 'Skipped (unsubscribed)'
          ELSE null
        END AS skip_reason,
        NOT (
          invoice_pauses.invoice_id IS NOT NULL
          OR customer_pauses.normalized_email IS NOT NULL
          OR trim(coalesce(customers.email, '')) = ''
          OR (COALESCE(unsub_settings.enabled, true) AND unsub.normalized_email IS NOT NULL)
        ) AS will_send
      FROM public.invoices
      JOIN public.customers
        ON customers.id = invoices.customer_id
      JOIN public.users
        ON lower(users.email) = lower(invoices.user_email)
      JOIN public.workspace_members wm
        ON wm.user_id = users.id
       AND wm.workspace_id = ${workspaceId}
      LEFT JOIN public.workspace_unsubscribe_settings unsub_settings
        ON unsub_settings.workspace_id = wm.workspace_id
      LEFT JOIN public.workspace_unsubscribes unsub
        ON unsub.workspace_id = wm.workspace_id
       AND unsub.normalized_email = lower(trim(customers.email))
      LEFT JOIN public.invoice_reminder_pauses invoice_pauses
        ON invoice_pauses.invoice_id = invoices.id
      LEFT JOIN public.workspace_reminder_customer_pauses customer_pauses
        ON customer_pauses.workspace_id = wm.workspace_id
       AND customer_pauses.normalized_email = lower(trim(customers.email))
      WHERE
        users.plan IN ('solo', 'pro', 'studio')
        AND users.is_verified = true
        AND users.subscription_status IN ('active', 'trialing')
        AND invoices.status = 'pending'
        AND invoices.due_date IS NOT NULL
        AND invoices.due_date < current_date
        AND invoices.reminder_level < 3
        AND (
          invoices.reminder_level = 0
          OR (invoices.reminder_level IN (1, 2) AND invoices.last_reminder_sent_at IS NOT NULL)
        )
      ORDER BY
        next_send_date ASC,
        invoices.id ASC
      LIMIT 50
    `;
  }

  if (includeUnsubscribeJoin) {
    return sql<ReminderQueryRow[]>`
      SELECT
        invoices.id AS invoice_id,
        invoices.invoice_number,
        invoices.amount,
        invoices.due_date,
        invoices.reminder_level,
        invoices.last_reminder_sent_at,
        invoices.status,
        customers.name AS customer_name,
        customers.email AS customer_email,
        CASE
          WHEN invoices.reminder_level = 0 THEN GREATEST(invoices.due_date + 1, current_date)
          WHEN invoices.reminder_level = 1 THEN (invoices.last_reminder_sent_at + interval '7 days')::date
          WHEN invoices.reminder_level = 2 THEN (invoices.last_reminder_sent_at + interval '14 days')::date
          ELSE current_date
        END AS next_send_date,
        CASE
          WHEN invoices.reminder_level = 0 THEN 'Overdue'
          WHEN invoices.reminder_level = 1 THEN '7d since last reminder'
          WHEN invoices.reminder_level = 2 THEN '14d since last reminder'
          ELSE 'Pending'
        END AS cadence_reason,
        COALESCE(unsub_settings.enabled, true) AS unsubscribe_enabled,
        (unsub.normalized_email IS NOT NULL) AS is_unsubscribed,
        false AS invoice_paused,
        false AS customer_paused,
        null AS pause_state,
        CASE
          WHEN trim(coalesce(customers.email, '')) = '' THEN 'Skipped (missing customer email)'
          WHEN COALESCE(unsub_settings.enabled, true) AND unsub.normalized_email IS NOT NULL THEN 'Skipped (unsubscribed)'
          ELSE null
        END AS skip_reason,
        NOT (
          trim(coalesce(customers.email, '')) = ''
          OR (COALESCE(unsub_settings.enabled, true) AND unsub.normalized_email IS NOT NULL)
        ) AS will_send
      FROM public.invoices
      JOIN public.customers
        ON customers.id = invoices.customer_id
      JOIN public.users
        ON lower(users.email) = lower(invoices.user_email)
      JOIN public.workspace_members wm
        ON wm.user_id = users.id
       AND wm.workspace_id = ${workspaceId}
      LEFT JOIN public.workspace_unsubscribe_settings unsub_settings
        ON unsub_settings.workspace_id = wm.workspace_id
      LEFT JOIN public.workspace_unsubscribes unsub
        ON unsub.workspace_id = wm.workspace_id
       AND unsub.normalized_email = lower(trim(customers.email))
      WHERE
        users.plan IN ('solo', 'pro', 'studio')
        AND users.is_verified = true
        AND users.subscription_status IN ('active', 'trialing')
        AND invoices.status = 'pending'
        AND invoices.due_date IS NOT NULL
        AND invoices.due_date < current_date
        AND invoices.reminder_level < 3
        AND (
          invoices.reminder_level = 0
          OR (invoices.reminder_level IN (1, 2) AND invoices.last_reminder_sent_at IS NOT NULL)
        )
      ORDER BY
        next_send_date ASC,
        invoices.id ASC
      LIMIT 50
    `;
  }

  return sql<ReminderQueryRow[]>`
      SELECT
        invoices.id AS invoice_id,
        invoices.invoice_number,
        invoices.amount,
        invoices.due_date,
        invoices.reminder_level,
        invoices.last_reminder_sent_at,
        invoices.status,
        customers.name AS customer_name,
        customers.email AS customer_email,
      CASE
        WHEN invoices.reminder_level = 0 THEN GREATEST(invoices.due_date + 1, current_date)
        WHEN invoices.reminder_level = 1 THEN (invoices.last_reminder_sent_at + interval '7 days')::date
        WHEN invoices.reminder_level = 2 THEN (invoices.last_reminder_sent_at + interval '14 days')::date
        ELSE current_date
      END AS next_send_date,
      CASE
        WHEN invoices.reminder_level = 0 THEN 'Overdue'
        WHEN invoices.reminder_level = 1 THEN '7d since last reminder'
        WHEN invoices.reminder_level = 2 THEN '14d since last reminder'
        ELSE 'Pending'
      END AS cadence_reason,
      false AS unsubscribe_enabled,
      false AS is_unsubscribed,
      false AS invoice_paused,
      false AS customer_paused,
      null AS pause_state,
      CASE
        WHEN trim(coalesce(customers.email, '')) = '' THEN 'Skipped (missing customer email)'
        ELSE null
      END AS skip_reason,
      trim(coalesce(customers.email, '')) <> '' AS will_send
    FROM public.invoices
    JOIN public.customers
      ON customers.id = invoices.customer_id
    JOIN public.users
      ON lower(users.email) = lower(invoices.user_email)
    JOIN public.workspace_members wm
      ON wm.user_id = users.id
      AND wm.workspace_id = ${workspaceId}
    WHERE
      users.plan IN ('solo', 'pro', 'studio')
      AND users.is_verified = true
      AND users.subscription_status IN ('active', 'trialing')
      AND invoices.status = 'pending'
      AND invoices.due_date IS NOT NULL
      AND invoices.due_date < current_date
      AND invoices.reminder_level < 3
      AND (
        invoices.reminder_level = 0
        OR (invoices.reminder_level IN (1, 2) AND invoices.last_reminder_sent_at IS NOT NULL)
      )
    ORDER BY
      next_send_date ASC,
      invoices.id ASC
    LIMIT 50
  `;
}

export default async function RemindersPage() {
  try {
    const workspaceContext = await ensureWorkspaceContextForCurrentUser();
    const baseUrl = resolveBaseUrl();

    let emailSettings: WorkspaceEmailSettings | null = null;
    let smtpMigrationWarning: string | null = null;
    try {
      emailSettings = await fetchWorkspaceEmailSettings(workspaceContext.workspaceId);
    } catch (error) {
      if (isSmtpMigrationRequiredError(error)) {
        smtpMigrationWarning =
          'Email provider settings unavailable. Run migration 008_add_workspace_email_settings.sql.';
      } else {
        throw error;
      }
    }

    let unsubscribeEnabled = false;
    let includeUnsubscribeJoin = false;
    try {
      const unsubscribeSettings = await fetchUnsubscribeSettings(workspaceContext.workspaceId);
      unsubscribeEnabled = unsubscribeSettings.enabled;
      includeUnsubscribeJoin = true;
    } catch (error) {
      if (!isUnsubscribeMigrationRequiredError(error)) {
        throw error;
      }
    }

    let reminderPauseMigrationWarning: string | null = null;
    let includeReminderPauseJoin = false;
    try {
      await assertReminderPauseSchemaReady();
      includeReminderPauseJoin = true;
    } catch (error) {
      if (isReminderPauseMigrationRequiredError(error)) {
        reminderPauseMigrationWarning =
          'Pause controls unavailable. Run migration 015_add_reminder_pauses.sql.';
      } else {
        throw error;
      }
    }

    const rows = await fetchUpcomingReminders(
      workspaceContext.workspaceId,
      includeUnsubscribeJoin,
      includeReminderPauseJoin,
    );

    const items: ReminderPanelItem[] = rows.map((row) => {
      const reminderNumber = row.reminder_level + 1;
      const amountLabel = formatAmount(row.amount);
      const dueDateLabel = formatDate(row.due_date);
      const nextSendDateLabel = formatDate(row.next_send_date);
      const customerEmail = row.customer_email?.trim() ?? '';
      const willSend: ReminderPanelItem['willSend'] = row.will_send ? 'yes' : 'no';
      const skipReason = row.skip_reason;

      let payLinkPreview = `${baseUrl}/pay/${row.invoice_id}`;
      try {
        payLinkPreview = generatePayLink(baseUrl, row.invoice_id);
      } catch {
        payLinkPreview = `${baseUrl}/pay/${row.invoice_id}`;
      }

      const invoiceLabel = row.invoice_number?.trim() || row.invoice_id;
      const subject = `Invoice reminder #${reminderNumber}: ${amountLabel} due`;
      const previewBody = [
        `Invoice: ${invoiceLabel}`,
        `Customer: ${row.customer_name}`,
        `Amount: ${amountLabel}`,
        `Due date: ${dueDateLabel}`,
        `Next send date: ${nextSendDateLabel}`,
        `Reminder level: ${row.reminder_level}`,
        `Last reminder sent: ${
          row.last_reminder_sent_at ? formatDate(row.last_reminder_sent_at) : 'Never'
        }`,
        `Pause state: ${row.pause_state ? row.pause_state.replace('_', ' ') : 'Not paused'}`,
        `Unsubscribed: ${row.is_unsubscribed ? 'Yes' : 'No'}`,
        `Missing email: ${customerEmail ? 'No' : 'Yes'}`,
        `Will send: ${row.will_send ? 'Yes' : 'No'}`,
        `Pay link: ${payLinkPreview}`,
        ...(unsubscribeEnabled ? ['Unsubscribe link included when enabled for workspace.'] : []),
      ].join('\n');

      return {
        invoiceId: row.invoice_id,
        invoiceLabel,
        amountLabel,
        dueDateLabel,
        nextSendDateLabel,
        reminderNumber,
        customerName: row.customer_name,
        customerEmail,
        status: row.status === 'paid' ? 'paid' : 'pending',
        reason: row.cadence_reason,
        willSend,
        skipReason,
        pauseState: row.pause_state,
        isUnsubscribed: row.is_unsubscribed,
        unsubscribeEnabled: unsubscribeEnabled && row.unsubscribe_enabled,
        isInvoicePaused: row.invoice_paused,
        isCustomerPaused: row.customer_paused,
        dueDateIso: new Date(row.due_date).toISOString(),
        nextSendDateIso: new Date(row.next_send_date).toISOString(),
        lastReminderSentAtIso: row.last_reminder_sent_at
          ? new Date(row.last_reminder_sent_at).toISOString()
          : null,
        reminderLevel: row.reminder_level,
        subject,
        previewBody,
      };
    });

    const canRunReminders =
      workspaceContext.userRole === 'owner' || workspaceContext.userRole === 'admin';

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[reminders] page context',
        JSON.stringify({
          workspaceId: workspaceContext.workspaceId,
          userEmail: workspaceContext.userEmail,
          resolvedRole: workspaceContext.userRole,
          canRunReminders,
        }),
      );
    }

    const resendDomain = getEmailDomain(emailSettings?.fromEmail ?? '');

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Reminders
          </h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Forecast upcoming reminder emails and preview content.
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
            Workspace: {workspaceContext.workspaceName} · Role: {workspaceContext.userRole}
          </p>
        </div>

        <RemindersPanel
          items={items}
          canRunReminders={canRunReminders}
          smtpMigrationWarning={smtpMigrationWarning}
          emailProvider={emailSettings?.provider ?? null}
          smtpHost={emailSettings?.smtpHost ?? null}
          fromEmail={emailSettings?.fromEmail ?? null}
          resendDomain={resendDomain}
          canManagePauses={
            workspaceContext.userRole === 'owner' || workspaceContext.userRole === 'admin'
          }
          pauseMigrationWarning={reminderPauseMigrationWarning}
        />
      </div>
    );
  } catch (error) {
    if (isTeamMigrationRequiredError(error)) {
      return (
        <div className="rounded-2xl border border-amber-300 bg-amber-100 p-5 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          Reminders view requires team migration support. Run
          {' '}
          <code>007_add_workspaces_and_team.sql</code>
          {' '}
          and
          {' '}
          <code>013_add_active_workspace_and_company_profile_workspace_scope.sql</code>.
        </div>
      );
    }

    throw error;
  }
}
