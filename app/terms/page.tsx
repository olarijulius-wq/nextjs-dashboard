import Link from 'next/link';
import type { Metadata } from 'next';
import { LEGAL_LAST_UPDATED } from '@/app/legal/constants';
import TopNav from '@/app/ui/marketing/top-nav';
import PublicFooter from '@/app/ui/marketing/public-footer';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Lateless terms of service for use, billing, and cancellation.',
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: 'Lateless Terms of Service',
    description: 'Lateless terms of service for use, billing, and cancellation.',
    url: '/terms',
  },
};

export default function TermsPage() {
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
          <h1 className="mt-2 text-3xl font-semibold text-white">Terms of Service</h1>
          <p className="mt-3 text-sm text-neutral-400">Last updated: {LEGAL_LAST_UPDATED}</p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-base font-medium text-white">Service</h2>
            <p className="mt-2">
              Lateless provides invoicing, reminder automation, and payment workflow tooling for businesses and independent professionals.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Billing</h2>
            <p className="mt-2">
              Paid plans renew on a recurring basis unless canceled. Fees are billed through Stripe under the plan and pricing terms shown at purchase.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Cancellation</h2>
            <p className="mt-2">
              You can cancel at any time. Access to paid features continues through the current billing period unless otherwise required by law.
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
