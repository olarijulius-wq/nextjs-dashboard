import crypto from 'crypto';
import { auth } from '@/auth';
import {
  COMPANY_LIMIT_BY_PLAN,
  normalizePlan,
  TEAM_SEAT_LIMIT_BY_PLAN,
} from '@/app/lib/config';
import { readCanonicalWorkspacePlanSource } from '@/app/lib/billing-sync';
import { sql } from '@/app/lib/db';
export const TEAM_MIGRATION_REQUIRED_CODE = 'TEAM_MIGRATION_REQUIRED';

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type InvitableWorkspaceRole = 'admin' | 'member';
export type WorkspaceInviteStatus =
  | 'pending'
  | 'accepted'
  | 'expired'
  | 'canceled';

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
  status: WorkspaceInviteStatus;
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

export type WorkspaceMembershipSummary = {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
};

const COMPANY_NAME_MAX_LENGTH = 80;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildWorkspaceName(name: string | null, email: string) {
  const label = name?.trim() || email.split('@')[0] || 'Company';
  return normalizeCompanyName(`${label} company`);
}

export function normalizeCompanyName(input: string) {
  return input.replace(/\s+/g, ' ').trim();
}

export function validateCompanyName(rawName: string) {
  const name = normalizeCompanyName(rawName);
  if (name.length < 1 || name.length > COMPANY_NAME_MAX_LENGTH) {
    throw new Error('invalid_company_name');
  }
  return name;
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
        has_active_workspace_id: boolean;
        has_workspace_invites_status: boolean;
      }[]>`
        select
          to_regclass('public.workspaces') as ws,
          to_regclass('public.workspace_members') as wm,
          to_regclass('public.workspace_invites') as wi,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'users'
              and column_name = 'active_workspace_id'
          ) as has_active_workspace_id,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'workspace_invites'
              and column_name = 'status'
          ) as has_workspace_invites_status
      `;

      if (
        !result?.ws ||
        !result?.wm ||
        !result?.wi ||
        !result?.has_active_workspace_id ||
        !result?.has_workspace_invites_status
      ) {
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

  const [userRow] = await sql<{ active_workspace_id: string | null }[]>`
    select active_workspace_id
    from public.users
    where id = ${user.id}
    limit 1
  `;

  const memberships = await sql<{
    workspace_id: string;
    workspace_name: string;
    role: WorkspaceRole;
    owner_user_id: string;
    created_at: Date;
  }[]>`
    select
      w.id as workspace_id,
      w.name as workspace_name,
      wm.role,
      w.owner_user_id,
      w.created_at
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = ${user.id}
    order by
      case when w.owner_user_id = ${user.id} then 0 else 1 end asc,
      w.created_at asc
  `;

  let resolvedMembership = memberships.find(
    (membership) => membership.workspace_id === userRow?.active_workspace_id,
  );

  if (!resolvedMembership && memberships.length > 0) {
    resolvedMembership = memberships[0];
    await sql`
      update public.users
      set active_workspace_id = ${resolvedMembership.workspace_id}
      where id = ${user.id}
    `;
  }

  if (!resolvedMembership) {
    const owned = await ensureOwnedWorkspace(user);
    await sql`
      update public.users
      set active_workspace_id = ${owned.id}
      where id = ${user.id}
    `;
    return {
      workspaceId: owned.id,
      workspaceName: owned.name,
      userId: user.id,
      userEmail: user.email,
      userRole: 'owner',
    };
  }

  if (
    resolvedMembership.owner_user_id === user.id &&
    resolvedMembership.role !== 'owner'
  ) {
    await sql`
      update public.workspace_members
      set role = 'owner'
      where workspace_id = ${resolvedMembership.workspace_id}
        and user_id = ${user.id}
    `;
  }

  return {
    workspaceId: resolvedMembership.workspace_id,
    workspaceName: resolvedMembership.workspace_name,
    userId: user.id,
    userEmail: user.email,
    userRole:
      resolvedMembership.owner_user_id === user.id
        ? 'owner'
        : resolvedMembership.role,
  };
}

export async function fetchWorkspaceMembershipsForCurrentUser(): Promise<
  WorkspaceMembershipSummary[]
> {
  await assertWorkspaceSchemaReady();
  const user = await requireCurrentUser();

  const rows = await sql<{
    workspace_id: string;
    workspace_name: string;
    role: WorkspaceRole;
    owner_user_id: string;
    created_at: Date;
  }[]>`
    select
      w.id as workspace_id,
      w.name as workspace_name,
      wm.role,
      w.owner_user_id,
      w.created_at
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = ${user.id}
    order by w.created_at asc
  `;

  return rows.map((row) => ({
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    role: row.owner_user_id === user.id ? 'owner' : row.role,
  }));
}

export async function countWorkspacesForUser(userId: string): Promise<number> {
  await assertWorkspaceSchemaReady();
  const [row] = await sql<{ count: string }[]>`
    select count(*)::text as count
    from public.workspace_members
    where user_id = ${userId}
  `;
  return Number.parseInt(row?.count ?? '0', 10) || 0;
}

