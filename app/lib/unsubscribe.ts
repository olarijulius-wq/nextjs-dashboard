import crypto from 'crypto';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const UNSUBSCRIBE_MIGRATION_REQUIRED_CODE =
  'UNSUBSCRIBE_MIGRATION_REQUIRED';

export type WorkspaceUnsubscribeSettings = {
  enabled: boolean;
  pageText: string;
};

export type UnsubscribedRecipient = {
  email: string;
  unsubscribedAt: string;
  source: string;
};

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildUnsubscribeMigrationRequiredError() {
  const error = new Error(UNSUBSCRIBE_MIGRATION_REQUIRED_CODE) as Error & {
    code: string;
  };
  error.code = UNSUBSCRIBE_MIGRATION_REQUIRED_CODE;
  return error;
}

export function isUnsubscribeMigrationRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === UNSUBSCRIBE_MIGRATION_REQUIRED_CODE ||
      error.message === UNSUBSCRIBE_MIGRATION_REQUIRED_CODE)
  );
}

export async function assertUnsubscribeSchemaReady(): Promise<void> {
  const [result] = await sql<{
    settings: string | null;
    unsubscribes: string | null;
    tokens: string | null;
  }[]>`
    select
      to_regclass('public.workspace_unsubscribe_settings') as settings,
      to_regclass('public.workspace_unsubscribes') as unsubscribes,
      to_regclass('public.workspace_unsubscribe_tokens') as tokens
  `;

  if (!result?.settings || !result?.unsubscribes || !result?.tokens) {
    throw buildUnsubscribeMigrationRequiredError();
  }
}

export async function fetchUnsubscribeSettings(
  workspaceId: string,
): Promise<WorkspaceUnsubscribeSettings> {
  await assertUnsubscribeSchemaReady();

  const [row] = await sql<{ enabled: boolean; page_text: string | null }[]>`
    select enabled, page_text
    from public.workspace_unsubscribe_settings
    where workspace_id = ${workspaceId}
    limit 1
  `;

  if (!row) {
    return { enabled: true, pageText: '' };
  }

  return {
    enabled: row.enabled,
    pageText: row.page_text ?? '',
  };
}

export async function upsertUnsubscribeSettings(
  workspaceId: string,
  input: { enabled: boolean; pageText?: string | null },
): Promise<WorkspaceUnsubscribeSettings> {
  await assertUnsubscribeSchemaReady();

  const pageText = typeof input.pageText === 'string' ? input.pageText.trim() : '';

  await sql`
    insert into public.workspace_unsubscribe_settings (
      workspace_id,
      enabled,
      page_text,
      updated_at
    )
    values (
      ${workspaceId},
      ${input.enabled},
      ${pageText || null},
      now()
    )
    on conflict (workspace_id)
    do update set
      enabled = excluded.enabled,
      page_text = excluded.page_text,
      updated_at = now()
  `;

  return fetchUnsubscribeSettings(workspaceId);
}

export async function issueUnsubscribeToken(
  workspaceId: string,
  recipientEmail: string,
) {
  await assertUnsubscribeSchemaReady();

  const normalized = normalizeEmail(recipientEmail);
  const token = crypto.randomBytes(32).toString('hex');

  await sql`
    insert into public.workspace_unsubscribe_tokens (
      workspace_id,
      email,
      normalized_email,
      token,
      expires_at
    )
    values (
      ${workspaceId},
      ${normalized},
      ${normalized},
      ${token},
      now() + interval '90 days'
    )
  `;

  return `/unsubscribe/${token}`;
}

export async function consumeUnsubscribeToken(token: string) {
  await assertUnsubscribeSchemaReady();

  const tokenValue = token.trim();
  if (!tokenValue) {
    return { ok: false as const };
  }

  return sql.begin(async (tx) => {
    const [consumed] = await tx<{
      workspace_id: string;
      workspace_name: string;
      email: string;
      normalized_email: string;
      page_text: string | null;
    }[]>`
      with used as (
        update public.workspace_unsubscribe_tokens
        set used_at = now()
        where token = ${tokenValue}
          and used_at is null
          and expires_at > now()
        returning workspace_id, email, normalized_email
      )
      select
        used.workspace_id,
        w.name as workspace_name,
        used.email,
        used.normalized_email,
        s.page_text
      from used
      join public.workspaces w on w.id = used.workspace_id
      left join public.workspace_unsubscribe_settings s
        on s.workspace_id = used.workspace_id
      limit 1
    `;

    if (!consumed) {
      return { ok: false as const };
    }

    await tx`
      insert into public.workspace_unsubscribes (
        workspace_id,
        email,
        normalized_email,
        unsubscribed_at,
        source
      )
      values (
        ${consumed.workspace_id},
        ${consumed.email},
        ${consumed.normalized_email},
        now(),
        'public_link'
      )
      on conflict (workspace_id, normalized_email)
      do update set
        email = excluded.email,
        unsubscribed_at = now(),
        source = excluded.source
    `;

    return {
      ok: true as const,
      workspaceName: consumed.workspace_name,
      pageText: consumed.page_text ?? '',
    };
  });
}

export async function fetchUnsubscribedRecipients(
  workspaceId: string,
): Promise<UnsubscribedRecipient[]> {
  await assertUnsubscribeSchemaReady();

  const rows = await sql<{
    email: string;
    unsubscribed_at: Date;
    source: string | null;
  }[]>`
    select email, unsubscribed_at, source
    from public.workspace_unsubscribes
    where workspace_id = ${workspaceId}
    order by unsubscribed_at desc
  `;

  return rows.map((row) => ({
    email: row.email,
    unsubscribedAt: row.unsubscribed_at.toISOString(),
    source: row.source ?? '',
  }));
}

export async function resubscribeRecipient(workspaceId: string, email: string) {
  await assertUnsubscribeSchemaReady();
  const normalized = normalizeEmail(email);

  const result = await sql`
    delete from public.workspace_unsubscribes
    where workspace_id = ${workspaceId}
      and normalized_email = ${normalized}
    returning workspace_id
  `;

  return result.length > 0;
}

export async function isRecipientUnsubscribed(
  workspaceId: string,
  recipientEmail: string,
): Promise<boolean> {
  await assertUnsubscribeSchemaReady();
  const normalized = normalizeEmail(recipientEmail);

  const [row] = await sql<{ exists: boolean }[]>`
    select exists (
      select 1
      from public.workspace_unsubscribes
      where workspace_id = ${workspaceId}
        and normalized_email = ${normalized}
    ) as exists
  `;

  return Boolean(row?.exists);
}
