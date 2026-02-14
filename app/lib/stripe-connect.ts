import type Stripe from 'stripe';
import { stripe } from '@/app/lib/stripe';

export const CONNECT_MODE_MISMATCH_MESSAGE =
  'Connected Stripe account belongs to a different mode/account. Reconnect payouts in the same Stripe mode as your API keys.';

export type StripeCardPaymentsCapability =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'unrequested'
  | string;

export type ConnectedAccountAccessCheck =
  | {
      ok: true;
      account: Stripe.Account;
    }
  | {
      ok: false;
      isModeMismatch: boolean;
      message: string;
    };

export function isStripePermissionOrNoAccessError(error: unknown): boolean {
  const stripeError = error as { type?: string; rawType?: string; message?: string } | null;
  const message = stripeError?.message ?? '';

  return (
    stripeError?.type === 'StripePermissionError' ||
    stripeError?.rawType === 'permission_error' ||
    /does not have access/i.test(message)
  );
}

export async function checkConnectedAccountAccess(
  connectedAccountId: string,
): Promise<ConnectedAccountAccessCheck> {
  try {
    const account = (await stripe.accounts.retrieve(
      connectedAccountId,
    )) as Stripe.Account;
    return { ok: true, account };
  } catch (error: unknown) {
    const stripeError = error as { message?: string } | null;
    const isModeMismatch = isStripePermissionOrNoAccessError(error);

    return {
      ok: false,
      isModeMismatch,
      message: stripeError?.message ?? 'Failed to retrieve connected Stripe account.',
    };
  }
}

export type StripeConnectChargeCapabilityStatus = {
  ok: boolean;
  cardPayments: StripeCardPaymentsCapability;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

export async function getConnectChargeCapabilityStatus(
  connectedAccountId: string,
): Promise<StripeConnectChargeCapabilityStatus> {
  const account = (await stripe.accounts.retrieve(
    connectedAccountId,
  )) as Stripe.Account;
  const cardPayments =
    account.capabilities?.card_payments ?? 'unrequested';
  const chargesEnabled = !!account.charges_enabled;
  const detailsSubmitted = !!account.details_submitted;
  const ok = cardPayments === 'active' && chargesEnabled;

  return {
    ok,
    cardPayments,
    chargesEnabled,
    detailsSubmitted,
  };
}
