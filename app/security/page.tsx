import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/app/legal/constants';
import { lusitana } from '@/app/ui/fonts';
import type { Metadata } from 'next';
import TopNav from '@/app/ui/marketing/top-nav';
import PublicFooter from '@/app/ui/marketing/public-footer';

export const metadata: Metadata = {
  title: 'Security',
  description: 'Security controls currently implemented in Lateless.',
  alternates: {
    canonical: '/security',
  },
  openGraph: {
    title: 'Lateless Security',
    description: 'Security controls currently implemented in Lateless.',
    url: '/security',
  },
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-black"
      >
        Skip to content
      </a>
      <TopNav />
      <main id="main-content" className="mx-auto w-full max-w-3xl px-6 py-16">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">
            Trust
          </p>
          <h1 className={`${lusitana.className} mt-2 text-4xl text-white sm:text-5xl`}>
            Security
          </h1>
          <p className="mt-3 text-sm text-neutral-400">
            Concrete controls currently implemented in this repository.
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-base font-medium text-white">Authentication</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Email/password accounts require email verification before login.</li>
              <li>Passwords and one-time 2FA codes are hashed with bcrypt.</li>
              <li>Optional 2FA is supported with emailed 6-digit OTP codes.</li>
              <li>Google and GitHub OAuth are available when provider env vars are configured.</li>
              <li>Login attempts are rate-limited and failed attempts are tracked.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Payments</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Public invoice payments use Stripe Checkout sessions.</li>
              <li>Payouts run through Stripe Connect connected accounts.</li>
              <li>Platform fees are applied as Stripe application fees when configured by plan.</li>
              <li>Stripe webhooks validate the signature using `STRIPE_WEBHOOK_SECRET`.</li>
              <li>Webhook events are deduplicated by unique Stripe event ID before processing.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Data handling</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Application data is stored in Postgres.</li>
              <li>Sensitive credentials are loaded from environment variables.</li>
              <li>Workspace SMTP passwords are encrypted at rest (AES-256-GCM) when saved.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Operational safety</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Webhook processing is idempotent via event-level deduplication.</li>
              <li>Refund creation uses Stripe idempotency keys to avoid duplicate refunds.</li>
              <li>Basic abuse controls include login throttling and invoice creation safety limits.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Contact</h2>
            <p className="mt-2">
              Security questions and reports:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white hover:underline">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-neutral-900 pt-6 text-sm text-neutral-400">
          <Link href="/" className="hover:text-white">
            Back to homepage
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
