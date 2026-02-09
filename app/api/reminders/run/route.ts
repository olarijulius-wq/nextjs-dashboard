import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { sendInvoiceReminderEmail } from '@/app/lib/email';
import { generatePayLink } from '@/app/lib/pay-link';
import {
  fetchUnsubscribeSettings,
  isRecipientUnsubscribed,
  isUnsubscribeMigrationRequiredError,
  issueUnsubscribeToken,
} from '@/app/lib/unsubscribe';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')
  );
}

function getAuthToken(req: Request) {
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }

  const url = new URL(req.url);
  return url.searchParams.get('token');
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

// ÜHINE job, mida POST ja GET mõlemad kasutavad
async function runReminderJob(req: Request) {
  const token = getAuthToken(req);
  const expectedToken = process.env.REMINDER_CRON_TOKEN;

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = getBaseUrl();

  const reminders = await sql<{
    id: string;
    amount: number;
    due_date: string;
    reminder_level: number;
    user_email: string;
    customer_name: string;
    customer_email: string;
    invoice_number: string | null;
    workspace_id: string | null;
  }[]>`
    SELECT
      invoices.id,
      invoices.amount,
      invoices.due_date,
      invoices.reminder_level,
      invoices.user_email,
      invoices.invoice_number,
      customers.name AS customer_name,
      customers.email AS customer_email,
      workspaces.id AS workspace_id
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
  `;

  const sentInvoiceIds: string[] = [];

  if (reminders.length === 0) {
    console.log(
      'No reminders to send (either none overdue or owners not verified).',
    );
  }

  for (const reminder of reminders) {
    try {
      let includeUnsubscribeLink = false;
      let unsubscribeUrl: string | null = null;

      if (reminder.workspace_id) {
        try {
          const unsubscribeSettings = await fetchUnsubscribeSettings(
            reminder.workspace_id,
          );
          if (unsubscribeSettings.enabled) {
            const alreadyUnsubscribed = await isRecipientUnsubscribed(
              reminder.workspace_id,
              reminder.customer_email,
            );

            if (alreadyUnsubscribed) {
              continue;
            }

            const unsubscribePath = await issueUnsubscribeToken(
              reminder.workspace_id,
              reminder.customer_email,
            );
            unsubscribeUrl = `${baseUrl}${unsubscribePath}`;
            includeUnsubscribeLink = true;
          }
        } catch (unsubscribeError) {
          if (!isUnsubscribeMigrationRequiredError(unsubscribeError)) {
            console.error(
              'Unsubscribe check failed:',
              reminder.id,
              unsubscribeError,
            );
          }
        }
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
        ${
          includeUnsubscribeLink && unsubscribeUrl
            ? `<p style="margin-top:12px;"><a href="${unsubscribeUrl}">Unsubscribe from reminder emails</a></p>`
            : ''
        }
        <p>Thank you,<br />Lateless</p>
      `;

      await sendInvoiceReminderEmail({
        to: reminder.customer_email,
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
      sentInvoiceIds.push(reminder.id);
    } catch (error) {
      console.error('Reminder send failed:', reminder.id, error);
    }
  }

  const ranAt = new Date().toISOString();
  console.log(`[reminders] ranAt=${ranAt} sent=${sentInvoiceIds.length}`);

  return NextResponse.json({
    ranAt,
    updatedCount: sentInvoiceIds.length,
    updatedInvoiceIds: sentInvoiceIds,
    dryRun: false,
  });
}

// SIIT ALATES AINULT 2 HANDLERIT
export async function POST(req: Request) {
  return runReminderJob(req);
}

export async function GET(req: Request) {
  return POST(req);
}
