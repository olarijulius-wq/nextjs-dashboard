import type Stripe from 'stripe';

export function readWorkspaceIdFromStripeMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  const workspaceId = metadata?.workspace_id;
  if (typeof workspaceId !== 'string') {
    return null;
  }
  const normalized = workspaceId.trim();
  return normalized || null;
}

export function readLegacyWorkspaceIdFromStripeMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  const workspaceId = metadata?.workspaceId;
  if (typeof workspaceId !== 'string') {
    return null;
  }
  const normalized = workspaceId.trim();
  return normalized || null;
}
