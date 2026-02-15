import { Metadata } from 'next';
import {
  fetchStripeConnectStatusForUser,
  requireUserEmail,
} from '@/app/lib/data';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import ConnectStripeButton from '../connect-stripe-button';
import { primaryButtonClasses } from '@/app/ui/button';
import ResyncConnectStatusButton from './resync-connect-status-button';
import { checkConnectedAccountAccess } from '@/app/lib/stripe-connect';

export const metadata: Metadata = {
  title: 'Payouts',
};

export default async function PayoutsPage() {
  const email = await requireUserEmail();
  const context = await ensureWorkspaceContextForCurrentUser();
  const userRole = context.userRole;
  const status = await fetchStripeConnectStatusForUser(email);
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ?? false;
  const modeLabel = isTest ? 'Test' : 'Live';
  const showStripeDebug =
    process.env.NODE_ENV !== 'production' &&
    process.env.DEBUG_STRIPE_UI === 'true' &&
    userRole === 'owner';
  let retrieveStatus: string | null = null;

  if (showStripeDebug && status.accountId) {
    const accessCheck = await checkConnectedAccountAccess(status.accountId);
    retrieveStatus = accessCheck.ok
      ? 'ok'
      : `failed (${accessCheck.isModeMismatch ? 'mode/account mismatch' : accessCheck.message})`;
  }

  const statusPill =
    status.isReadyForTransfers
      ? {
          label: 'Payouts active',
          className:
            'border border-emerald-300 bg-emerald-200 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300',
        }
      : status.hasAccount
        ? {
            label: 'Connected, not fully enabled',
            className:
              'border border-amber-300 bg-amber-200 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
          }
        : {
            label: 'No connected account',
            className:
              'border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-300',
          };

  return (
    <div className="w-full max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">
        Payouts
      </h1>

      {!status.hasAccount ? (
        <div className="space-y-4">
          {showStripeDebug && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <p>
                <strong>Debug</strong> Key mode: {modeLabel.toLowerCase()}
              </p>
              <p>Connected account: {status.accountId ?? 'none'}</p>
              <p>accounts.retrieve: {retrieveStatus ?? 'not checked'}</p>
            </div>
          )}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_16px_30px_rgba(0,0,0,0.45)]">
            <div className="mb-3">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusPill.className}`}
              >
                {statusPill.label}
              </span>
            </div>
            <p className="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
              No Connect account yet. Connect Stripe to receive payouts.
            </p>
            <ConnectStripeButton label="Connect Stripe" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {showStripeDebug && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <p>
                <strong>Debug</strong> Key mode: {modeLabel.toLowerCase()}
              </p>
              <p>Connected account: {status.accountId ?? 'none'}</p>
              <p>accounts.retrieve: {retrieveStatus ?? 'not checked'}</p>
            </div>
          )}
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_16px_30px_rgba(0,0,0,0.45)]">
            <div className="mb-3">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusPill.className}`}
              >
                {statusPill.label}
              </span>
            </div>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              {status.isReadyForTransfers
                ? 'Payouts enabled. You can receive payouts to your connected Stripe account.'
                : 'Connect account created, but payouts not fully enabled yet. Finish onboarding in Stripe.'}
            </p>
          </div>

          <a
            href="/api/stripe/connect-login"
            className={`${primaryButtonClasses} w-full`}
          >
            Open Stripe payouts dashboard
          </a>

          {!status.isReadyForTransfers ? (
            <ConnectStripeButton label="Continue Stripe onboarding" />
          ) : null}
          <ConnectStripeButton
            label="Reconnect Stripe"
            path="/api/stripe/connect/onboard?reconnect=1"
          />
          <ResyncConnectStatusButton />
        </div>
      )}
    </div>
  );
}
