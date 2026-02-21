import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

type SyncWriteCount = {
  matched: number;
  updated: number;
};

type SyncReadback = {
  userPlan?: string | null;
  workspacePlan?: string | null;
  membershipPlan?: string | null;
  activeWorkspaceId?: string | null;
};

type SchemaSnapshot = {
  users: Set<string>;
  workspaces: Set<string>;
  workspaceMembers: Set<string>;
  workspaceUsers: Set<string>;
};

export async function applyPlanSync(input: {
  workspaceId: string;
  userId: string;
  plan: string;
  interval: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
  livemode: boolean;
  latestInvoiceId: string | null;
  source: string;
  stripeEventIdOrReconcileKey: string;
}): Promise<{
  wrote: {
    users: SyncWriteCount;
    workspaces: SyncWriteCount;
    membership: SyncWriteCount;
  };
  readback: SyncReadback;
}> {
  const workspaceId = input.workspaceId.trim();
  const plan = input.plan.trim().toLowerCase();
  const status = input.subscriptionStatus.trim().toLowerCase();
  const source = input.source.trim();
  const userId = input.userId.trim();

  if (!workspaceId) {
    return {
      wrote: {
        users: { matched: 0, updated: 0 },
        workspaces: { matched: 0, updated: 0 },
        membership: { matched: 0, updated: 0 },
      },
      readback: {
        userPlan: null,
        workspacePlan: null,
        membershipPlan: null,
        activeWorkspaceId: null,
      },
    };
  }

  return sql.begin(async (tx) => {
    const schema = await readSchemaSnapshot(tx);

    const targetUserIds = await resolveTargetUserIds(tx, {
      schema,
      workspaceId,
      userId,
    });

    const usersWrite = await updateUsers(tx, {
      schema,
      userIds: targetUserIds,
      plan,
      status,
      interval: input.interval,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      livemode: input.livemode,
      latestInvoiceId: input.latestInvoiceId,
      source,
      eventKey: input.stripeEventIdOrReconcileKey,
    });

    const workspacesWrite = await updateWorkspaces(tx, {
      schema,
      workspaceId,
      plan,
      status,
      interval: input.interval,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      livemode: input.livemode,
      latestInvoiceId: input.latestInvoiceId,
      source,
      eventKey: input.stripeEventIdOrReconcileKey,
    });

    const membershipWrite = await updateMembershipTables(tx, {
      schema,
      workspaceId,
      userId,
      plan,
      status,
      interval: input.interval,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      livemode: input.livemode,
      latestInvoiceId: input.latestInvoiceId,
      source,
      eventKey: input.stripeEventIdOrReconcileKey,
    });

    const readback = await readBackPlanSync(tx, {
      schema,
      workspaceId,
      userId: targetUserIds[0] ?? userId,
    });

    return {
      wrote: {
        users: usersWrite,
        workspaces: workspacesWrite,
        membership: membershipWrite,
      },
      readback,
    };
  });
}

export async function readCanonicalWorkspacePlanSource(input: {
  workspaceId: string;
  userId: string;
}): Promise<{
  source: 'workspace.plan' | 'users.plan';
  value: string | null;
  workspaceId: string;
  userId: string;
}> {
  const workspaceId = input.workspaceId.trim();
  const userId = input.userId.trim();

  return sql.begin(async (tx) => {
    const schema = await readSchemaSnapshot(tx);

    if (workspaceId && schema.workspaces.has('plan')) {
      const rows = (await tx.unsafe(
        `
          select plan
          from public.workspaces
          where id = $1
          limit 1
        `,
        [workspaceId],
      )) as Array<{ plan: string | null }>;
      if (rows.length > 0) {
        return {
          source: 'workspace.plan' as const,
          value: rows[0]?.plan ?? null,
          workspaceId,
          userId,
        };
      }
    }

    const usersRows = userId && schema.users.has('plan')
      ? ((await tx.unsafe(
          `
            select plan
            from public.users
            where id = $1
            limit 1
          `,
          [userId],
        )) as Array<{ plan: string | null }>)
      : [];

    return {
      source: 'users.plan' as const,
      value: usersRows[0]?.plan ?? null,
      workspaceId,
      userId,
    };
  });
}

