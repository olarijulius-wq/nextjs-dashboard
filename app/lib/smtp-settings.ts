import postgres from 'postgres';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const SMTP_MIGRATION_REQUIRED_CODE = 'SMTP_MIGRATION_REQUIRED';

export type EmailProviderMode = 'resend' | 'smtp';

export type WorkspaceEmailSettings = {
  provider: EmailProviderMode;
  smtpHost: string;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPasswordPresent: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
};

type WorkspaceEmailSettingsRow = {
  provider: EmailProviderMode;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_username: string | null;
  smtp_password: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
};

function buildSmtpMigrationRequiredError() {
  const error = new Error(SMTP_MIGRATION_REQUIRED_CODE) as Error & {
    code: string;
  };
  error.code = SMTP_MIGRATION_REQUIRED_CODE;
  return error;
}

export function isSmtpMigrationRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === SMTP_MIGRATION_REQUIRED_CODE ||
      error.message === SMTP_MIGRATION_REQUIRED_CODE)
  );
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requiredText(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(fieldName);
  }
  return value.trim();
}

function toPublicSettings(row?: WorkspaceEmailSettingsRow): WorkspaceEmailSettings {
  if (!row) {
    return {
      provider: 'resend',
      smtpHost: '',
      smtpPort: null,
      smtpSecure: false,
      smtpUsername: '',
      smtpPasswordPresent: false,
      fromName: '',
      fromEmail: '',
      replyTo: '',
    };
  }

  return {
    provider: row.provider,
    smtpHost: row.smtp_host ?? '',
    smtpPort: row.smtp_port,
    smtpSecure: Boolean(row.smtp_secure),
    smtpUsername: row.smtp_username ?? '',
    smtpPasswordPresent: Boolean(row.smtp_password),
    fromName: row.from_name ?? '',
    fromEmail: row.from_email ?? '',
    replyTo: row.reply_to ?? '',
  };
}

export async function assertWorkspaceEmailSettingsSchemaReady(): Promise<void> {
  const [result] = await sql<{ ws: string | null }[]>`
    select to_regclass('public.workspace_email_settings') as ws
  `;

  if (!result?.ws) {
    throw buildSmtpMigrationRequiredError();
  }
}

export async function fetchWorkspaceEmailSettings(
  workspaceId: string,
): Promise<WorkspaceEmailSettings> {
  await assertWorkspaceEmailSettingsSchemaReady();

  const [row] = await sql<WorkspaceEmailSettingsRow[]>`
    select
      provider,
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_username,
      smtp_password,
      from_name,
      from_email,
      reply_to
    from public.workspace_email_settings
    where workspace_id = ${workspaceId}
    limit 1
  `;

  return toPublicSettings(row);
}

async function fetchWorkspaceEmailSettingsWithSecret(workspaceId: string) {
  await assertWorkspaceEmailSettingsSchemaReady();

  const [row] = await sql<WorkspaceEmailSettingsRow[]>`
    select
      provider,
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_username,
      smtp_password,
      from_name,
      from_email,
      reply_to
    from public.workspace_email_settings
    where workspace_id = ${workspaceId}
    limit 1
  `;

  return row;
}

function ensureValidEmail(value: string, fieldName: string) {
  if (!/^\S+@\S+\.\S+$/.test(value)) {
    throw new Error(fieldName);
  }
  return normalizeEmail(value);
}

