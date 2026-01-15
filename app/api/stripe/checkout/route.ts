// app/api/stripe/checkout/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/app/lib/stripe';
import { auth } from '@/auth';
import {
  STRIPE_PRICE_ID_BY_PLAN,
  normalizePlan,
  type PlanId,
} from '@/app/lib/config';

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const normalizedEmail = session.user.email.trim().toLowerCase();

  const url = new URL(req.url);
  let requestedPlan = url.searchParams.get('plan')?.trim().toLowerCase() ?? '';

  if (!requestedPlan) {
    try {
      const body = (await req.json()) as { plan?: string };
      requestedPlan = body?.plan?.trim().toLowerCase() ?? '';
    } catch {
      requestedPlan = '';
    }
  }

  const normalizedPlan = normalizePlan(requestedPlan);
  const plan: PlanId = requestedPlan ? normalizedPlan : 'pro';

  if (requestedPlan && normalizedPlan === 'free') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  if (plan === 'free') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const priceId = STRIPE_PRICE_ID_BY_PLAN[plan];
  if (!priceId) {
    return NextResponse.json(
      { error: `Missing Stripe price for plan: ${plan}` },
      { status: 500 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],

      // seome kasutajaga emaili kaudu
      customer_email: normalizedEmail,
      metadata: {
        userEmail: normalizedEmail,
        userId: (session.user as { id?: string }).id ?? '',
        plan,
      },
      subscription_data: {
        metadata: {
          userEmail: normalizedEmail,
          userId: (session.user as { id?: string }).id ?? '',
          plan,
        },
      },

      success_url: `${baseUrl}/dashboard/settings?success=1`,
      cancel_url: `${baseUrl}/dashboard/settings?canceled=1`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Stripe error' },
      { status: 500 },
    );
  }
}