export async function createWorkspaceForUser(input: {
  userId: string;
  name: string;
}) {
  await assertWorkspaceSchemaReady();
  const normalizedName = validateCompanyName(input.name);

  const [created] = await sql<{ id: string; name: string }[]>`
    insert into public.workspaces (name, owner_user_id)
    values (${normalizedName}, ${input.userId})
    returning id, name
  `;

  await sql`
    insert into public.workspace_members (workspace_id, user_id, role)
    values (${created.id}, ${input.userId}, 'owner')
    on conflict (workspace_id, user_id)
    do update set role = 'owner'
  `;

  await sql`
    update public.users
    set active_workspace_id = ${created.id}
    where id = ${input.userId}
  `;

  return created;
}

export async function renameWorkspaceForUser(input: {
  workspaceId: string;
  userId: string;
  name: string;
}) {
  await assertWorkspaceSchemaReady();
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new Error('workspaceId');
  }

  const normalizedName = validateCompanyName(input.name);

  const [membership] = await sql<{ role: WorkspaceRole }[]>`
    select wm.role
    from public.workspace_members wm
    where wm.workspace_id = ${workspaceId}
      and wm.user_id = ${input.userId}
    limit 1
  `;

  if (!membership) {
    throw new Error('forbidden');
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    throw new Error('forbidden');
  }

  const [updated] = await sql<{ id: string; name: string }[]>`
    update public.workspaces
    set name = ${normalizedName}
    where id = ${workspaceId}
    returning id, name
  `;

  if (!updated) {
    throw new Error('forbidden');
  }

  return updated;
}

