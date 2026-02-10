import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import SideNav from '@/app/ui/dashboard/sidenav';
import postgres from 'postgres';
import Link from 'next/link';
import ConnectStripeButton from '@/app/dashboard/settings/connect-stripe-button';
import { fetchStripeConnectStatusForUser } from '@/app/lib/data';
import ResendVerificationButton from './resend-verification-button';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }
  const email = normalizeEmail(session.user.email);
  const [user] = await sql<{ is_verified: boolean | null }[]>`
    select is_verified
    from users
    where lower(email) = ${email}
    limit 1
  `;
  const connectStatus = await fetchStripeConnectStatusForUser(email);
  const isVerified = Boolean(user?.is_verified);

  return (
    <div className="flex h-screen flex-col bg-transparent md:flex-row md:overflow-hidden">
      <div className="w-full flex-none border-b border-neutral-200 bg-white md:w-64 md:border-b-0 md:border-r md:border-neutral-200 md:bg-white dark:md:border-neutral-800 dark:md:bg-black">
        <SideNav />
      </div>
      <main className="grow p-6 md:overflow-y-auto md:p-12">
        <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-neutral-200 bg-white p-8 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_22px_60px_rgba(2,6,23,0.55)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Onboarding
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Get your workspace ready
          </h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Complete these steps to finish setup.
          </p>

          <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Step A
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              Connect Stripe payouts
            </h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              {connectStatus.isReadyForTransfers
                ? 'Payouts are active.'
                : connectStatus.hasAccount
                  ? 'Your Connect account exists, but onboarding is not complete yet.'
                  : 'Connect Stripe to receive payouts.'}
            </p>
            <div className="mt-3">
              {connectStatus.isReadyForTransfers ? (
                <a
                  href="/api/stripe/connect-login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white dark:bg-white dark:text-black dark:hover:bg-neutral-100 dark:focus-visible:ring-offset-black"
                >
                  Open Stripe dashboard
                </a>
              ) : (
                <ConnectStripeButton
                  label={connectStatus.hasAccount ? 'Continue Stripe onboarding' : 'Connect Stripe payouts'}
                />
              )}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Step B
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              Verify your email
            </h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              {isVerified
                ? `Email verified: ${email}`
                : `Email not verified yet: ${email}`}
            </p>
            {!isVerified ? (
              <div className="mt-3">
                <ResendVerificationButton email={email} />
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Step C
            </p>
            <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              Done
            </h2>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              Go to your dashboard when you are ready.
            </p>
            <div className="mt-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-white dark:bg-white dark:text-black dark:hover:bg-neutral-100 dark:focus-visible:ring-offset-black"
              >
                Go to dashboard
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
