import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import postgres from 'postgres';
import {
  fetchStripeConnectStatusForUser,
  requireUserEmail,
} from '@/app/lib/data';
import { stripe } from '@/app/lib/stripe';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export async function POST() {
  let userEmail = '';
  try {
    userEmail = await requireUserEmail();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [user] = await sql<
      { id: string; stripe_connect_account_id: string | null }[]
    >`
      select id, stripe_connect_account_id
      from public.users
      where lower(email) = ${userEmail}
      limit 1
    `;

    const accountId = user?.stripe_connect_account_id?.trim() || null;
    if (!accountId) {
      return NextResponse.json(
        { error: 'No connected account found.' },
        { status: 400 },
      );
    }

    const account = (await stripe.accounts.retrieve(accountId)) as Stripe.Account;
    const connectAccountId = account.id;
    const payoutsEnabled = !!account.payouts_enabled;
    const detailsSubmitted = !!account.details_submitted;
    console.log('[connect resync] Stripe account status', {
      accountId: connectAccountId,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    });

    const updated = await sql`
      update public.users
      set
        stripe_connect_account_id = ${connectAccountId},
        stripe_connect_payouts_enabled = ${payoutsEnabled},
        stripe_connect_details_submitted = ${detailsSubmitted}
      where id = ${user?.id ?? null}
      returning id
    `;

    if (updated.length === 0) {
      console.warn('[connect resync] No user row updated', {
        accountId: connectAccountId,
        userEmail,
      });
    }

    const status = await fetchStripeConnectStatusForUser(userEmail);
    return NextResponse.json({ ok: true, status });
  } catch (err: any) {
    console.error('Error resyncing Stripe Connect status', err);
    return NextResponse.json(
      { error: err?.message ?? 'Failed to re-sync status from Stripe.' },
      { status: 500 },
    );
  }
}