export async function upsertWorkspaceEmailSettings(
  workspaceId: string,
  payload: unknown,
): Promise<WorkspaceEmailSettings> {
  await assertWorkspaceEmailSettingsSchemaReady();

  const providerRaw = (payload as { provider?: unknown })?.provider;
  if (providerRaw !== 'resend' && providerRaw !== 'smtp') {
    throw new Error('provider');
  }

  if (providerRaw === 'resend') {
    await sql`
      insert into public.workspace_email_settings (
        workspace_id,
        provider,
        smtp_host,
        smtp_port,
        smtp_secure,
        smtp_username,
        smtp_password,
        from_name,
        from_email,
        reply_to,
        updated_at
      )
      values (
        ${workspaceId},
        'resend',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        now()
      )
      on conflict (workspace_id)
      do update set
        provider = 'resend',
        smtp_host = null,
        smtp_port = null,
        smtp_secure = null,
        smtp_username = null,
        smtp_password = null,
        from_name = null,
        from_email = null,
        reply_to = null,
        updated_at = now()
    `;

    return fetchWorkspaceEmailSettings(workspaceId);
  }

  const smtpHost = requiredText((payload as { smtpHost?: unknown }).smtpHost, 'smtpHost');
  const smtpPortValue = (payload as { smtpPort?: unknown }).smtpPort;
  const smtpPortNumber = Number(smtpPortValue);
  if (
    !Number.isInteger(smtpPortNumber) ||
    smtpPortNumber < 1 ||
    smtpPortNumber > 65535
  ) {
    throw new Error('smtpPort');
  }

  const smtpSecure = Boolean((payload as { smtpSecure?: unknown }).smtpSecure);
  const smtpUsername = requiredText(
    (payload as { smtpUsername?: unknown }).smtpUsername,
    'smtpUsername',
  );

  const existing = await fetchWorkspaceEmailSettingsWithSecret(workspaceId);
  const smtpPasswordInput = optionalText(
    (payload as { smtpPassword?: unknown }).smtpPassword,
  );
  const smtpPassword = smtpPasswordInput ?? existing?.smtp_password ?? null;

  if (!smtpPassword) {
    throw new Error('smtpPassword');
  }

  const fromEmail = ensureValidEmail(
    requiredText((payload as { fromEmail?: unknown }).fromEmail, 'fromEmail'),
    'fromEmail',
  );

  const fromName = optionalText((payload as { fromName?: unknown }).fromName);
  const replyToRaw = optionalText((payload as { replyTo?: unknown }).replyTo);
  const replyTo = replyToRaw ? ensureValidEmail(replyToRaw, 'replyTo') : null;

  await sql`
    insert into public.workspace_email_settings (
      workspace_id,
      provider,
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_username,
      smtp_password,
      from_name,
      from_email,
      reply_to,
      updated_at
    )
    values (
      ${workspaceId},
      'smtp',
      ${smtpHost},
      ${smtpPortNumber},
      ${smtpSecure},
      ${smtpUsername},
      ${smtpPassword},
      ${fromName},
      ${fromEmail},
      ${replyTo},
      now()
    )
    on conflict (workspace_id)
    do update set
      provider = 'smtp',
      smtp_host = excluded.smtp_host,
      smtp_port = excluded.smtp_port,
      smtp_secure = excluded.smtp_secure,
      smtp_username = excluded.smtp_username,
      smtp_password = excluded.smtp_password,
      from_name = excluded.from_name,
      from_email = excluded.from_email,
      reply_to = excluded.reply_to,
      updated_at = now()
  `;

  return fetchWorkspaceEmailSettings(workspaceId);
}

async function sendWithResend(input: {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[smtp test resend stub]', input.to);
    return;
  }

  const from =
    process.env.REMINDER_FROM_EMAIL ?? 'Lateless <noreply@lateless.app>';

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
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend failed: ${detail}`);
  }
}

async function sendWithSmtp(
  settings: WorkspaceEmailSettingsRow,
  to: string,
  subject: string,
  bodyHtml: string,
  bodyText: string,
) {
  const smtpHost = settings.smtp_host;
  const smtpPort = settings.smtp_port;
  const smtpUsername = settings.smtp_username;
  const smtpPassword = settings.smtp_password;

  if (!smtpHost || !smtpPort || !smtpUsername || !smtpPassword) {
    throw new Error('SMTP settings are incomplete. Save valid SMTP settings first.');
  }

  const transportOptions: SMTPTransport.Options = {
    host: smtpHost,
    port: smtpPort,
    secure: Boolean(settings.smtp_secure),
    auth: {
      user: smtpUsername,
      pass: smtpPassword,
    },
  };
  const transporter = nodemailer.createTransport(transportOptions);
  const fallbackEmail = (
    settings.from_email ??
    settings.smtp_username ??
    to
  ).trim();
  const fromHeader = settings.from_name?.trim()
    ? `${settings.from_name.trim()} <${fallbackEmail}>`
    : fallbackEmail;

  await transporter.sendMail({
    from: fromHeader,
    to,
    replyTo: settings.reply_to ?? undefined,
    subject,
    html: bodyHtml,
    text: bodyText,
  });
}

export async function sendWorkspaceTestEmail(input: {
  workspaceId: string;
  toEmail: string;
}) {
  const settings = await fetchWorkspaceEmailSettingsWithSecret(input.workspaceId);

  const subject = 'Lateless SMTP test email';
  const bodyText =
    'This is a test email from your Lateless SMTP integration settings.';
  const bodyHtml =
    '<p>This is a test email from your <strong>Lateless SMTP integration</strong> settings.</p>';

  if (!settings || settings.provider === 'resend') {
    await sendWithResend({
      to: input.toEmail,
      subject,
      bodyHtml,
      bodyText,
    });
    return;
  }

  if (
    !settings.smtp_host ||
    !settings.smtp_port ||
    !settings.smtp_username ||
    !settings.smtp_password
  ) {
    throw new Error('SMTP settings are incomplete. Save valid SMTP settings first.');
  }

  await sendWithSmtp(settings, input.toEmail, subject, bodyHtml, bodyText);
}
