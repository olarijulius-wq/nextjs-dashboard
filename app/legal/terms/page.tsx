import Link from 'next/link';
import { LEGAL_LAST_UPDATED } from '@/app/legal/constants';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Terms of Service</h1>
          <p className="mt-3 text-sm text-neutral-400">
            Last updated: {LEGAL_LAST_UPDATED}
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-base font-medium text-white">Service</h2>
            <p className="mt-2">
              Lateless provides invoicing, reminder automation, and payment workflow
              tooling for businesses and independent professionals.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Billing</h2>
            <p className="mt-2">
              Paid plans renew on a recurring basis unless canceled. Fees are billed
              through Stripe under the plan and pricing terms shown at purchase.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Acceptable use</h2>
            <p className="mt-2">
              You agree not to use the service for fraud, abuse, unlawful activity,
              or attempts to disrupt Lateless systems or other users.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Limitations</h2>
            <p className="mt-2">
              The service is provided on an as-available basis. To the extent
              permitted by law, liability is limited to fees paid for the service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Cancellation</h2>
            <p className="mt-2">
              You can cancel at any time. Access to paid features continues through
              the current billing period unless otherwise required by law.
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-neutral-900 pt-6 text-sm text-neutral-400">
          <Link href="/" className="hover:text-white">
            Back to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
