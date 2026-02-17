import Link from 'next/link';
import {
  LEGAL_LAST_UPDATED,
  PRIVACY_EMAIL,
  SUPPORT_EMAIL,
} from '@/app/legal/constants';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Privacy Policy</h1>
          <p className="mt-3 text-sm text-neutral-400">
            Last updated: {LEGAL_LAST_UPDATED}
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-base font-medium text-white">What we process</h2>
            <p className="mt-2">
              We process account details, workspace and invoicing data, payment and
              billing metadata, and operational security logs needed to run Lateless.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Why we process it</h2>
            <p className="mt-2">
              We use data to provide the service, secure accounts, process invoices
              and payouts, prevent abuse, and meet legal and accounting duties.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Legal bases</h2>
            <p className="mt-2">
              Our legal bases are contract performance, legitimate interests
              (security, fraud prevention, product operation), and legal obligation.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Processors</h2>
            <p className="mt-2">
              We use third-party processors including Stripe (payments and billing)
              and Resend (transactional email delivery).
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Retention</h2>
            <p className="mt-2">
              We retain personal data only as long as needed for service delivery,
              account security, legal compliance, and dispute handling.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Your rights</h2>
            <p className="mt-2">
              Depending on your location, you may request access, correction,
              deletion, restriction, portability, or objection to processing.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Contact</h2>
            <p className="mt-2">
              For privacy requests, contact{' '}
              <a href={`mailto:${PRIVACY_EMAIL}`} className="text-white hover:underline">
                {PRIVACY_EMAIL}
              </a>
              .
            </p>
            <p className="mt-2">
              For account or support issues, contact{' '}
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
      </div>
    </main>
  );
}