async function readSchemaSnapshot(tx: any): Promise<SchemaSnapshot> {
  const rows = (await tx.unsafe(
    `
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('users', 'workspaces', 'workspace_members', 'workspace_users')
    `,
    [],
  )) as Array<{ table_name: string; column_name: string }>;

  const users = new Set<string>();
  const workspaces = new Set<string>();
  const workspaceMembers = new Set<string>();
  const workspaceUsers = new Set<string>();

  for (const row of rows) {
    if (row.table_name === 'users') users.add(row.column_name);
    if (row.table_name === 'workspaces') workspaces.add(row.column_name);
    if (row.table_name === 'workspace_members') workspaceMembers.add(row.column_name);
    if (row.table_name === 'workspace_users') workspaceUsers.add(row.column_name);
  }

  return {
    users,
    workspaces,
    workspaceMembers,
    workspaceUsers,
  };
}

async function resolveTargetUserIds(
  tx: any,
  input: {
    schema: SchemaSnapshot;
    workspaceId: string;
    userId: string;
  },
): Promise<string[]> {
  const ids = new Set<string>();
  if (input.userId) {
    ids.add(input.userId);
  }

  if (input.schema.workspaces.size === 0) {
    return Array.from(ids);
  }

  const ownerColumns = [
    'owner_user_id',
    'billing_owner_user_id',
    'billing_user_id',
    'billing_contact_user_id',
  ].filter((column) => input.schema.workspaces.has(column));

  if (ownerColumns.length === 0) {
    return Array.from(ids);
  }

  const selectColumns = ownerColumns.map((column) => `"${column}"`).join(', ');
  const rows = (await tx.unsafe(
    `
      select ${selectColumns}
      from public.workspaces
      where id = $1
      limit 1
    `,
    [input.workspaceId],
  )) as Array<Record<string, unknown>>;

  const row = rows[0];
  for (const column of ownerColumns) {
    const value = row?.[column];
    if (typeof value === 'string' && value.trim()) {
      ids.add(value.trim());
    }
  }

  return Array.from(ids);
}

function buildSetAndDiffClauses(input: {
  columns: Set<string>;
  plan: string;
  status: string;
  interval: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  livemode: boolean;
  latestInvoiceId: string | null;
  source: string;
  eventKey: string;
}): {
  setClauses: string[];
  diffClauses: string[];
  params: any[];
} {
  const setClauses: string[] = [];
  const diffClauses: string[] = [];
  const params: any[] = [];

  const pushDirect = (column: string, value: any) => {
    if (!input.columns.has(column)) return;
    params.push(value);
    const token = `$${params.length}`;
    setClauses.push(`"${column}" = ${token}`);
    diffClauses.push(`"${column}" is distinct from ${token}`);
  };

  const pushCoalesce = (column: string, value: any) => {
    if (!input.columns.has(column)) return;
    params.push(value);
    const token = `$${params.length}`;
    setClauses.push(`"${column}" = coalesce(${token}, "${column}")`);
    diffClauses.push(`(${token} is not null and "${column}" is distinct from ${token})`);
  };

  pushDirect('plan', input.plan);
  pushDirect('subscription_status', input.status);
  pushCoalesce('stripe_customer_id', input.stripeCustomerId);
  pushCoalesce('stripe_subscription_id', input.stripeSubscriptionId);
  pushDirect('billing_interval', input.interval);
  pushDirect('plan_interval', input.interval);
  pushDirect('subscription_interval', input.interval);
  pushDirect('interval', input.interval);
  pushDirect('latest_invoice_id', input.latestInvoiceId);
  pushDirect('stripe_latest_invoice_id', input.latestInvoiceId);
  pushDirect('livemode', input.livemode);
  pushDirect('stripe_livemode', input.livemode);
  pushDirect('plan_sync_source', input.source);
  pushDirect('sync_source', input.source);
  pushDirect('last_plan_sync_source', input.source);
  pushDirect('plan_sync_key', input.eventKey);
  pushDirect('last_plan_sync_key', input.eventKey);

  if (input.columns.has('is_pro')) {
    const isPro = input.plan !== 'free';
    params.push(isPro);
    const token = `$${params.length}`;
    setClauses.push(`"is_pro" = ${token}`);
    diffClauses.push(`"is_pro" is distinct from ${token}`);
  }

  return { setClauses, diffClauses, params };
}

