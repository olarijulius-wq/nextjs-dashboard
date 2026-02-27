import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { stripe } from '@/app/lib/stripe';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import {
  assertStripeConfig,
  createStripeRequestVerifier,
  getStripeConfigState,
  normalizeStripeConfigError,
} from '@/app/lib/stripe-guard';
import { fetchStripeConnectStatusForUser } from '@/app/lib/data';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

type LatestWebhookStatus = {
  eventId: string;
  eventType: string;
  status: string;
  processedAt: string | null;
  receivedAt: string;
  error: string | null;
};

async function readLatestWebhookStatus(): Promise<LatestWebhookStatus | null> {
  const [row] = await sql<{
    event_id: string;
    event_type: string;
    status: string;
    processed_at: Date | null;
    received_at: Date;
    error: string | null;
  }[]>`
    select
      event_id,
      event_type,
      status,
      processed_at,
      received_at,
      error
    from public.stripe_webhook_events
    order by received_at desc
    limit 1
  `;

  if (!row) return null;
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    status: row.status,
    processedAt: row.processed_at ? row.processed_at.toISOString() : null,
    receivedAt: row.received_at.toISOString(),
    error: row.error,
  };
}

async function requireBillingSelfCheckAccess() {
  const context = await ensureWorkspaceContextForCurrentUser();
  if (!isInternalAdmin(context.userEmail)) {
    throw new Error('forbidden');
  }
  if (context.userRole !== 'owner' && context.userRole !== 'admin') {
    throw new Error('forbidden');
  }
  return context;
}

export async function GET() {
  try {
    const context = await requireBillingSelfCheckAccess();
    const stripeState = getStripeConfigState();
    const connectStatus = await fetchStripeConnectStatusForUser(context.userEmail);
    const latestWebhook = await readLatestWebhookStatus();

    return NextResponse.json({
      ok: true,
      environment: stripeState.environment,
      keyMode: stripeState.secretKeyMode,
      keySuffix: stripeState.secretKeyMasked,
      connectAccountId: connectStatus.accountId,
      latestWebhook,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(
      { ok: false, error: 'Failed to load billing self-check details.' },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const context = await requireBillingSelfCheckAccess();
    const connectStatus = await fetchStripeConnectStatusForUser(context.userEmail);
    const latestWebhook = await readLatestWebhookStatus();

    const stripeState = assertStripeConfig();
    const verifier = createStripeRequestVerifier(stripe);
    const platformAccount = await verifier.getPlatformAccount();

    if (connectStatus.accountId) {
      await verifier.verifyConnectedAccountAccess(connectStatus.accountId);
    }

    return NextResponse.json({
      ok: true,
      result: 'PASS',
      reason: 'Stripe API key and Connect account checks passed.',
      nextStep: 'No action required.',
      environment: stripeState.environment,
      keyMode: stripeState.secretKeyMode,
      keySuffix: stripeState.secretKeyMasked,
      platformAccountId: platformAccount.id,
      connectAccountId: connectStatus.accountId,
      latestWebhook,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const normalized = normalizeStripeConfigError(error);
    return NextResponse.json(
      {
        ok: false,
        result: 'FAIL',
        reason: normalized.message,
        nextStep: normalized.guidance,
        code: normalized.code,
      },
      { status: 500 },
    );
  }
}
