import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { sendInvoiceReminderEmail } from '@/app/lib/email';
import { generatePayLink } from '@/app/lib/pay-link';

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

export async function POST(req: Request) {
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
  }[]>`
    WITH target AS (
      SELECT
        invoices.id,
        invoices.amount,
        invoices.due_date,
        invoices.reminder_level,
        invoices.user_email,
        invoices.invoice_number,
        customers.name AS customer_name,
        customers.email AS customer_email
      FROM invoices
      JOIN customers
        ON customers.id = invoices.customer_id
      WHERE
        invoices.status = 'pending'
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
    )
    UPDATE invoices
    SET
      reminder_level = invoices.reminder_level + 1,
      last_reminder_sent_at = now()
    FROM target
    WHERE invoices.id = target.id
    RETURNING
      invoices.id,
      invoices.amount,
      invoices.due_date,
      invoices.reminder_level,
      invoices.user_email,
      target.customer_name,
      target.customer_email,
      invoices.invoice_number
  `;

  const updatedInvoiceIds = reminders.map((reminder) => reminder.id);

  for (const reminder of reminders) {
    try {
      const payLink = generatePayLink(baseUrl, reminder.id);
      const amountLabel = formatAmount(reminder.amount);
      const dueDateLabel = formatDate(reminder.due_date);
      const reminderNumber = reminder.reminder_level;
      const subject = `Invoice reminder #${reminderNumber}: ${amountLabel} due`;

      const bodyText = [
        `Hi ${reminder.customer_name},`,
        '',
        `This is a reminder that your invoice is overdue.`,
        `Amount: ${amountLabel}`,
        `Due date: ${dueDateLabel}`,
        `Pay here: ${payLink}`,
        '',
        'Thank you,',
        'Invoicify',
      ].join('\n');

      const bodyHtml = `
        <p>Hi ${reminder.customer_name},</p>
        <p>This is a reminder that your invoice is overdue.</p>
        <ul>
          <li><strong>Amount:</strong> ${amountLabel}</li>
          <li><strong>Due date:</strong> ${dueDateLabel}</li>
        </ul>
        <p><a href="${payLink}">Pay this invoice now</a></p>
        <p>Thank you,<br />Invoicify</p>
      `;

      await sendInvoiceReminderEmail({
        to: reminder.customer_email,
        subject,
        bodyHtml,
        bodyText,
      });

    } catch (error) {
      console.error('Reminder send failed:', reminder.id, error);
    }
  }

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    updatedCount: reminders.length,
    updatedInvoiceIds,
    dryRun: false,
  });
}
