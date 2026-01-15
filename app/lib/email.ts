type SendInvoiceReminderEmailInput = {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

export async function sendInvoiceReminderEmail(
  payload: SendInvoiceReminderEmailInput,
) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // TODO: Replace with your email provider integration.
    console.log('[reminder email stub]', payload.subject, payload.to);
    return;
  }

  const from = process.env.REMINDER_FROM_EMAIL ?? 'Invoicify <noreply@invoicify.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.bodyHtml,
      text: payload.bodyText,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed: ${detail}`);
  }
}
