import {
  maybeLogBillingMirrorDrift,
  resolveBillingContext,
  upsertWorkspaceBilling,
} from '@/app/lib/workspace-billing';

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
    users: { matched: number; updated: number };
    workspaces: { matched: number; updated: number };
    membership: { matched: number; updated: number };
  };
  readback: {
    userPlan?: string | null;
    workspacePlan?: string | null;
    membershipPlan?: string | null;
    activeWorkspaceId?: string | null;
  };
}> {
  await upsertWorkspaceBilling({
    workspaceId: input.workspaceId,
    plan: input.plan,
    subscriptionStatus: input.subscriptionStatus,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
  });

  await maybeLogBillingMirrorDrift({
    workspaceId: input.workspaceId,
    userId: input.userId,
  });

  const billing = await resolveBillingContext({
    workspaceId: input.workspaceId,
    userId: input.userId,
  });

  return {
    wrote: {
      users: { matched: 0, updated: 0 },
      workspaces: { matched: 1, updated: 1 },
      membership: { matched: 0, updated: 0 },
    },
    readback: {
      userPlan: null,
      workspacePlan: billing.plan,
      membershipPlan: null,
      activeWorkspaceId: input.workspaceId,
    },
  };
}

export async function readCanonicalWorkspacePlanSource(input: {
  workspaceId: string;
  userId: string;
}): Promise<{
  source: 'workspace_billing.plan' | 'users.plan';
  value: string | null;
  workspaceId: string;
  userId: string;
}> {
  const billing = await resolveBillingContext({
    workspaceId: input.workspaceId,
    userId: input.userId,
  });

  return {
    source: billing.source === 'workspace_billing' ? 'workspace_billing.plan' : 'users.plan',
    value: billing.plan,
    workspaceId: input.workspaceId.trim(),
    userId: input.userId.trim(),
  };
}
