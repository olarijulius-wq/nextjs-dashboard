import type { Metadata } from 'next';
import TopNav from '@/app/ui/marketing/top-nav';
import PublicFooter from '@/app/ui/marketing/public-footer';
import { FAQ_ITEMS } from '@/app/lib/seo/faq';
import { getFaqPageJsonLd } from '@/app/lib/seo/jsonld';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Frequently asked questions about invoicing, reminders, Stripe payouts, and plan limits in Lateless.',
  alternates: {
    canonical: '/faq',
  },
  openGraph: {
    title: 'Lateless FAQ',
    description:
      'Frequently asked questions about invoicing, reminders, Stripe payouts, and plan limits in Lateless.',
    url: '/faq',
  },
};

export default function FaqPage() {
  const faqJsonLd = getFaqPageJsonLd(FAQ_ITEMS);

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
        <h1 className="text-3xl font-semibold text-white">FAQ</h1>
        <div className="mt-8 space-y-6">
          {FAQ_ITEMS.map((item) => (
            <section key={item.question} className="rounded-2xl border border-neutral-800 bg-neutral-900/45 p-5">
              <h2 className="text-base font-medium text-white">{item.question}</h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-300">{item.answer}</p>
            </section>
          ))}
        </div>
      </main>
      <PublicFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </div>
  );
}
