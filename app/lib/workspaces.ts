import crypto from 'crypto';
import postgres from 'postgres';
import { auth } from '@/auth';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
export const TEAM_MIGRATION_REQUIRED_CODE = 'TEAM_MIGRATION_REQUIRED';

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type InvitableWorkspaceRole = 'admin' | 'member';

export type WorkspaceMember = {
  userId: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  createdAt: string;
};

export type WorkspaceInvite = {
  id: string;
  email: string;
  role: InvitableWorkspaceRole;
  token: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
};

export type WorkspaceContext = {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  userEmail: string;
  userRole: WorkspaceRole;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildWorkspaceName(name: string | null, email: string) {
  const label = name?.trim() || email.split('@')[0] || 'Workspace';
  return `${label} workspace`;
}

function buildTeamMigrationRequiredError() {
  const error = new Error(TEAM_MIGRATION_REQUIRED_CODE) as Error & {
    code: string;
  };
  error.code = TEAM_MIGRATION_REQUIRED_CODE;
  return error;
}

export function isTeamMigrationRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === TEAM_MIGRATION_REQUIRED_CODE ||
      error.message === TEAM_MIGRATION_REQUIRED_CODE)
  );
}

let workspaceSchemaReadyPromise: Promise<void> | null = null;

export async function assertWorkspaceSchemaReady(): Promise<void> {
  if (!workspaceSchemaReadyPromise) {
    workspaceSchemaReadyPromise = (async () => {
      const [result] = await sql<{
        ws: string | null;
        wm: string | null;
        wi: string | null;
      }[]>`
        select
          to_regclass('public.workspaces') as ws,
          to_regclass('public.workspace_members') as wm,
          to_regclass('public.workspace_invites') as wi
      `;

      if (!result?.ws || !result?.wm || !result?.wi) {
        throw buildTeamMigrationRequiredError();
      }
    })();
  }

  return workspaceSchemaReadyPromise;
}

export async function requireCurrentUser() {
  const session = await auth();
  const sessionEmail = session?.user?.email;
  if (!sessionEmail) {
    throw new Error('Unauthorized');
  }

  const email = normalizeEmail(sessionEmail);
  const [user] = await sql<{ id: string; name: string | null; email: string }[]>`
    select id, name, email
    from public.users
    where lower(email) = ${email}
    limit 1
  `;

  if (!user) {
    throw new Error('Unauthorized');
  }

  return {
    id: user.id,
    email: normalizeEmail(user.email),
    name: user.name,
  };
}

async function ensureOwnedWorkspace(user: {
  id: string;
  email: string;
  name: string | null;
}) {
  const [owned] = await sql<{ id: string; name: string }[]>`
    select id, name
    from public.workspaces
    where owner_user_id = ${user.id}
    order by created_at asc
    limit 1
  `;

  if (owned) {
    await sql`
      insert into public.workspace_members (workspace_id, user_id, role)
      values (${owned.id}, ${user.id}, 'owner')
      on conflict (workspace_id, user_id)
      do update set role = 'owner'
    `;

    return owned;
  }

  const [created] = await sql<{ id: string; name: string }[]>`
    insert into public.workspaces (name, owner_user_id)
    values (${buildWorkspaceName(user.name, user.email)}, ${user.id})
    returning id, name
  `;

  await sql`
    insert into public.workspace_members (workspace_id, user_id, role)
    values (${created.id}, ${user.id}, 'owner')
    on conflict (workspace_id, user_id)
    do update set role = 'owner'
  `;

  return created;
}

export async function ensureWorkspaceContextForCurrentUser(): Promise<WorkspaceContext> {
  await assertWorkspaceSchemaReady();
  const user = await requireCurrentUser();

  const [membership] = await sql<{
    workspace_id: string;
    workspace_name: string;
    role: WorkspaceRole;
    owner_user_id: string;
  }[]>`
    select
      w.id as workspace_id,
      w.name as workspace_name,
      wm.role,
      w.owner_user_id
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = ${user.id}
    order by case when w.owner_user_id = ${user.id} then 0 else 1 end, w.created_at asc
    limit 1
  `;

  if (!membership) {
    const owned = await ensureOwnedWorkspace(user);
    return {
      workspaceId: owned.id,
      workspaceName: owned.name,
      userId: user.id,
      userEmail: user.email,
      userRole: 'owner',
    };
  }

  if (membership.owner_user_id === user.id && membership.role !== 'owner') {
    await sql`
      update public.workspace_members
      set role = 'owner'
      where workspace_id = ${membership.workspace_id}
        and user_id = ${user.id}
    `;
  }

  return {
    workspaceId: membership.workspace_id,
    workspaceName: membership.workspace_name,
    userId: user.id,
    userEmail: user.email,
    userRole:
      membership.owner_user_id === user.id
        ? 'owner'
        : membership.role,
  };
}

