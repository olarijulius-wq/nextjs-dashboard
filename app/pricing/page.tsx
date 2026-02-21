import Link from 'next/link';
import type { Metadata } from 'next';
import { PLAN_CONFIG, PLAN_IDS } from '@/app/lib/config';
import TopNav from '@/app/ui/marketing/top-nav';
import PublicFooter from '@/app/ui/marketing/public-footer';
import { getPricingProductJsonLd } from '@/app/lib/seo/jsonld';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Transparent Lateless pricing for freelancers and teams. Monthly plans, monthly usage reset, and persistent invoice history.',
  alternates: {
    canonical: '/pricing',
  },
  openGraph: {
    title: 'Lateless Pricing',
    description:
      'Transparent Lateless pricing for freelancers and teams. Monthly plans, monthly usage reset, and persistent invoice history.',
    url: '/pricing',
  },
};

function formatLimit(maxPerMonth: number) {
  return Number.isFinite(maxPerMonth)
    ? `Up to ${maxPerMonth} invoices / month`
    : 'Unlimited invoices / month';
}

export default function PricingPage() {
  const pricingJsonLd = getPricingProductJsonLd();

  return (
    <div className="min-h-screen bg-black text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-black"
      >
        Skip to content
      </a>
      <TopNav />
      <main id="main-content" className="mx-auto w-full max-w-6xl px-6 py-16">
        <h1 className="text-4xl font-semibold text-white">Pricing</h1>
        <p className="mt-3 max-w-2xl text-sm text-neutral-300">
          Choose a plan that matches your invoice volume. Limits reset monthly, and your invoice history stays available.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-4">
          {PLAN_IDS.map((planId) => {
            const plan = PLAN_CONFIG[planId];
            return (
              <section
                key={plan.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6"
              >
                <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
                <p className="mt-2 text-3xl font-semibold text-white">€{plan.priceMonthlyEuro}</p>
                <p className="text-xs text-neutral-400">per month</p>
                <ul className="mt-5 space-y-2 text-sm text-neutral-300">
                  <li>{formatLimit(plan.maxPerMonth)}</li>
                  <li>Resets monthly</li>
                  <li>Invoice history persists</li>
                  <li>
                    Platform fee: €{(plan.platformFeeFixedCents / 100).toFixed(2)} + {plan.platformFeePercent.toFixed(1)}%
                  </li>
                </ul>
                <Link
                  href={`/login?plan=${plan.id}&interval=monthly`}
                  className="mt-6 inline-flex rounded-full border border-white bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200"
                >
                  Start with {plan.name}
                </Link>
              </section>
            );
          })}
        </div>
      </main>
      <PublicFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
    </div>
  );
}
