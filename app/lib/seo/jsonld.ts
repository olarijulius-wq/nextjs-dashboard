import { getAbsoluteUrl } from '@/app/lib/seo/site-url';
import { PLAN_CONFIG, PLAN_IDS } from '@/app/lib/config';

const DEFAULT_DESCRIPTION =
  'Lateless helps freelancers and small teams send invoices, collect Stripe payments, and automate reminders.';

export function getOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Lateless',
    url: getAbsoluteUrl('/'),
    logo: getAbsoluteUrl('/icon.png'),
  };
}

export function getSoftwareApplicationJsonLd({
  name = 'Lateless',
  description = DEFAULT_DESCRIPTION,
  url = getAbsoluteUrl('/'),
}: {
  name?: string;
  description?: string;
  url?: string;
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    url,
    operatingSystem: 'Web',
    applicationCategory: 'BusinessApplication',
  };
}

export function getPricingProductJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Lateless',
    description: DEFAULT_DESCRIPTION,
    brand: {
      '@type': 'Organization',
      name: 'Lateless',
    },
    offers: PLAN_IDS.map((planId) => {
      const plan = PLAN_CONFIG[planId];
      return {
        '@type': 'Offer',
        name: plan.name,
        price: plan.priceMonthlyEuro,
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: getAbsoluteUrl('/pricing'),
        category: 'Subscription',
      };
    }),
  };
}

export type FaqItem = {
  question: string;
  answer: string;
};

export function getFaqPageJsonLd(faqs: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}
