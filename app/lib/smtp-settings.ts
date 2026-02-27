import postgres from 'postgres';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  buildMailFromHeader,
  buildResendFromHeader,
  getEffectiveMailConfig,
  type MailFromUseCase,
} from '@/app/lib/email';
import {
  decryptString,
  encryptString,
  isEncryptionKeyConfigured,
} from '@/app/lib/crypto';

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
  smtp_password_enc: string | null;
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

let workspaceEmailSchemaReadyPromise: Promise<void> | null = null;

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
    smtpPasswordPresent: Boolean(row.smtp_password_enc || row.smtp_password),
    fromName: row.from_name ?? '',
    fromEmail: row.from_email ?? '',
    replyTo: row.reply_to ?? '',
  };
}

function ensureSmtpEncryptionKeyAvailableForWrite() {
  if (isEncryptionKeyConfigured()) {
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SMTP encryption is not configured in production. Set SMTP_ENCRYPTION_KEY_BASE64 to save SMTP settings.',
    );
  }

  throw new Error(
    'SMTP encryption key is missing. Set SMTP_ENCRYPTION_KEY_BASE64 to save SMTP settings.',
  );
}

async function persistEncryptedSmtpPassword(
  workspaceId: string,
  plaintextPassword: string,
): Promise<string> {
  const encrypted = encryptString(plaintextPassword);

  await sql`
    update public.workspace_email_settings
    set
      smtp_password_enc = ${encrypted},
      smtp_password = null,
      updated_at = now()
    where workspace_id = ${workspaceId}
  `;

  return encrypted;
}

async function getSmtpPasswordFromRow(
  workspaceId: string,
  row?: WorkspaceEmailSettingsRow,
): Promise<string | null> {
  if (!row) return null;

  if (row.smtp_password_enc) {
    try {
      return decryptString(row.smtp_password_enc);
    } catch (error) {
      console.error('SMTP password decryption failed:', error);
      throw new Error(
        'Failed to decrypt SMTP password. Check SMTP_ENCRYPTION_KEY_BASE64 and saved credentials.',
      );
    }
  }

  if (!row.smtp_password) {
    return null;
  }

  try {
    await persistEncryptedSmtpPassword(workspaceId, row.smtp_password);
  } catch (error) {
    console.error('SMTP legacy password migration failed:', error);
    throw error;
  }
  return row.smtp_password;
}

async function maybeMigrateLegacySmtpPassword(
  workspaceId: string,
  row?: WorkspaceEmailSettingsRow,
) {
  if (!row?.smtp_password || row.smtp_password_enc || !isEncryptionKeyConfigured()) {
    return;
  }

  try {
    await persistEncryptedSmtpPassword(workspaceId, row.smtp_password);
  } catch (error) {
    console.error('SMTP legacy password migration failed during settings load:', error);
  }
}

