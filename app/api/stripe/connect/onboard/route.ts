import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { stripe } from '@/app/lib/stripe';
import { requireUserEmail } from '@/app/lib/data';
import { checkConnectedAccountAccess } from '@/app/lib/stripe-connect';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function POST(req: Request) {
  let userEmail = '';
  try {
    userEmail = await requireUserEmail();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');
  const payoutsUrl = `${baseUrl}/dashboard/settings/payouts`;
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ?? false;
  const mode = isTest ? 'test' : 'live';
  const reconnectRequested =
    new URL(req.url).searchParams.get('reconnect') === '1';

  try {
    const [user] = await sql<
      { id: string; stripe_connect_account_id: string | null }[]
    >`
      select id, stripe_connect_account_id
      from public.users
      where lower(email) = ${userEmail}
      limit 1
    `;

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let accountId = user.stripe_connect_account_id ?? null;
    let shouldCreateNewAccount = reconnectRequested || !accountId;

    if (accountId && !reconnectRequested) {
      const accessCheck = await checkConnectedAccountAccess(accountId);
      if (accessCheck.ok) {
        await stripe.accounts.update(accountId, {
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
      } else if (accessCheck.isModeMismatch) {
        shouldCreateNewAccount = true;
      } else {
        throw new Error(accessCheck.message);
      }
    }

    if (shouldCreateNewAccount) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: userEmail,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;

      await sql`
        update public.users
        set
          stripe_connect_account_id = ${accountId},
          stripe_connect_payouts_enabled = false,
          stripe_connect_details_submitted = false
        where lower(email) = ${userEmail}
      `;
    }

    if (!accountId) {
      throw new Error(`Failed to resolve a Stripe Connect account in ${mode} mode.`);
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      refresh_url: payoutsUrl,
      return_url: payoutsUrl,
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err: any) {
    console.error('Error creating Stripe Connect onboarding link', err);
    return NextResponse.json(
      {
        error:
          err?.message ??
          `Failed to start onboarding in ${mode} mode.`,
      },
      { status: 500 },
    );
  }
}