async function updateUsers(
  tx: any,
  input: {
    schema: SchemaSnapshot;
    userIds: string[];
    plan: string;
    status: string;
    interval: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    livemode: boolean;
    latestInvoiceId: string | null;
    source: string;
    eventKey: string;
  },
): Promise<SyncWriteCount> {
  if (input.userIds.length === 0 || input.schema.users.size === 0) {
    return { matched: 0, updated: 0 };
  }

  const [matchedRow] = (await tx.unsafe(
    `
      select count(*)::int as count
      from public.users
      where id = any($1::uuid[])
    `,
    [input.userIds],
  )) as Array<{ count: number }>;
  const matched = matchedRow?.count ?? 0;

  const { setClauses, diffClauses, params } = buildSetAndDiffClauses({
    columns: input.schema.users,
    plan: input.plan,
    status: input.status,
    interval: input.interval,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    livemode: input.livemode,
    latestInvoiceId: input.latestInvoiceId,
    source: input.source,
    eventKey: input.eventKey,
  });

  if (setClauses.length === 0) {
    return { matched, updated: 0 };
  }

  const updatedRows = (await tx.unsafe(
    `
      update public.users
      set ${setClauses.join(', ')}
      where id = any($${params.length + 1}::uuid[])
        and (${diffClauses.join(' or ')})
      returning id
    `,
    [...params, input.userIds],
  )) as Array<{ id: string }>;

  return { matched, updated: updatedRows.length };
}

async function updateWorkspaces(
  tx: any,
  input: {
    schema: SchemaSnapshot;
    workspaceId: string;
    plan: string;
    status: string;
    interval: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    livemode: boolean;
    latestInvoiceId: string | null;
    source: string;
    eventKey: string;
  },
): Promise<SyncWriteCount> {
  if (input.schema.workspaces.size === 0) {
    return { matched: 0, updated: 0 };
  }

  const [matchedRow] = (await tx.unsafe(
    `
      select count(*)::int as count
      from public.workspaces
      where id = $1
    `,
    [input.workspaceId],
  )) as Array<{ count: number }>;
  const matched = matchedRow?.count ?? 0;

  const { setClauses, diffClauses, params } = buildSetAndDiffClauses({
    columns: input.schema.workspaces,
    plan: input.plan,
    status: input.status,
    interval: input.interval,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    livemode: input.livemode,
    latestInvoiceId: input.latestInvoiceId,
    source: input.source,
    eventKey: input.eventKey,
  });

  if (setClauses.length === 0) {
    return { matched, updated: 0 };
  }

  const updatedRows = (await tx.unsafe(
    `
      update public.workspaces
      set ${setClauses.join(', ')}
      where id = $${params.length + 1}
        and (${diffClauses.join(' or ')})
      returning id
    `,
    [...params, input.workspaceId],
  )) as Array<{ id: string }>;

  return { matched, updated: updatedRows.length };
}

async function updateMembershipTable(
  tx: any,
  input: {
    tableName: 'workspace_members' | 'workspace_users';
    columns: Set<string>;
    workspaceId: string;
    userId: string;
    plan: string;
    status: string;
    interval: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    livemode: boolean;
    latestInvoiceId: string | null;
    source: string;
    eventKey: string;
  },
): Promise<SyncWriteCount> {
  if (input.columns.size === 0 || !input.columns.has('workspace_id')) {
    return { matched: 0, updated: 0 };
  }

  const [matchedRow] = (await tx.unsafe(
    `
      select count(*)::int as count
      from public.${input.tableName}
      where workspace_id = $1
    `,
    [input.workspaceId],
  )) as Array<{ count: number }>;
  const matched = matchedRow?.count ?? 0;

  const { setClauses, diffClauses, params } = buildSetAndDiffClauses({
    columns: input.columns,
    plan: input.plan,
    status: input.status,
    interval: input.interval,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    livemode: input.livemode,
    latestInvoiceId: input.latestInvoiceId,
    source: input.source,
    eventKey: input.eventKey,
  });

  if (setClauses.length === 0) {
    return { matched, updated: 0 };
  }

  const updatedRows = (await tx.unsafe(
    `
      update public.${input.tableName}
      set ${setClauses.join(', ')}
      where workspace_id = $${params.length + 1}
        and (${diffClauses.join(' or ')})
      returning workspace_id
    `,
    [...params, input.workspaceId],
  )) as Array<{ workspace_id: string }>;

  return { matched, updated: updatedRows.length };
}

