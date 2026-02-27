// app/api/stripe/portal/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/app/lib/stripe';
import { auth } from '@/auth';
import postgres from 'postgres';
import {
  assertStripeConfig,
  normalizeStripeConfigError,
} from '@/app/lib/stripe-guard';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { insertBillingEvent } from '@/app/lib/billing-dunning';
import { enforceRateLimit } from '@/app/lib/security/api-guard';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = session.user.email.trim().toLowerCase();

  const rl = await enforceRateLimit(
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
    workspaceId = null;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

  try {
    assertStripeConfig();

    // Võtame olemasoleva customer_id, kui on
    const rows = await sql<{ stripe_customer_id: string | null }[]>`
      select stripe_customer_id
      from public.users
      where lower(email) = ${email}
      limit 1
    `;

    let customerId = rows[0]?.stripe_customer_id ?? null;

    if (!customerId) {
      // Kui veel pole Stripe customer'it, loome
      const customer = await stripe.customers.create({
        email,
        metadata: workspaceId
          ? { workspace_id: workspaceId }
          : {},
      });
      customerId = customer.id;

      await sql`
        update public.users
        set stripe_customer_id = ${customerId}
        where lower(email) = ${email}
      `;
    }

    const portalSession = await stripe.billingPortal.sessions.create({
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
