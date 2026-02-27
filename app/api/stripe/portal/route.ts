// app/api/stripe/portal/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/app/lib/stripe';
import { auth } from '@/auth';
import {
  assertStripeConfig,
  normalizeStripeConfigError,
} from '@/app/lib/stripe-guard';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { insertBillingEvent } from '@/app/lib/billing-dunning';
import { enforceRateLimit } from '@/app/lib/security/api-guard';
import { resolveBillingContext, upsertWorkspaceBilling } from '@/app/lib/workspace-billing';
const TEST_HOOKS_ENABLED =
  process.env.NODE_ENV === 'test' && process.env.LATELLESS_TEST_MODE === '1';
export const __testHooksEnabled = TEST_HOOKS_ENABLED;
export const __testHooks = {
  authOverride: null as (null | (() => Promise<{ user?: { email?: string | null } | null } | null>)),
  ensureWorkspaceContextOverride: null as
    | (null | (() => Promise<{ workspaceId: string }>)),
  enforceRateLimitOverride: null as
    | (null | ((req: Request, input: {
      bucket: string;
      windowSec: number;
      ipLimit: number;
      userLimit: number;
    }, opts: { userKey: string; failClosed: boolean }) => Promise<Response | null>)),
  createCustomerOverride: null as
    | (null | ((input: { email: string; metadata: Record<string, string> }) => Promise<{ id: string }>)),
  createPortalSessionOverride: null as
    | (null | ((input: { customer: string; return_url: string }) => Promise<{ url: string | null }>)),
  assertStripeConfigOverride: null as null | (() => void),
  onResolvedPortalCustomerId: null as null | ((customerId: string) => void),
};

export async function POST(req: Request) {
  const session = TEST_HOOKS_ENABLED
    ? (__testHooks.authOverride ? await __testHooks.authOverride() : await auth())
    : await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email.trim().toLowerCase();

  const rl = TEST_HOOKS_ENABLED
    ? (__testHooks.enforceRateLimitOverride
      ? await __testHooks.enforceRateLimitOverride(
        req,
        {
          bucket: 'stripe_portal',
          windowSec: 300,
          ipLimit: 10,
          userLimit: 5,
        },
        { userKey: email, failClosed: true },
      )
      : await enforceRateLimit(
        req,
        {
          bucket: 'stripe_portal',
          windowSec: 300,
          ipLimit: 10,
          userLimit: 5,
        },
        { userKey: email, failClosed: true },
      ))
    : await enforceRateLimit(
      req,
      {
        bucket: 'stripe_portal',
        windowSec: 300,
        ipLimit: 10,
        userLimit: 5,
      },
      { userKey: email, failClosed: true },
    );
  if (rl) return rl;

  let workspaceId: string | null = null;
  try {
    const workspaceContext = await ensureWorkspaceContextForCurrentUser();
    workspaceId = workspaceContext.workspaceId;
  } catch {
    if (TEST_HOOKS_ENABLED && __testHooks.ensureWorkspaceContextOverride) {
      try {
        const overrideContext = await __testHooks.ensureWorkspaceContextOverride();
        workspaceId = overrideContext.workspaceId;
      } catch {
        workspaceId = null;
      }
    } else {
      workspaceId = null;
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

  try {
    if (TEST_HOOKS_ENABLED && __testHooks.assertStripeConfigOverride) {
      __testHooks.assertStripeConfigOverride();
    } else {
      assertStripeConfig();
    }

    let customerId =
      (
        await resolveBillingContext({
          workspaceId: workspaceId ?? '',
          userEmail: email,
        })
      ).stripeCustomerId;

    if (!customerId) {
      // Kui veel pole Stripe customer'it, loome
      const customer = TEST_HOOKS_ENABLED && __testHooks.createCustomerOverride
        ? await __testHooks.createCustomerOverride({
          email,
          metadata: workspaceId
            ? { workspace_id: workspaceId }
            : {},
        })
        : await stripe.customers.create({
          email,
          metadata: workspaceId
            ? { workspace_id: workspaceId }
            : {},
        });
      customerId = customer.id;

      if (workspaceId) {
        await upsertWorkspaceBilling({
          workspaceId,
          plan: null,
          subscriptionStatus: null,
          stripeCustomerId: customerId,
          stripeSubscriptionId: null,
        });
      }
    }
    if (TEST_HOOKS_ENABLED && __testHooks.onResolvedPortalCustomerId) {
      __testHooks.onResolvedPortalCustomerId(customerId);
    }

    const portalSession = TEST_HOOKS_ENABLED && __testHooks.createPortalSessionOverride
      ? await __testHooks.createPortalSessionOverride({
        customer: customerId,
        return_url: `${baseUrl}/dashboard/settings`,
      })
      : await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/dashboard/settings`,
      });

    await insertBillingEvent({
      workspaceId,
      userEmail: email,
      eventType: 'portal.opened',
      stripeObjectId: customerId,
      status: null,
      meta: {
        returnUrl: `${baseUrl}/dashboard/settings`,
      },
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err: unknown) {
    const normalized = normalizeStripeConfigError(err);
    console.error('Error creating billing portal session', err);
    return NextResponse.json(
      {
        error: normalized.message,
        guidance: normalized.guidance,
        code: normalized.code,
      },
      { status: 500 },
    );
  }
}
