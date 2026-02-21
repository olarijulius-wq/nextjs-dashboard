import { SUPPORT_EMAIL } from '@/app/legal/constants';

type SendInvoiceReminderEmailInput = {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

export type MailProviderMode = 'resend' | 'smtp';

export type EffectiveMailConfig = {
  provider: MailProviderMode;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  resendKeyPresent: boolean;
  ok: boolean;
  problems: string[];
};

type MailSettingsLike = {
  provider?: MailProviderMode;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUsername?: string | null;
  smtpPasswordPresent?: boolean;
};

function parseProvider(raw: string | null | undefined): MailProviderMode | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'resend' || value === 'smtp') return value;
  return null;
}

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function extractEmailAddress(value: string | null | undefined): string {
  const raw = normalizeText(value);
  if (!raw) return '';

  const bracketMatch = raw.match(/<\s*([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)\s*>/);
  const candidate = (bracketMatch?.[1] ?? raw).replace(/^mailto:/i, '').trim();
  if (!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(candidate)) {
    return '';
  }
  return candidate.toLowerCase();
}

function isSimpleEmail(value: string): boolean {
  return /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(value);
}

function sanitizeFromName(value: string): string {
  return value.replace(/[\r\n<>"]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function resolveReminderFromEmail(): string {
  const mailFrom = extractEmailAddress(process.env.MAIL_FROM_EMAIL);
  if (mailFrom) return mailFrom;

  const reminderFrom = extractEmailAddress(process.env.REMINDER_FROM_EMAIL);
  if (reminderFrom) return reminderFrom;

  return 'noreply@lateless.app';
}

export function resolveMailFromName(): string {
  return normalizeText(process.env.MAIL_FROM_NAME) || 'Lateless';
}

export function buildMailFromHeader(fromEmail: string, fromName?: string | null): string {
  const email = extractEmailAddress(fromEmail) || resolveReminderFromEmail();
  const name = sanitizeFromName(normalizeText(fromName));
  if (!name) return email;
  return `${name} <${email}>`;
}

export function buildResendFromHeader(fromEmail: string): string {
  const email =
    extractEmailAddress(fromEmail) ||
    extractEmailAddress(process.env.MAIL_FROM_EMAIL) ||
    extractEmailAddress(process.env.REMINDER_FROM_EMAIL) ||
    'noreply@lateless.app';
  return buildMailFromHeader(email, resolveMailFromName());
}

export function isValidMailFromHeader(value: string): boolean {
  const trimmed = normalizeText(value);
  if (!trimmed) return false;
  if (trimmed.includes('\r') || trimmed.includes('\n')) return false;
  const bracketMatch = trimmed.match(/^([^<>]+)\s<([^<>]+)>$/);
  if (bracketMatch) {
    const name = sanitizeFromName(bracketMatch[1] ?? '');
    const email = (bracketMatch[2] ?? '').trim().toLowerCase();
    return Boolean(name) && isSimpleEmail(email);
  }
  return isSimpleEmail(trimmed.toLowerCase());
}

export function getEffectiveMailConfig(input?: {
  workspaceSettings?: MailSettingsLike | null;
}): EffectiveMailConfig {
  const workspace = input?.workspaceSettings ?? null;
  const envProvider = parseProvider(process.env.EMAIL_PROVIDER);
  const provider = envProvider ?? workspace?.provider ?? 'resend';

  const fromEmail =
    normalizeEmail(process.env.MAIL_FROM_EMAIL) ||
    normalizeEmail(workspace?.fromEmail) ||
    resolveReminderFromEmail();
  const fromName =
    normalizeText(process.env.MAIL_FROM_NAME) ||
    normalizeText(workspace?.fromName) ||
    'Lateless';
  const replyTo =
    normalizeEmail(workspace?.replyTo) ||
    normalizeEmail(process.env.SUPPORT_EMAIL) ||
    normalizeEmail(SUPPORT_EMAIL) ||
    null;
  const smtpHost = normalizeText(workspace?.smtpHost) || null;
  const smtpPort = workspace?.smtpPort ?? null;
  const smtpUsername = normalizeText(workspace?.smtpUsername);
  const smtpPasswordPresent = Boolean(workspace?.smtpPasswordPresent);
  const resendKeyPresent = Boolean((process.env.RESEND_API_KEY ?? '').trim());

  const problems: string[] = [];
  if (!normalizeEmail(process.env.MAIL_FROM_EMAIL)) {
    problems.push('MAIL_FROM_EMAIL missing');
  }
  if (provider === 'resend' && !resendKeyPresent) {
    problems.push('RESEND_API_KEY missing');
  }
  if (provider === 'smtp') {
    if (!smtpHost) problems.push('smtpHost missing');
    if (!smtpPort) problems.push('smtpPort missing');
    if (!smtpUsername) problems.push('smtpUsername missing');
    if (!smtpPasswordPresent) problems.push('smtpPassword missing');
  }

  return {
    provider,
    fromEmail,
    fromName,
    replyTo,
    smtpHost,
    smtpPort,
    resendKeyPresent,
    ok: problems.length === 0,
    problems,
  };
}

async function sendViaResend(input: {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  stubLabel: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(input.stubLabel, input.to);
    return;
  }

  const config = getEffectiveMailConfig();
  const from = buildResendFromHeader(config.fromEmail);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.bodyHtml,
      text: input.bodyText,
      reply_to: config.replyTo ?? undefined,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed: ${detail}`);
  }
}

export async function sendInvoiceReminderEmail(payload: SendInvoiceReminderEmailInput) {
  await sendViaResend({
    to: payload.to,
    subject: payload.subject,
    bodyHtml: payload.bodyHtml,
    bodyText: payload.bodyText,
    stubLabel: '[reminder email stub]',
  });
}

export async function sendEmailVerification(options: {
  to: string;
  verifyUrl: string;
}) {
  const subject = 'Verify your email for Lateless';
  const bodyHtml = `
    <p>Hi, please verify your email for Lateless.</p>
    <p><a href="${options.verifyUrl}">Verify email</a></p>
  `;
  const bodyText = `Hi, please verify your email for Lateless.\n\nVerify email: ${options.verifyUrl}`;

  await sendViaResend({
    to: options.to,
    subject,
    bodyHtml,
    bodyText,
    stubLabel: '[verification email stub]',
  });
}

export async function sendTwoFactorCodeEmail(options: {
  to: string;
  code: string;
}) {
  const subject = 'Your Lateless login code';
  const bodyHtml = `
    <p>Use this 6-digit code to finish logging in to Lateless:</p>
    <p><strong style="font-size:24px;letter-spacing:0.08em;">${options.code}</strong></p>
  `;
  const bodyText = `Use this 6-digit code to finish logging in to Lateless:\n\n${options.code}`;

  await sendViaResend({
    to: options.to,
    subject,
    bodyHtml,
    bodyText,
    stubLabel: '[2fa email stub]',
  });
}

export async function sendPasswordResetEmail(options: {
  to: string;
  resetUrl: string;
}) {
  const subject = 'Reset your Lateless password';
  const bodyHtml = `
    <p>Click this link to reset your password:</p>
    <p><a href="${options.resetUrl}">${options.resetUrl}</a></p>
  `;
  const bodyText = `Click this link to reset your password:\n\n${options.resetUrl}`;

  await sendViaResend({
    to: options.to,
    subject,
    bodyHtml,
    bodyText,
    stubLabel: '[password reset email stub]',
  });
}

export async function sendWorkspaceInviteEmail(options: {
  to: string;
  invitedByEmail: string;
  workspaceName: string;
  inviteUrl: string;
  role: 'admin' | 'member';
}) {
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

  await sendViaResend({
    to: options.to,
    subject,
    bodyHtml,
    bodyText,
    stubLabel: '[team invite email stub]',
  });
}

export async function sendRefundRequestNotificationEmail(options: {
  to: string;
  invoiceLabel: string;
  reason: string;
  payerEmail: string | null;
  refundsUrl: string;
}) {
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

  await sendViaResend({
    to: options.to,
    subject,
    bodyHtml,
    bodyText,
    stubLabel: '[refund request email stub]',
  });
}

export async function sendBillingRecoveryEmail(options: {
  to: string;
  billingUrl: string;
}) {
  const subject = 'Action required: Fix payment to keep Lateless running';
  const bodyHtml = `
    <p>Your Lateless subscription has a payment issue and needs attention.</p>
    <p>Update your payment method or retry payment to avoid disruption.</p>
    <p><a href="${options.billingUrl}">Open billing settings</a></p>
  `;
  const bodyText = [
    'Your Lateless subscription has a payment issue and needs attention.',
    'Update your payment method or retry payment to avoid disruption.',
    '',
    `Open billing settings: ${options.billingUrl}`,
  ].join('\n');

  await sendViaResend({
    to: options.to,
    subject,
    bodyHtml,
    bodyText,
    stubLabel: '[billing recovery email stub]',
  });
}
