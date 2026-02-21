import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import postgres from 'postgres';
import { z } from 'zod';
import { auth } from '@/auth';
import { stripe } from '@/app/lib/stripe';
import { resolvePaidPlanFromStripe } from '@/app/lib/config';
import { applyPlanSync, readCanonicalWorkspacePlanSource } from '@/app/lib/billing-sync';
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

function buildStamp() {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || new Date().toISOString();
}

function parseStripeId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const candidate = value as { id?: unknown };
  return typeof candidate.id === 'string' ? candidate.id : null;
}

function toStoredBillingInterval(value: string | null | undefined): 'monthly' | 'annual' | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'monthly') return 'monthly';
  if (normalized === 'annual' || normalized === 'yearly') return 'annual';
  return null;
}

function normalizePlan(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function readStripeErrorDetails(error: unknown): {
  type: string | null;
  code: string | null;
  message: string | null;
  requestId: string | null;
} {
  const stripeError = error as {
    type?: string;
    code?: string;
    message?: string;
    requestId?: string;
    rawType?: string;
    raw?: {
      code?: string;
      message?: string;
      requestId?: string;
    };
  } | null;

  return {
    type: stripeError?.type ?? stripeError?.rawType ?? null,
    code: stripeError?.code ?? stripeError?.raw?.code ?? null,
    message: stripeError?.message ?? stripeError?.raw?.message ?? null,
    requestId: stripeError?.requestId ?? stripeError?.raw?.requestId ?? null,
  };
}

function isStripeApiError(error: unknown): boolean {
  const details = readStripeErrorDetails(error);
  if (details.type || details.requestId) return true;
  const withStatusCode = error as { statusCode?: unknown } | null;
  return typeof withStatusCode?.statusCode === 'number';
}

function jsonFailure(input: {
  status: number;
  code: string;
  message: string;
  build: string;
  debug?: Record<string, unknown>;
  stripe?: {
    type: string | null;
    code: string | null;
    message: string | null;
    requestId: string | null;
  };
}) {
  return NextResponse.json(
    {
      ok: false,
      code: input.code,
      message: input.message,
      build: input.build,
      ...(input.stripe ? { stripe: input.stripe } : {}),
      ...(process.env.NODE_ENV === 'development' && input.debug ? { debug: input.debug } : {}),
    },
    { status: input.status },
  );
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
  const build = buildStamp();
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    if (!userId) {
      return jsonFailure({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        build,
      });
    }

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const parsed = reconcileSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFailure({
        status: 400,
        code: 'INVALID_REQUEST_BODY',
        message: 'sessionId or subscriptionId is required',
        build,
        debug: { issues: parsed.error.issues },
      });
    }

    const { sessionId, subscriptionId } = parsed.data;
    const userEmail = session?.user?.email?.trim().toLowerCase() ?? null;

    let checkoutSession: Stripe.Checkout.Session | null = null;
    let subscription: Stripe.Subscription | null = null;

    if (sessionId) {
      checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'customer'],
      });

      if (
        checkoutSession.mode !== 'subscription' ||
        checkoutSession.payment_status !== 'paid' ||
        !checkoutSession.subscription
      ) {
        return jsonFailure({
          status: 409,
          code: 'SESSION_NOT_PAID_SUBSCRIPTION',
          message: 'Checkout session is not a paid subscription session.',
          build,
        });
      }

      subscription =
        typeof checkoutSession.subscription === 'string'
          ? await stripe.subscriptions.retrieve(checkoutSession.subscription, {
              expand: ['items.data.price'],
            })
          : checkoutSession.subscription;
    } else if (subscriptionId) {
      subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      });
    }

    if (!subscription) {
      return jsonFailure({
        status: 404,
        code: 'SUBSCRIPTION_NOT_FOUND',
        message: 'Subscription not found.',
        build,
      });
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
      return jsonFailure({
        status: 409,
        code: 'WORKSPACE_RESOLUTION_FAILED',
        message: 'Could not resolve workspace for the current user.',
        build,
      });
    }

    const firstPrice = subscription.items.data[0]?.price;
    const requestedPlan = resolvePaidPlanFromStripe({
      metadataPlan: checkoutSession?.metadata?.plan ?? subscription.metadata?.plan ?? null,
      priceId: firstPrice?.id ?? null,
      priceLookupKey: firstPrice?.lookup_key ?? null,
    });

    if (!requestedPlan) {
      return jsonFailure({
        status: 422,
        code: 'PLAN_RESOLUTION_FAILED',
        message: 'Could not resolve paid plan from Stripe metadata or price.',
        build,
      });
    }

    const customerId = parseStripeId(subscription.customer);
    const status = String(subscription.status).trim().toLowerCase();
    const interval = toStoredBillingInterval(
      subscription.items?.data?.[0]?.price?.recurring?.interval,
    );
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
      plan: requestedPlan,
      interval,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      livemode: subscription.livemode,
      latestInvoiceId,
      source: 'manual_reconcile',
      stripeEventIdOrReconcileKey: dedupeKey,
    });

    const canonical = await readCanonicalWorkspacePlanSource({
      workspaceId,
      userId,
    });
    const workspacePlan = normalizePlan(sync.readback.workspacePlan);
    const userPlan = normalizePlan(sync.readback.userPlan);
    const normalizedRequestedPlan = normalizePlan(requestedPlan);
    const effective =
      canonical.source === 'workspace.plan'
        ? workspacePlan === normalizedRequestedPlan
        : userPlan === normalizedRequestedPlan;

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
          requestedPlan,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          canonicalSource: canonical.source,
          effective,
          wrote: sync.wrote,
          readback: {
            workspacePlan,
            userPlan,
          },
        }),
        dedupeKey,
      ],
    );

    if (!effective) {
      return jsonFailure({
        status: 409,
        code: 'PLAN_SYNC_NO_EFFECT',
        message: 'Plan sync did not update the canonical billing source of truth.',
        build,
        debug: {
          workspaceId,
          userId,
          requestedPlan,
          canonicalSource: canonical.source,
          wrote: sync.wrote,
          readback: {
            workspacePlan,
            userPlan,
          },
        },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        build,
        workspaceId,
        requestedPlan,
        readback: {
          workspacePlan,
          userPlan,
        },
        effective,
        canonicalSource: canonical.source,
        wrote: sync.wrote,
        stripe: {
          customer: customerId,
          subscription: subscription.id,
        },
        source: 'manual_reconcile',
        deduped: inserted.length === 0,
      },
      { status: 200 },
    );
  } catch (error) {
    if (isStripeApiError(error)) {
      const stripeDetails = readStripeErrorDetails(error);
      return jsonFailure({
        status: 502,
        code: 'STRIPE_API_ERROR',
        message: stripeDetails.message ?? 'Stripe API request failed.',
        build,
        stripe: stripeDetails,
      });
    }

    const message = error instanceof Error ? error.message : 'Unexpected reconcile failure';
    return jsonFailure({
      status: 500,
      code: 'RECONCILE_INTERNAL_ERROR',
      message,
      build,
      debug: error instanceof Error ? { stack: error.stack ?? null } : { error: String(error) },
    });
  }
}