export async function fetchWorkspaceMembers(
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  await assertWorkspaceSchemaReady();
  const rows = await sql<{
    user_id: string;
    email: string;
    name: string | null;
    role: WorkspaceRole;
    created_at: Date;
  }[]>`
    select
      u.id as user_id,
      u.email,
      u.name,
      wm.role,
      wm.created_at
    from public.workspace_members wm
    join public.users u on u.id = wm.user_id
    where wm.workspace_id = ${workspaceId}
    order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, lower(u.email)
  `;

  return rows.map((row) => ({
    userId: row.user_id,
    email: normalizeEmail(row.email),
    name: row.name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function fetchPendingWorkspaceInvites(
  workspaceId: string,
): Promise<WorkspaceInvite[]> {
  await assertWorkspaceSchemaReady();
  const rows = await sql<{
    id: string;
    email: string;
    role: InvitableWorkspaceRole;
    token: string;
    expires_at: Date;
    created_at: Date;
    accepted_at: Date | null;
  }[]>`
    select id, email, role, token, expires_at, created_at, accepted_at
    from public.workspace_invites
    where workspace_id = ${workspaceId}
      and accepted_at is null
      and expires_at > now()
    order by created_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    email: normalizeEmail(row.email),
    role: row.role,
    token: row.token,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    acceptedAt: row.accepted_at ? row.accepted_at.toISOString() : null,
  }));
}

export async function createWorkspaceInvite(input: {
  workspaceId: string;
  invitedByUserId: string;
  email: string;
  role: InvitableWorkspaceRole;
  expiresInDays?: number;
}): Promise<WorkspaceInvite> {
  await assertWorkspaceSchemaReady();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresInDays = Math.max(1, input.expiresInDays ?? 7);
  const normalizedEmail = normalizeEmail(input.email);

  const [invite] = await sql<{
    id: string;
    email: string;
    role: InvitableWorkspaceRole;
    token: string;
    expires_at: Date;
    created_at: Date;
    accepted_at: Date | null;
  }[]>`
    insert into public.workspace_invites (
      workspace_id,
      email,
      role,
      token,
      invited_by_user_id,
      expires_at
    )
    values (
      ${input.workspaceId},
      ${normalizedEmail},
      ${input.role},
      ${token},
      ${input.invitedByUserId},
      now() + make_interval(days => ${expiresInDays})
    )
    returning id, email, role, token, expires_at, created_at, accepted_at
  `;

  return {
    id: invite.id,
    email: normalizeEmail(invite.email),
    role: invite.role,
    token: invite.token,
    expiresAt: invite.expires_at.toISOString(),
    createdAt: invite.created_at.toISOString(),
    acceptedAt: invite.accepted_at ? invite.accepted_at.toISOString() : null,
  };
}

export async function removeWorkspaceMember(input: {
  workspaceId: string;
  targetUserId: string;
}) {
  await assertWorkspaceSchemaReady();
  const result = await sql`
    delete from public.workspace_members
    where workspace_id = ${input.workspaceId}
      and user_id = ${input.targetUserId}
      and role <> 'owner'
    returning workspace_id
  `;

  return result.length > 0;
}

export async function fetchInviteByToken(token: string) {
  await assertWorkspaceSchemaReady();
  const [invite] = await sql<{
    id: string;
    workspace_id: string;
    workspace_name: string;
    email: string;
    role: InvitableWorkspaceRole;
    expires_at: Date;
    accepted_at: Date | null;
    is_expired: boolean;
  }[]>`
    select
      wi.id,
      wi.workspace_id,
      w.name as workspace_name,
      wi.email,
      wi.role,
      wi.expires_at,
      wi.accepted_at,
      wi.expires_at <= now() as is_expired
    from public.workspace_invites wi
    join public.workspaces w on w.id = wi.workspace_id
    where wi.token = ${token}
    limit 1
  `;

  if (!invite) {
    return null;
  }

  return {
    id: invite.id,
    workspaceId: invite.workspace_id,
    workspaceName: invite.workspace_name,
    email: normalizeEmail(invite.email),
    role: invite.role,
    expiresAt: invite.expires_at.toISOString(),
    acceptedAt: invite.accepted_at ? invite.accepted_at.toISOString() : null,
    isExpired: invite.is_expired,
  };
}

export async function acceptInviteForCurrentUser(token: string) {
  await assertWorkspaceSchemaReady();
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return {
      ok: false as const,
      code: 'INVALID_TOKEN' as const,
      message: 'Invite link is invalid.',
    };
  }

  const user = await requireCurrentUser();

  const [invite] = await sql<{
    id: string;
    workspace_id: string;
    workspace_name: string;
    email: string;
    role: InvitableWorkspaceRole;
    expires_at: Date;
    accepted_at: Date | null;
  }[]>`
    select
      wi.id,
      wi.workspace_id,
      w.name as workspace_name,
      wi.email,
      wi.role,
      wi.expires_at,
      wi.accepted_at
    from public.workspace_invites wi
    join public.workspaces w on w.id = wi.workspace_id
    where wi.token = ${trimmedToken}
    limit 1
  `;

  if (!invite) {
    return {
      ok: false as const,
      code: 'INVALID_TOKEN' as const,
      message: 'Invite link is invalid.',
    };
  }

  if (invite.accepted_at) {
    return {
      ok: false as const,
      code: 'ALREADY_ACCEPTED' as const,
      message: 'This invite has already been accepted.',
    };
  }

  if (invite.expires_at.getTime() <= Date.now()) {
    return {
      ok: false as const,
      code: 'EXPIRED' as const,
      message: 'This invite has expired.',
    };
  }

  if (normalizeEmail(invite.email) !== user.email) {
    return {
      ok: false as const,
      code: 'EMAIL_MISMATCH' as const,
      message: 'This invite is for a different email address.',
    };
  }

  await sql`
    insert into public.workspace_members (workspace_id, user_id, role)
    values (${invite.workspace_id}, ${user.id}, ${invite.role})
    on conflict (workspace_id, user_id)
    do update set role = excluded.role
  `;

  await sql`
    update public.workspace_invites
    set accepted_at = now()
    where id = ${invite.id}
      and accepted_at is null
  `;

  return {
    ok: true as const,
    workspaceId: invite.workspace_id,
    workspaceName: invite.workspace_name,
    role: invite.role,
  };
}