export async function setActiveWorkspaceForCurrentUser(workspaceId: string) {
  await assertWorkspaceSchemaReady();
  const user = await requireCurrentUser();
  const targetWorkspaceId = workspaceId.trim();

  if (!targetWorkspaceId) {
    throw new Error('workspaceId');
  }

  const [membership] = await sql<{ workspace_id: string }[]>`
    select workspace_id
    from public.workspace_members
    where workspace_id = ${targetWorkspaceId}
      and user_id = ${user.id}
    limit 1
  `;

  if (!membership) {
    throw new Error('forbidden');
  }

  await sql`
    update public.users
    set active_workspace_id = ${targetWorkspaceId}
    where id = ${user.id}
  `;
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
  await sql`
    update public.workspace_invites
    set status = 'expired'
    where workspace_id = ${workspaceId}
      and status = 'pending'
      and accepted_at is null
      and expires_at <= now()
  `;

  const rows = await sql<{
    id: string;
    email: string;
    role: InvitableWorkspaceRole;
    status: WorkspaceInviteStatus;
    token: string;
    expires_at: Date;
    created_at: Date;
    accepted_at: Date | null;
  }[]>`
    select id, email, role, status, token, expires_at, created_at, accepted_at
    from public.workspace_invites
    where workspace_id = ${workspaceId}
      and status = 'pending'
      and accepted_at is null
      and expires_at > now()
    order by created_at desc
  `;

  return rows.map((row) => ({
    id: row.id,
    email: normalizeEmail(row.email),
    role: row.role,
    status: row.status,
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
    status: WorkspaceInviteStatus;
    token: string;
    expires_at: Date;
    created_at: Date;
    accepted_at: Date | null;
  }[]>`
    insert into public.workspace_invites (
      workspace_id,
      email,
      role,
      status,
      token,
      invited_by_user_id,
      expires_at
    )
    values (
      ${input.workspaceId},
      ${normalizedEmail},
      ${input.role},
      'pending',
      ${token},
      ${input.invitedByUserId},
      now() + make_interval(days => ${expiresInDays})
    )
    returning id, email, role, status, token, expires_at, created_at, accepted_at
  `;

  return {
    id: invite.id,
    email: normalizeEmail(invite.email),
    role: invite.role,
    status: invite.status,
    token: invite.token,
    expiresAt: invite.expires_at.toISOString(),
    createdAt: invite.created_at.toISOString(),
    acceptedAt: invite.accepted_at ? invite.accepted_at.toISOString() : null,
  };
}

export async function cancelWorkspaceInvite(input: {
  workspaceId: string;
  inviteId: string;
}) {
  await assertWorkspaceSchemaReady();
  const result = await sql`
    update public.workspace_invites
    set status = 'canceled'
    where id = ${input.inviteId}
      and workspace_id = ${input.workspaceId}
      and status = 'pending'
      and accepted_at is null
    returning id
  `;

  return result.length > 0;
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
    returning workspace_id
  `;

  return result.length > 0;
}

export async function updateWorkspaceMemberRole(input: {
  workspaceId: string;
  targetUserId: string;
  role: WorkspaceRole;
}) {
  await assertWorkspaceSchemaReady();
  const result = await sql`
    update public.workspace_members
    set role = ${input.role}
    where workspace_id = ${input.workspaceId}
      and user_id = ${input.targetUserId}
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
    status: WorkspaceInviteStatus;
    expires_at: Date;
    accepted_at: Date | null;
  }[]>`
    select
      wi.id,
      wi.workspace_id,
      w.name as workspace_name,
      wi.email,
      wi.role,
      wi.status,
      wi.expires_at,
      wi.accepted_at
    from public.workspace_invites wi
    join public.workspaces w on w.id = wi.workspace_id
    where wi.token = ${token}
    limit 1
  `;

  if (!invite) {
    return null;
  }

  let resolvedStatus = invite.status;
  const isExpired =
    invite.expires_at.getTime() <= Date.now() &&
    invite.status !== 'accepted' &&
    invite.status !== 'canceled';

  if (invite.status === 'pending' && isExpired) {
    await sql`
      update public.workspace_invites
      set status = 'expired'
      where id = ${invite.id}
        and status = 'pending'
    `;
    resolvedStatus = 'expired';
  }

  return {
    id: invite.id,
    workspaceId: invite.workspace_id,
    workspaceName: invite.workspace_name,
    email: normalizeEmail(invite.email),
    role: invite.role,
    status: resolvedStatus,
    expiresAt: invite.expires_at.toISOString(),
    acceptedAt: invite.accepted_at ? invite.accepted_at.toISOString() : null,
    isExpired: isExpired || resolvedStatus === 'expired',
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
    owner_user_id: string;
    email: string;
    role: InvitableWorkspaceRole;
    status: WorkspaceInviteStatus;
    expires_at: Date;
    accepted_at: Date | null;
  }[]>`
    select
      wi.id,
      wi.workspace_id,
      w.name as workspace_name,
      w.owner_user_id,
      wi.email,
      wi.role,
      wi.status,
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
      code: 'INVITE_NOT_FOUND' as const,
      message: 'Invite link was not found.',
    };
  }

  if (invite.status === 'canceled') {
    return {
      ok: false as const,
      code: 'INVITE_CANCELED' as const,
      message: 'This invite was canceled by the company owner/admin.',
    };
  }

  if (invite.accepted_at || invite.status === 'accepted') {
    return {
      ok: false as const,
      code: 'ALREADY_ACCEPTED' as const,
      message: 'This invite has already been accepted.',
    };
  }

  if (invite.status === 'expired' || invite.expires_at.getTime() <= Date.now()) {
    if (invite.status === 'pending') {
      await sql`
        update public.workspace_invites
        set status = 'expired'
        where id = ${invite.id}
          and status = 'pending'
      `;
    }
    return {
      ok: false as const,
      code: 'INVITE_EXPIRED' as const,
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

  const [existingMembership] = await sql<{ workspace_id: string }[]>`
    select workspace_id
    from public.workspace_members
    where workspace_id = ${invite.workspace_id}
      and user_id = ${user.id}
    limit 1
  `;
  const isNewMembership = !existingMembership;

  const planSource = await readCanonicalWorkspacePlanSource({
    workspaceId: invite.workspace_id,
    userId: invite.owner_user_id,
  });
  const plan = normalizePlan(planSource.value);

  if (isNewMembership) {
    const seatLimit = TEAM_SEAT_LIMIT_BY_PLAN[plan];
    const [seatCountRow] = await sql<{ count: string }[]>`
      select count(*)::text as count
      from public.workspace_members
      where workspace_id = ${invite.workspace_id}
    `;
    const currentSeats = Number.parseInt(seatCountRow?.count ?? '0', 10) || 0;

    if (Number.isFinite(seatLimit) && currentSeats >= seatLimit) {
      return {
        ok: false as const,
        code: 'SEAT_LIMIT_REACHED' as const,
        message: `This company has reached the ${seatLimit}-seat limit for the ${plan} plan.`,
      };
    }

    const companyLimit = COMPANY_LIMIT_BY_PLAN[plan];
    const companyCount = await countWorkspacesForUser(user.id);
    if (Number.isFinite(companyLimit) && companyCount >= companyLimit) {
      return {
        ok: false as const,
        code: 'COMPANY_LIMIT_REACHED' as const,
        message: `Your ${plan} plan allows up to ${companyLimit} companies.`,
      };
    }
  }

  await sql`
    insert into public.workspace_members (workspace_id, user_id, role)
    values (${invite.workspace_id}, ${user.id}, ${invite.role})
    on conflict (workspace_id, user_id)
    do update set role = excluded.role
  `;

  await sql`
    update public.workspace_invites
    set accepted_at = now(), status = 'accepted'
    where id = ${invite.id}
      and status = 'pending'
      and accepted_at is null
  `;

  await sql`
    update public.users
    set active_workspace_id = ${invite.workspace_id}
    where id = ${user.id}
  `;

  return {
    ok: true as const,
    workspaceId: invite.workspace_id,
    workspaceName: invite.workspace_name,
    role: invite.role,
  };
}
