import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import { auth } from '@/auth';
import { sql } from '@/app/lib/db';
import { stripe } from '@/app/lib/stripe';
import { resolvePaidPlanFromStripe } from '@/app/lib/config';
import { applyPlanSync, readCanonicalWorkspacePlanSource } from '@/app/lib/billing-sync';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { readWorkspaceIdFromStripeMetadata } from '@/app/lib/stripe-workspace-metadata';
import {
  enforceRateLimit,
  parseJsonBody,
} from '@/app/lib/security/api-guard';

const reconcileSchema = z
  .object({
    sessionId: z.string().trim().min(1).optional(),
    subscriptionId: z.string().trim().min(1).optional(),
    workspaceId: z.string().trim().uuid().optional(),
  })
  .strict()
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

export async function POST(req: Request) {
  const build = buildStamp();
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    const userEmail = session?.user?.email?.trim().toLowerCase() ?? null;
    if (!userId) {
      return jsonFailure({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        build,
      });
    }

    const rateLimitResponse = await enforceRateLimit(
      req,
      {
        bucket: 'stripe_reconcile',
        windowSec: 300,
        ipLimit: 30,
        userLimit: 10,
      },
      { userKey: userEmail },
    );
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const contentType = req.headers.get('content-type')?.toLowerCase() ?? '';
    const parsedBody = contentType.includes('application/json')
      ? await parseJsonBody(req, reconcileSchema)
      : {
        ok: false as const,
        response: jsonFailure({
          status: 400,
          code: 'INVALID_REQUEST_BODY',
          message: 'sessionId or subscriptionId is required',
          build,
        }),
      };
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const { sessionId, subscriptionId, workspaceId: requestedWorkspaceId } = parsedBody.data;

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
      readWorkspaceIdFromStripeMetadata(checkoutSession?.metadata) ||
      readWorkspaceIdFromStripeMetadata(subscription.metadata) ||
      null;
    const activeWorkspaceContext = await ensureWorkspaceContextForCurrentUser().catch(() => null);
    const workspaceId = requestedWorkspaceId ?? activeWorkspaceContext?.workspaceId ?? null;

    if (!workspaceId) {
      console.warn('[stripe reconcile] workspace resolution failed', {
        source: 'manual_reconcile',
        eventType: 'manual_reconcile',
        sessionId: sessionId ?? null,
        subscriptionId: subscription.id,
        strategy: 'request_or_active_workspace',
        requestedWorkspaceId: requestedWorkspaceId ?? null,
        metadataWorkspaceId: metadataWorkspaceId ?? null,
      });
      return jsonFailure({
        status: 409,
        code: 'WORKSPACE_RESOLUTION_FAILED',
        message: 'Could not resolve workspace for the current user.',
        build,
      });
    }
    if (metadataWorkspaceId && metadataWorkspaceId !== workspaceId) {
      return jsonFailure({
        status: 409,
        code: 'WORKSPACE_METADATA_MISMATCH',
        message: 'Requested workspace does not match Stripe metadata.workspace_id.',
        build,
        debug: {
          workspaceId,
          metadataWorkspaceId,
        },
      });
    }

    // P0-B: Enforce workspace membership before ANY billing write.
    // The current user must be the owner or an explicit member of the resolved
    // workspace. We check both the workspaces table (owner) and workspace_members
    // (team members). Without this check, any authenticated user could reconcile
    // a Stripe subscription to an arbitrary workspaceId in metadata.
    const membership = await sql<{ user_id: string }[]>`
      select user_id from public.workspaces
      where id = ${workspaceId} and owner_user_id = ${userId}
      union all
      select user_id from public.workspace_members
      where workspace_id = ${workspaceId} and user_id = ${userId}
      limit 1
    `;

    if (membership.length === 0) {
      console.warn('[stripe reconcile] membership mismatch', {
        userId,
        workspaceId,
        strategy: 'request_or_active_workspace',
        requestedWorkspaceId: requestedWorkspaceId ?? null,
        metadataWorkspaceId: metadataWorkspaceId ?? null,
      });
      return jsonFailure({
        status: 403,
        code: 'WORKSPACE_MEMBERSHIP_MISMATCH',
        message: 'You are not a member of the workspace associated with this Stripe object.',
        build,
      });
    }

    // P0-B continued: if the Stripe customer is already bound to a *different*
    // workspace, this is ambiguous \u2014 reject rather than silently overwrite.
    const customerId = parseStripeId(subscription.customer);
    if (customerId) {
      const existingBinding = await sql<{ workspace_id: string }[]>`
        select workspace_id from public.workspace_billing
        where stripe_customer_id = ${customerId}
          and workspace_id != ${workspaceId}
        limit 1
      `.catch(() => [] as { workspace_id: string }[]);

      if (existingBinding.length > 0) {
        return jsonFailure({
          status: 409,
          code: 'STRIPE_OBJECT_AMBIGUOUS',
          message: 'This Stripe customer is already bound to a different workspace. Contact support.',
          build,
          debug: process.env.NODE_ENV === 'development'
            ? { customerId, conflictingWorkspaceId: existingBinding[0]?.workspace_id }
            : undefined,
        });
      }
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
    const normalizedWorkspaceId = workspaceId.trim();
    const normalizedRequestedPlan = requestedPlan.trim().toLowerCase();
    const normalizedUserId = userId.trim();

    if (!normalizedWorkspaceId || !normalizedUserId) {
      return jsonFailure({
        status: 409,
        code: 'WORKSPACE_RESOLUTION_FAILED',
        message: 'Could not resolve workspace/user context for plan sync.',
        build,
      });
    }

    if (!normalizedRequestedPlan) {
      return jsonFailure({
        status: 422,
        code: 'PLAN_RESOLUTION_FAILED',
        message: 'Could not resolve paid plan for plan sync.',
        build,
      });
    }

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
      workspaceId: normalizedWorkspaceId,
      userId: normalizedUserId,
      plan: normalizedRequestedPlan,
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
      workspaceId: normalizedWorkspaceId,
      userId: normalizedUserId,
    });
    const workspacePlan = normalizePlan(sync.readback.workspacePlan);
    const userPlan = normalizePlan(sync.readback.userPlan);
    const normalizedRequestedPlanForCompare = normalizePlan(normalizedRequestedPlan);
    const effective =
      canonical.source === 'workspace_billing.plan'
        ? workspacePlan === normalizedRequestedPlanForCompare
        : userPlan === normalizedRequestedPlanForCompare;

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
      status: 409,
      code: 'RECONCILE_FAILED',
      message: 'Reconcile failed before plan sync could be completed.',
      build,
      debug:
        process.env.NODE_ENV === 'development'
          ? error instanceof Error
            ? { message, stack: error.stack ?? null }
            : { error: String(error) }
          : undefined,
    });
  }
}
