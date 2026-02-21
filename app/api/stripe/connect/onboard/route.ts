import { NextResponse } from 'next/server';
import postgres from 'postgres';
import Stripe from 'stripe';
import { requireUserEmail } from '@/app/lib/data';
import { checkConnectedAccountAccess } from '@/app/lib/stripe-connect';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const STRIPE_CONFIG_INVALID = 'STRIPE_CONFIG_INVALID';
const STRIPE_CONNECT_ACCOUNTS_CREATE_FAILED = 'STRIPE_CONNECT_ACCOUNTS_CREATE_FAILED';

type StripeErrorDetails = {
  type: string | null;
  code: string | null;
  param: string | null;
  message: string | null;
  rawMessage: string | null;
  rawCode: string | null;
  requestId: string | null;
};

class StripeConnectAccountsCreateError extends Error {
  readonly causeError: unknown;

  constructor(causeError: unknown) {
    super('Stripe connected account creation failed.');
    this.causeError = causeError;
  }
}

function buildStamp() {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown';
}

function getStripeConfigInvalidReason() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!secretKey) return 'Missing STRIPE_SECRET_KEY';

  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (
    isProduction &&
    !secretKey.startsWith('sk_live_')
  ) {
    return 'STRIPE_SECRET_KEY is not a live key in production (expected sk_live_)';
  }

  const connectMode = (process.env.STRIPE_CONNECT_MODE ?? '').trim();
  if (!connectMode) return 'Missing STRIPE_CONNECT_MODE; set account_links';
  if (connectMode !== 'account_links') {
    return 'STRIPE_CONNECT_MODE must be account_links';
  }

  return null;
}

function stripeConfigInvalidResponse(message: string, status = 500) {
  const build = buildStamp();
  if (process.env.NODE_ENV === 'development') {
    console.warn('[stripe-connect/onboard] STRIPE_CONFIG_INVALID', {
      message,
      build,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      code: STRIPE_CONFIG_INVALID,
      message,
      build,
      env: {
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV ?? null,
      },
    },
    { status },
  );
}

function initStripeClient() {
  try {
    return new Stripe(process.env.STRIPE_SECRET_KEY as string);
  } catch {
    return null;
  }
}

function extractStripeErrorDetails(error: unknown): StripeErrorDetails {
  const stripeError = error as {
    type?: string;
    code?: string;
    param?: string;
    message?: string;
    requestId?: string;
    raw?: {
      message?: string;
      code?: string;
      requestId?: string;
    };
    rawType?: string;
  } | null;

  return {
    type: stripeError?.type ?? stripeError?.rawType ?? null,
    code: stripeError?.code ?? stripeError?.raw?.code ?? null,
    param: stripeError?.param ?? null,
    message: stripeError?.message ?? null,
    rawMessage: stripeError?.raw?.message ?? null,
    rawCode: stripeError?.raw?.code ?? null,
    requestId: stripeError?.requestId ?? stripeError?.raw?.requestId ?? null,
  };
}

function summarizeStripeConnectAccountsCreateFailure(message: string | null) {
  const normalized = (message ?? '').toLowerCase();
  if (
    normalized.includes('responsibilit') ||
    (normalized.includes('connect') && normalized.includes('setup'))
  ) {
    return 'Stripe Connect setup incomplete in Dashboard (acknowledge responsibilities). Go to Settings → Connect → Platform setup and acknowledge responsibilities for losses/onboarding.';
  }
  return message ?? 'Failed to create Stripe Connect account.';
}

export async function POST(req: Request) {
  const build = buildStamp();
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

  const configReason = getStripeConfigInvalidReason();
  if (configReason) {
    return stripeConfigInvalidResponse(configReason);
  }

  const stripe = initStripeClient();
  if (!stripe) {
    return stripeConfigInvalidResponse('Stripe client init failed');
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
      let createdAccountId: string | null = null;
      try {
        const account = await stripe.accounts.create({
          type: 'express',
          email: userEmail,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        createdAccountId = account.id;
      } catch (createError) {
        throw new StripeConnectAccountsCreateError(createError);
      }
      accountId = createdAccountId;

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

    return NextResponse.json({ ok: true, url: accountLink.url, build });
  } catch (err: unknown) {
    if (err instanceof StripeConnectAccountsCreateError) {
      const details = extractStripeErrorDetails(err.causeError);
      const stripeMessage = details.rawMessage ?? details.message;
      const message = summarizeStripeConnectAccountsCreateFailure(stripeMessage);

      console.error('Stripe Connect accounts.create failed', {
        code: STRIPE_CONNECT_ACCOUNTS_CREATE_FAILED,
        userEmail,
        mode,
        reconnectRequested,
        stripe: details,
      });

      return NextResponse.json(
        {
          ok: false,
          code: STRIPE_CONNECT_ACCOUNTS_CREATE_FAILED,
          message,
          build,
          stripe: {
            type: details.type,
            code: details.code,
            message: stripeMessage,
            requestId: details.requestId,
          },
        },
        { status: 400 },
      );
    }

    console.error('Error creating Stripe Connect onboarding link', err);
    return NextResponse.json({
      ok: false,
      error: `Failed to start onboarding in ${mode} mode.`,
      build,
    }, { status: 500 });
  }
}