async function updateMembershipTables(
  tx: any,
  input: {
    schema: SchemaSnapshot;
    workspaceId: string;
    userId: string;
    plan: string;
    status: string;
    interval: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    livemode: boolean;
    latestInvoiceId: string | null;
    source: string;
    eventKey: string;
  },
): Promise<SyncWriteCount> {
  const members = await updateMembershipTable(tx, {
    tableName: 'workspace_members',
    columns: input.schema.workspaceMembers,
    workspaceId: input.workspaceId,
    userId: input.userId,
    plan: input.plan,
    status: input.status,
    interval: input.interval,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    livemode: input.livemode,
    latestInvoiceId: input.latestInvoiceId,
    source: input.source,
    eventKey: input.eventKey,
  });

  const users = await updateMembershipTable(tx, {
    tableName: 'workspace_users',
    columns: input.schema.workspaceUsers,
    workspaceId: input.workspaceId,
    userId: input.userId,
    plan: input.plan,
    status: input.status,
    interval: input.interval,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    livemode: input.livemode,
    latestInvoiceId: input.latestInvoiceId,
    source: input.source,
    eventKey: input.eventKey,
  });

  return {
    matched: members.matched + users.matched,
    updated: members.updated + users.updated,
  };
}

async function readBackPlanSync(
  tx: any,
  input: {
    schema: SchemaSnapshot;
    workspaceId: string;
    userId: string;
  },
): Promise<SyncReadback> {
  let userPlan: string | null = null;
  let activeWorkspaceId: string | null = null;
  let workspacePlan: string | null = null;
  let membershipPlan: string | null = null;

  if (input.userId && input.schema.users.size > 0) {
    const canReadPlan = input.schema.users.has('plan');
    const canReadActiveWorkspace = input.schema.users.has('active_workspace_id');

    if (canReadPlan || canReadActiveWorkspace) {
      const fields = [
        canReadPlan ? 'plan' : 'null::text as plan',
        canReadActiveWorkspace
          ? 'active_workspace_id::text as active_workspace_id'
          : 'null::text as active_workspace_id',
      ];

      const rows = (await tx.unsafe(
        `
          select ${fields.join(', ')}
          from public.users
          where id = $1
          limit 1
        `,
        [input.userId],
      )) as Array<{ plan: string | null; active_workspace_id: string | null }>;

      userPlan = rows[0]?.plan ?? null;
      activeWorkspaceId = rows[0]?.active_workspace_id ?? null;
    }
  }

  if (input.schema.workspaces.has('plan')) {
    const rows = (await tx.unsafe(
      `
        select plan
        from public.workspaces
        where id = $1
        limit 1
      `,
      [input.workspaceId],
    )) as Array<{ plan: string | null }>;
    workspacePlan = rows[0]?.plan ?? null;
  }

  if (input.schema.workspaceMembers.has('plan') && input.schema.workspaceMembers.has('workspace_id')) {
    const rows = input.schema.workspaceMembers.has('user_id') && input.userId
      ? await tx.unsafe(
          `
            select plan
            from public.workspace_members
            where workspace_id = $1
              and user_id = $2
            limit 1
          `,
          [input.workspaceId, input.userId],
        )
      : await tx.unsafe(
          `
            select plan
            from public.workspace_members
            where workspace_id = $1
            limit 1
          `,
          [input.workspaceId],
        );

    const typedRows = rows as unknown as Array<{ plan: string | null }>;
    membershipPlan = typedRows[0]?.plan ?? null;
  }

  if (
    membershipPlan === null &&
    input.schema.workspaceUsers.has('plan') &&
    input.schema.workspaceUsers.has('workspace_id')
  ) {
    const rows = input.schema.workspaceUsers.has('user_id') && input.userId
      ? await tx.unsafe(
          `
            select plan
            from public.workspace_users
            where workspace_id = $1
              and user_id = $2
            limit 1
          `,
          [input.workspaceId, input.userId],
        )
      : await tx.unsafe(
          `
            select plan
            from public.workspace_users
            where workspace_id = $1
            limit 1
          `,
          [input.workspaceId],
        );

    const typedRows = rows as unknown as Array<{ plan: string | null }>;
    membershipPlan = typedRows[0]?.plan ?? null;
  }

  return {
    userPlan,
    workspacePlan,
    membershipPlan,
    activeWorkspaceId,
  };
}
