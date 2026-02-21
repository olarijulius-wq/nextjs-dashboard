// app/api/stripe/checkout/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { stripe } from '@/app/lib/stripe';
import { auth } from '@/auth';
import {
  STRIPE_PRICE_ID_BY_PLAN_AND_INTERVAL,
  type BillingInterval,
  normalizePlan,
  type PlanId,
} from '@/app/lib/config';
import { logFunnelEvent } from '@/app/lib/funnel-events';
import {
  assertStripeConfig,
  normalizeStripeConfigError,
} from '@/app/lib/stripe-guard';
import {
  ensureWorkspaceContextForCurrentUser,
  fetchWorkspaceMembershipsForCurrentUser,
} from '@/app/lib/workspaces';

const checkoutParamsSchema = z.object({
  plan: z.string().trim().toLowerCase().optional(),
  interval: z.enum(['monthly', 'annual']).default('monthly'),
  workspaceId: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const normalizedEmail = session.user.email.trim().toLowerCase();

  const url = new URL(req.url);
  const queryPlan = url.searchParams.get('plan') ?? undefined;
  const queryInterval = url.searchParams.get('interval') ?? undefined;
  const queryWorkspaceId = url.searchParams.get('workspaceId') ?? undefined;
  let body: { plan?: string; interval?: BillingInterval; workspaceId?: string } = {};
  try {
    body = (await req.json()) as {
      plan?: string;
      interval?: BillingInterval;
      workspaceId?: string;
    };
  } catch {
    body = {};
  }
  const parsed = checkoutParamsSchema.safeParse({
    plan: queryPlan ?? body.plan,
    interval: queryInterval ?? body.interval,
    workspaceId: queryWorkspaceId ?? body.workspaceId,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid interval' }, { status: 400 });
  }

  const requestedPlan = parsed.data.plan ?? '';
  const interval = parsed.data.interval;
  const requestedWorkspaceId = parsed.data.workspaceId?.trim() || null;
  const userId = (session.user as { id?: string }).id ?? '';

  const normalizedPlan = normalizePlan(requestedPlan);
  const plan: PlanId = requestedPlan ? normalizedPlan : 'pro';

  if (requestedPlan && normalizedPlan === 'free') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  if (plan === 'free') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const priceId = STRIPE_PRICE_ID_BY_PLAN_AND_INTERVAL[plan][interval];
  if (!priceId) {
    return NextResponse.json(
      { error: `Missing Stripe price for plan: ${plan} (${interval})` },
      { status: 500 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

  try {
    let workspaceId = '';
    try {
      const workspaceContext = await ensureWorkspaceContextForCurrentUser();
      workspaceId = workspaceContext.workspaceId;

      if (requestedWorkspaceId) {
        const memberships = await fetchWorkspaceMembershipsForCurrentUser();
        if (memberships.some((membership) => membership.workspaceId === requestedWorkspaceId)) {
          workspaceId = requestedWorkspaceId;
        }
      }
    } catch {
      workspaceId = '';
    }

    assertStripeConfig();
    const allowPromotionCodes = process.env.STRIPE_ALLOW_PROMO_CODES === '1';

    await logFunnelEvent({
      userEmail: normalizedEmail,
      eventName: 'checkout_started',
      source: 'billing',
      meta: { plan, interval },
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],

      // seome kasutajaga emaili kaudu
      customer_email: normalizedEmail,
      metadata: {
        userEmail: normalizedEmail,
        userId,
        plan,
        interval,
        workspaceId,
      },
      subscription_data: {
        metadata: {
          userEmail: normalizedEmail,
          userId,
          plan,
          interval,
          workspaceId,
        },
      },

      success_url: `${baseUrl}/dashboard/settings?success=1`,
      cancel_url: `${baseUrl}/dashboard/settings?canceled=1`,
      ...(allowPromotionCodes ? { allow_promotion_codes: true } : {}),
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: unknown) {
    const normalized = normalizeStripeConfigError(err);
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