export async function assertWorkspaceEmailSettingsSchemaReady(): Promise<void> {
  if (!workspaceEmailSchemaReadyPromise) {
    workspaceEmailSchemaReadyPromise = (async () => {
      const [result] = await sql<{
        ws: string | null;
        smtp_password_enc_exists: boolean;
      }[]>`
        select
          to_regclass('public.workspace_email_settings') as ws,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'workspace_email_settings'
              and column_name = 'smtp_password_enc'
          ) as smtp_password_enc_exists
      `;

      if (!result?.ws || !result.smtp_password_enc_exists) {
        throw buildSmtpMigrationRequiredError();
      }
    })();
  }

  return workspaceEmailSchemaReadyPromise;
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
      smtp_password_enc,
      from_name,
      from_email,
      reply_to
    from public.workspace_email_settings
    where workspace_id = ${workspaceId}
    limit 1
  `;

  await maybeMigrateLegacySmtpPassword(workspaceId, row);

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
      smtp_password_enc,
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
        smtp_password_enc,
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
        smtp_password_enc = null,
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
  const smtpPassword =
    smtpPasswordInput ?? (await getSmtpPasswordFromRow(workspaceId, existing));

  if (!smtpPassword) {
    throw new Error('smtpPassword');
  }

  ensureSmtpEncryptionKeyAvailableForWrite();
  const encryptedSmtpPassword = encryptString(smtpPassword);

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
      smtp_password_enc,
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
      null,
      ${encryptedSmtpPassword},
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
      smtp_password = null,
      smtp_password_enc = excluded.smtp_password_enc,
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
  useCase: MailFromUseCase;
  workspaceSettings?: WorkspaceEmailSettingsRow | null;
}): Promise<{ messageId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log('[smtp test resend stub]', input.to);
    return { messageId: null };
  }

  const config = getEffectiveMailConfig({
    useCase: input.useCase,
    workspaceSettings: input.workspaceSettings
      ? {
          provider: input.workspaceSettings.provider,
          fromName: input.workspaceSettings.from_name,
          fromEmail: input.workspaceSettings.from_email,
          replyTo: input.workspaceSettings.reply_to,
          smtpHost: input.workspaceSettings.smtp_host,
          smtpPort: input.workspaceSettings.smtp_port,
          smtpUsername: input.workspaceSettings.smtp_username,
          smtpPasswordPresent: Boolean(
            input.workspaceSettings.smtp_password_enc || input.workspaceSettings.smtp_password,
          ),
        }
      : null,
  });
  const from = buildResendFromHeader(config.fromEmail, input.useCase);

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

  const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return { messageId: typeof body?.id === 'string' ? body.id : null };
}

function ensureResendConfigured() {
  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error(
      'Resend is not configured. Set RESEND_API_KEY in environment variables.',
    );
  }
}

async function sendWithSmtp(
  settings: WorkspaceEmailSettingsRow,
  smtpPassword: string,
  to: string,
  subject: string,
  bodyHtml: string,
  bodyText: string,
  useCase: MailFromUseCase,
) : Promise<{ messageId: string | null }> {
  const smtpHost = settings.smtp_host;
  const smtpPort = settings.smtp_port;
  const smtpUsername = settings.smtp_username;

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
  const config = getEffectiveMailConfig({
    useCase,
    workspaceSettings: {
      provider: settings.provider,
      fromName: settings.from_name,
      fromEmail: settings.from_email,
      replyTo: settings.reply_to,
      smtpHost: settings.smtp_host,
      smtpPort: settings.smtp_port,
      smtpUsername: settings.smtp_username,
      smtpPasswordPresent: Boolean(settings.smtp_password_enc || settings.smtp_password),
    },
  });
  const info = await transporter.sendMail({
    from: buildMailFromHeader(config.fromEmail, config.fromName, useCase),
    replyTo: config.replyTo ?? undefined,
    to,
    subject,
    html: bodyHtml,
    text: bodyText,
  });
  return { messageId: info.messageId ?? null };
}

export async function sendWorkspaceTestEmail(input: {
  workspaceId: string;
  toEmail: string;
}): Promise<{ provider: EmailProviderMode; messageId: string | null }> {
  const settings = await fetchWorkspaceEmailSettingsWithSecret(input.workspaceId);
  const envProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const forceResend = envProvider === 'resend';
  const forceSmtp = envProvider === 'smtp';
  const provider: EmailProviderMode =
    forceResend || (!forceSmtp && (!settings || settings.provider === 'resend'))
      ? 'resend'
      : 'smtp';

  const subject = 'Lateless SMTP test email';
  const bodyText =
    'This is a test email from your Lateless SMTP integration settings.';
  const bodyHtml =
    '<p>This is a test email from your <strong>Lateless SMTP integration</strong> settings.</p>';

  if (provider === 'resend') {
    ensureResendConfigured();
    const result = await sendWithResend({
      to: input.toEmail,
      subject,
      bodyHtml,
      bodyText,
      useCase: 'invoice',
      workspaceSettings: settings,
    });
    return { provider: 'resend', messageId: result.messageId };
  }

  if (
    !settings ||
    !settings.smtp_host ||
    !settings.smtp_port ||
    !settings.smtp_username
  ) {
    throw new Error('SMTP settings are incomplete. Save valid SMTP settings first.');
  }

  const smtpPassword = await getSmtpPasswordFromRow(input.workspaceId, settings);
  if (!smtpPassword) {
    throw new Error('SMTP settings are incomplete. Save valid SMTP settings first.');
  }

  const result = await sendWithSmtp(
    settings,
    smtpPassword,
    input.toEmail,
    subject,
    bodyHtml,
    bodyText,
    'invoice',
  );
  return { provider: 'smtp', messageId: result.messageId };
}

export async function sendWorkspaceEmail(input: {
  workspaceId: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  useCase?: MailFromUseCase;
}): Promise<{ provider: EmailProviderMode; messageId: string | null }> {
  const settings = await fetchWorkspaceEmailSettingsWithSecret(input.workspaceId);
  const envProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  const forceResend = envProvider === 'resend';
  const forceSmtp = envProvider === 'smtp';
  const provider: EmailProviderMode =
    forceResend || (!forceSmtp && (!settings || settings.provider === 'resend'))
      ? 'resend'
      : 'smtp';

  if (provider === 'resend') {
    ensureResendConfigured();
    const result = await sendWithResend({
      to: input.toEmail,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      useCase: input.useCase ?? 'invoice',
      workspaceSettings: settings,
    });
    return { provider: 'resend', messageId: result.messageId };
  }

  if (!settings || !settings.smtp_host || !settings.smtp_port || !settings.smtp_username) {
    throw new Error('SMTP settings are incomplete. Save valid SMTP settings first.');
  }

  const smtpPassword = await getSmtpPasswordFromRow(input.workspaceId, settings);
  if (!smtpPassword) {
    throw new Error('SMTP settings are incomplete. Save valid SMTP settings first.');
  }

  const result = await sendWithSmtp(
    settings,
    smtpPassword,
    input.toEmail,
    input.subject,
    input.bodyHtml,
    input.bodyText,
    input.useCase ?? 'invoice',
  );
  return { provider: 'smtp', messageId: result.messageId };
}
