import Link from 'next/link';
import type { Metadata } from 'next';
import {
  LEGAL_LAST_UPDATED,
  PRIVACY_EMAIL,
  SUPPORT_EMAIL,
} from '@/app/legal/constants';
import TopNav from '@/app/ui/marketing/top-nav';
import PublicFooter from '@/app/ui/marketing/public-footer';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Lateless privacy policy and data handling overview.',
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    title: 'Lateless Privacy Policy',
    description: 'Lateless privacy policy and data handling overview.',
    url: '/privacy',
  },
};

export default function PrivacyPage() {
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
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Privacy Policy</h1>
          <p className="mt-3 text-sm text-neutral-400">Last updated: {LEGAL_LAST_UPDATED}</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-base font-medium text-white">What we process</h2>
            <p className="mt-2">
              We process account details, workspace and invoicing data, payment and billing metadata, and operational logs needed to run Lateless.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Why we process it</h2>
            <p className="mt-2">
              We use data to provide the service, secure accounts, process invoices and payouts, prevent abuse, and meet legal duties.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Processors</h2>
            <p className="mt-2">
              We use third-party processors including Stripe for payments and Resend for transactional email delivery.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Contact</h2>
            <p className="mt-2">
              Privacy requests: <a href={`mailto:${PRIVACY_EMAIL}`} className="text-white hover:underline">{PRIVACY_EMAIL}</a>
            </p>
            <p className="mt-2">
              Account support: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white hover:underline">{SUPPORT_EMAIL}</a>
            </p>
          </section>
        </div>

        <div className="mt-10 border-t border-neutral-900 pt-6 text-sm text-neutral-400">
          <Link href="/" className="hover:text-white">Back to homepage</Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
