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

export async function sendEmailVerification(options: {
  to: string;
  verifyUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[verification email stub]', options.to);
    return;
  }

  const from = process.env.REMINDER_FROM_EMAIL ?? 'Invoicify <noreply@invoicify.dev>';
  const subject = 'Verify your email for Lateless';
  const bodyHtml = `
    <p>Hi, please verify your email for Lateless.</p>
    <p><a href="${options.verifyUrl}">Verify email</a></p>
  `;
  const bodyText = `Hi, please verify your email for Lateless.\n\nVerify email: ${options.verifyUrl}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject,
      html: bodyHtml,
      text: bodyText,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed: ${detail}`);
  }
}

export async function sendTwoFactorCodeEmail(options: {
  to: string;
  code: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[2fa email stub]', options.to);
    return;
  }

  const from = process.env.REMINDER_FROM_EMAIL ?? 'Invoicify <noreply@invoicify.dev>';
  const subject = 'Your Lateless login code';
  const bodyHtml = `
    <p>Use this 6-digit code to finish logging in to Lateless:</p>
    <p><strong style="font-size:24px;letter-spacing:0.08em;">${options.code}</strong></p>
  `;
  const bodyText = `Use this 6-digit code to finish logging in to Lateless:\n\n${options.code}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject,
      html: bodyHtml,
      text: bodyText,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed: ${detail}`);
  }
}

export async function sendPasswordResetEmail(options: {
  to: string;
  resetUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[password reset email stub]', options.to);
    return;
  }

  const from = process.env.REMINDER_FROM_EMAIL ?? 'Invoicify <noreply@invoicify.dev>';
  const subject = 'Reset your Lateless password';
  const bodyHtml = `
    <p>Click this link to reset your password:</p>
    <p><a href="${options.resetUrl}">${options.resetUrl}</a></p>
  `;
  const bodyText = `Click this link to reset your password:\n\n${options.resetUrl}`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject,
      html: bodyHtml,
      text: bodyText,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed: ${detail}`);
  }
}

export async function sendWorkspaceInviteEmail(options: {
  to: string;
  invitedByEmail: string;
  workspaceName: string;
  inviteUrl: string;
  role: 'admin' | 'member';
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[team invite email stub]', options.to);
    return;
  }

  const from = process.env.REMINDER_FROM_EMAIL ?? 'Invoicify <noreply@invoicify.dev>';
  const subject = `You were invited to join ${options.workspaceName}`;
  const bodyHtml = `
    <p>You were invited to join <strong>${options.workspaceName}</strong> on Lateless.</p>
    <p>Role: <strong>${options.role}</strong></p>
    <p>Invited by: ${options.invitedByEmail}</p>
    <p><a href="${options.inviteUrl}">Accept invite</a></p>
  `;
  const bodyText = [
    `You were invited to join ${options.workspaceName} on Lateless.`,
    `Role: ${options.role}`,
    `Invited by: ${options.invitedByEmail}`,
    '',
    `Accept invite: ${options.inviteUrl}`,
  ].join('\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject,
      html: bodyHtml,
      text: bodyText,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed: ${detail}`);
  }
}

export async function sendRefundRequestNotificationEmail(options: {
  to: string;
  invoiceLabel: string;
  reason: string;
  payerEmail: string | null;
  refundsUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[refund request email stub]', options.to);
    return;
  }

  const from = process.env.REMINDER_FROM_EMAIL ?? 'Invoicify <noreply@invoicify.dev>';
  const subject = `Refund request for invoice ${options.invoiceLabel}`;
  const payerLine = options.payerEmail ? `Payer email: ${options.payerEmail}` : 'Payer email: not provided';
  const bodyHtml = `
    <p>A new refund request was submitted for invoice <strong>${options.invoiceLabel}</strong>.</p>
    <p>${payerLine}</p>
    <p>Reason:</p>
    <p>${options.reason}</p>
    <p><a href="${options.refundsUrl}">Review refund requests</a></p>
  `;
  const bodyText = [
    `A new refund request was submitted for invoice ${options.invoiceLabel}.`,
    payerLine,
    '',
    'Reason:',
    options.reason,
    '',
    `Review refund requests: ${options.refundsUrl}`,
  ].join('\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject,
      html: bodyHtml,
      text: bodyText,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed: ${detail}`);
  }
}
