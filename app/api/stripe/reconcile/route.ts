import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import postgres from 'postgres';
import { z } from 'zod';
import { auth } from '@/auth';
import { stripe } from '@/app/lib/stripe';
import { resolvePaidPlanFromStripe } from '@/app/lib/config';
import { applyPlanSync } from '@/app/lib/billing-sync';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const reconcileSchema = z
  .object({
    sessionId: z.string().trim().min(1).optional(),
    subscriptionId: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.sessionId || value.subscriptionId), {
    message: 'sessionId or subscriptionId is required',
  });

function parseStripeId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const candidate = value as { id?: unknown };
  return typeof candidate.id === 'string' ? candidate.id : null;
}

function readProductPlan(
  product: Stripe.Price['product'] | null | undefined,
): string | null {
  if (!product || typeof product === 'string') return null;
  if ('deleted' in product && product.deleted) return null;
  return product.metadata?.plan ?? null;
}

function toStoredBillingInterval(value: string | null | undefined): 'monthly' | 'annual' | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'monthly') return 'monthly';
  if (normalized === 'annual' || normalized === 'yearly') return 'annual';
  return null;
}

async function resolveWorkspaceForUser(input: {
  metadataWorkspaceId: string | null;
}): Promise<{
  workspaceId: string | null;
  strategy: 'metadata.workspaceId' | 'active_workspace' | 'none';
}> {
  if (input.metadataWorkspaceId) {
    return {
      workspaceId: input.metadataWorkspaceId,
      strategy: 'metadata.workspaceId',
    };
  }

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    return {
      workspaceId: context.workspaceId,
      strategy: 'active_workspace',
    };
  } catch {
    return {
      workspaceId: null,
      strategy: 'none',
    };
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = reconcileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const { sessionId, subscriptionId } = parsed.data;
  const userEmail = session?.user?.email?.trim().toLowerCase() ?? null;

  let checkoutSession: Stripe.Checkout.Session | null = null;
  let subscription: Stripe.Subscription | null = null;

  if (sessionId) {
    checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'subscription.items.data.price.product', 'customer'],
    });

    if (
      checkoutSession.mode !== 'subscription' ||
      checkoutSession.payment_status !== 'paid' ||
      !checkoutSession.subscription
    ) {
      return NextResponse.json(
        { ok: false, code: 'SESSION_NOT_PAID_SUBSCRIPTION' },
        { status: 200 },
      );
    }

    subscription =
      typeof checkoutSession.subscription === 'string'
        ? await stripe.subscriptions.retrieve(checkoutSession.subscription, {
            expand: ['items.data.price.product', 'customer'],
          })
        : checkoutSession.subscription;
  } else if (subscriptionId) {
    subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product', 'customer'],
    });
  }

  if (!subscription) {
    return NextResponse.json({ ok: false, code: 'SUBSCRIPTION_NOT_FOUND' }, { status: 200 });
  }

  const metadataWorkspaceId =
    checkoutSession?.metadata?.workspaceId?.trim() ||
    subscription.metadata?.workspaceId?.trim() ||
    null;
  const workspaceResolution = await resolveWorkspaceForUser({ metadataWorkspaceId });
  const workspaceId = workspaceResolution.workspaceId;

  if (!workspaceId) {
    console.warn('[stripe reconcile] workspace resolution failed', {
      source: 'manual_reconcile',
      eventType: 'manual_reconcile',
      sessionId: sessionId ?? null,
      subscriptionId: subscription.id,
      strategy: workspaceResolution.strategy,
      metadataWorkspaceId: metadataWorkspaceId ?? null,
    });
    return NextResponse.json(
      { ok: false, code: 'WORKSPACE_RESOLUTION_FAILED' },
      { status: 200 },
    );
  }

  const firstPrice = subscription.items.data[0]?.price;
  const plan = resolvePaidPlanFromStripe({
    metadataPlan: subscription.metadata?.plan ?? checkoutSession?.metadata?.plan ?? null,
    priceId: firstPrice?.id ?? null,
    productId: parseStripeId(firstPrice?.product),
    productMetadataPlan: readProductPlan(firstPrice?.product),
  });

  if (!plan) {
    return NextResponse.json({ ok: false, code: 'PLAN_RESOLUTION_FAILED' }, { status: 200 });
  }

  const customerId = parseStripeId(subscription.customer);
  const status = String(subscription.status).trim().toLowerCase();
  const interval = toStoredBillingInterval(subscription.items?.data?.[0]?.price?.recurring?.interval);
  const latestInvoiceId = parseStripeId(subscription.latest_invoice);
  const dedupeKey = `manual_reconcile:${sessionId ?? subscription.id}`;

  const inserted = (await sql.unsafe(
    `
      insert into public.billing_events (
        workspace_id,
        user_email,
        event_type,
        stripe_event_id,
        stripe_object_id,
        status,
        meta
      )
      values (
        $1,
        $2,
        'manual_reconcile',
        $3,
        $4,
        $5,
        $6::jsonb
      )
      on conflict do nothing
      returning id
    `,
    [workspaceId, userEmail, dedupeKey, subscription.id, status, JSON.stringify({ source: 'manual_reconcile' })],
  )) as Array<{ id: string }>;

  const sync = await applyPlanSync({
    workspaceId,
    userId,
    plan,
    interval,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    livemode: subscription.livemode,
    latestInvoiceId,
    source: 'manual_reconcile',
    stripeEventIdOrReconcileKey: dedupeKey,
  });

  const effective =
    sync.readback.workspacePlan === plan ||
    sync.readback.membershipPlan === plan ||
    sync.readback.userPlan === plan;

  await sql.unsafe(
    `
      update public.billing_events
      set
        workspace_id = $1,
        status = $2,
        meta = coalesce(meta, '{}'::jsonb) || $3::jsonb
      where stripe_event_id = $4
    `,
    [
      workspaceId,
      status,
      JSON.stringify({
        source: 'manual_reconcile',
        plan,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        effective,
        wrote: sync.wrote,
        readback: sync.readback,
      }),
      dedupeKey,
    ],
  );

  if (!effective) {
    return NextResponse.json(
      {
        ok: false,
        code: 'PLAN_SYNC_NO_EFFECT',
        message: 'Plan sync did not update the billing source of truth',
        workspaceId,
        userId,
        plan,
        wrote: sync.wrote,
        readback: sync.readback,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      resolved: {
        workspaceId,
        plan,
      },
      workspaceId,
      plan,
      wrote: sync.wrote,
      readback: sync.readback,
      effective,
      stripe: {
        customer: customerId,
        subscription: subscription.id,
      },
      source: 'manual_reconcile',
      deduped: inserted.length === 0,
    },
    { status: 200 },
  );
}
