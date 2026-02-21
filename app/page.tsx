import Link from 'next/link';
import type { Metadata } from 'next';
import {
  BILLING_INTERVALS,
  getAnnualPriceDisplay,
  getAnnualSavingsLabel,
  type BillingInterval,
  PLAN_CONFIG,
  PLAN_IDS,
} from '@/app/lib/config';
import { lusitana } from '@/app/ui/fonts';
import { RevealOnMount, RevealOnScroll } from '@/app/ui/motion/reveal';
import TopNav from '@/app/ui/marketing/top-nav';
import HeroVisual from '@/app/ui/marketing/hero-visual';
import { BUTTON_INTERACTIVE, CARD_INTERACTIVE } from '@/app/ui/theme/tokens';
import PublicFooter from '@/app/ui/marketing/public-footer';
import {
  getOrganizationJsonLd,
  getSoftwareApplicationJsonLd,
} from '@/app/lib/seo/jsonld';

export const metadata: Metadata = {
  title: 'Invoicing with Stripe Payments and Reminders',
  description:
    'Lateless helps freelancers, agencies, and consultants send invoices, collect Stripe payments, and automate reminders.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Lateless',
    description:
      'Send invoices, collect Stripe payments, and automate reminders without dashboard clutter.',
    url: '/',
  },
};

const primaryCtaClasses =
  `inline-flex items-center justify-center rounded-full border border-white bg-white px-5 py-2.5 text-sm font-medium text-black hover:bg-neutral-200 ${BUTTON_INTERACTIVE}`;

const secondaryCtaClasses =
  `inline-flex items-center justify-center rounded-full border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 hover:border-neutral-500 hover:text-white ${BUTTON_INTERACTIVE}`;

const planOrder = PLAN_IDS;

function formatLimit(maxPerMonth: number) {
  return Number.isFinite(maxPerMonth)
    ? `Up to ${maxPerMonth} invoices / month`
    : 'Unlimited invoices / month';
}

function formatPlatformFee(
  fixedCents: number,
  percent: number,
  capCents: number,
) {
  return `Platform fee: €${(fixedCents / 100).toFixed(2)} + ${percent.toFixed(1)}% (cap €${(capCents / 100).toFixed(2)}) per paid invoice`;
}

const features = [
  {
    title: 'Integrate this weekend',
    description:
      'Lateless is hosted and works with Stripe Checkout out of the box. No custom gateway implementation required.',
  },
  {
    title: 'Automated reminders',
    description:
      'Overdue invoices get follow-up emails on day 1, day 7, and day 21 with payment links included.',
  },
  {
    title: 'Late payer analytics',
    description:
      'Spot clients who consistently pay late and adjust terms before late payments hurt your cash flow.',
  },
  {
    title: 'Secure and privacy-conscious',
    description:
      'Passwords are hashed with bcrypt, optional 2FA is available, and Stripe handles all card data securely.',
  },
];

const workflowSteps = [
  {
    title: 'Create your workspace',
    description: 'Sign up, connect Stripe, and configure branding details.',
  },
  {
    title: 'Add customers and send invoices',
    description:
      'Create customers, issue invoices, and share one-click Pay now links.',
  },
  {
    title: 'Let Lateless handle the chasing',
    description:
      'Automatic reminders, late payer overviews, and revenue charts run in the background.',
  },
];

const useCases = ['Freelancer billing', 'Small agency invoicing', 'Consultant retainers'];

type HomePageProps = {
  searchParams?: Promise<{
    interval?: string;
  }>;
};

export default async function Page(props: HomePageProps) {
  const searchParams = await props.searchParams;
  const requestedInterval = searchParams?.interval?.trim().toLowerCase();
  const interval: BillingInterval = BILLING_INTERVALS.includes(
    requestedInterval as BillingInterval,
  )
    ? (requestedInterval as BillingInterval)
    : 'monthly';
  const organizationJsonLd = getOrganizationJsonLd();
  const softwareJsonLd = getSoftwareApplicationJsonLd();

  return (
    <div className="min-h-screen bg-black text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:text-black"
      >
        Skip to content
      </a>
      <TopNav />
      <main id="main-content">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-12 px-6 py-16 md:grid-cols-2 md:py-20">
        <RevealOnMount className="space-y-8">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
            For freelancers, consultants, and small agencies
          </p>

          <div className="space-y-5">
            <h1
              className={`${lusitana.className} text-5xl leading-[1.04] text-white sm:text-6xl lg:text-7xl`}
            >
              Get paid faster.
              <br />
              Automatically.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-neutral-300 sm:text-lg">
              Send invoices and get paid faster with payment links, automatic reminders, and Stripe payouts in one workflow.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a href="#pricing" className={primaryCtaClasses}>
              Start free
            </a>
            <a href="#pricing" className={secondaryCtaClasses}>
              View pricing
            </a>
          </div>

          <p className="text-sm text-neutral-400">
            Stripe payments. Optional 2FA. Clear fee breakdown.
          </p>

          <p className="text-sm text-neutral-500">
            Built for developers and small agencies who live in Stripe and
            Next.js.
          </p>
        </RevealOnMount>

        <RevealOnMount delay={0.08} className="md:pl-6">
          <HeroVisual />
        </RevealOnMount>
      </section>
      <section className="border-t border-neutral-900">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-300">
            Use cases
          </h2>
          <ul className="mt-3 grid gap-2 text-sm text-neutral-300 md:grid-cols-3">
            {useCases.map((item) => (
              <li key={item} className="rounded-xl border border-neutral-800 bg-neutral-900/45 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="features" className="border-t border-neutral-900">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <RevealOnScroll className="mb-10 max-w-2xl">
            <h2 className={`${lusitana.className} text-4xl text-white sm:text-5xl`}>
              Why Lateless
            </h2>
            <p className="mt-3 text-neutral-300">
              Focus on shipping and client work while your invoicing flow handles
              payments and follow-up automatically.
            </p>
          </RevealOnScroll>

          <div className="grid gap-4 md:grid-cols-2">
            {features.map((feature, index) => (
              <RevealOnScroll
                key={feature.title}
                delay={index * 0.04}
                className="rounded-2xl border border-neutral-800 bg-neutral-900/55 p-5"
              >
                <h3 className="text-base font-semibold text-white">
                  {feature.title}
                </h3>
                <p
                  id={feature.title === 'Secure and privacy-conscious' ? 'security' : undefined}
                  className="mt-2 text-sm leading-relaxed text-neutral-300"
                >
                  {feature.description}
                </p>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-t border-neutral-900">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <RevealOnScroll className="mb-10 max-w-2xl">
            <h2 className={`${lusitana.className} text-4xl text-white sm:text-5xl`}>
              How it works
            </h2>
            <p className="mt-3 text-neutral-300">
              Three steps to go from manual chasing to an automated invoice flow.
            </p>
          </RevealOnScroll>

          <div className="grid gap-4 md:grid-cols-3">
            {workflowSteps.map((step, index) => (
              <RevealOnScroll
                key={step.title}
                delay={index * 0.05}
                className="rounded-2xl border border-neutral-800 bg-neutral-900/55 p-5"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Step {index + 1}
                </p>
                <h3 className="mt-3 text-base font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                  {step.description}
                </p>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-neutral-900">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <RevealOnScroll className="mb-10 max-w-2xl">
            <h2 className={`${lusitana.className} text-4xl text-white sm:text-5xl`}>
              Pricing for every stage.
            </h2>
            <p className="mt-3 text-neutral-300">
              Stripe processing fees are separate. Lateless adds a small platform
              fee per paid invoice depending on your plan.
            </p>
          </RevealOnScroll>

          <div className="mb-8 inline-flex items-center rounded-full border border-neutral-700 p-1">
            <Link
              href="/?interval=monthly#pricing"
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                interval === 'monthly'
                  ? 'bg-white text-black'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              Monthly
            </Link>
            <Link
              href="/?interval=annual#pricing"
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                interval === 'annual'
                  ? 'bg-white text-black'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              Annual
            </Link>
          </div>

          <div className="grid gap-5 lg:grid-cols-4">
            {planOrder.map((planId, index) => {
              const plan = PLAN_CONFIG[planId];
              const isPopular = planId === 'solo';
              const isAnnual = interval === 'annual' && planId !== 'free';
              const displayPrice = isAnnual
                ? getAnnualPriceDisplay(planId)
                : plan.priceMonthlyEuro;
              const callbackUrl = `/dashboard/settings/billing?plan=${plan.id}&interval=${interval}`;

              return (
                <RevealOnScroll
                  key={plan.id}
                  delay={index * 0.04}
                  className={`group relative flex h-full flex-col rounded-2xl border border-neutral-800 bg-neutral-900/75 p-6 shadow-[0_14px_28px_rgba(0,0,0,0.35)] ${CARD_INTERACTIVE} dark:hover:border-neutral-700 dark:hover:shadow-[0_24px_42px_rgba(0,0,0,0.45)]`}
                >
                  {isPopular ? (
                    <span className="absolute right-4 top-4 rounded-full border border-neutral-600 bg-neutral-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200">
                      Most popular
                    </span>
                  ) : null}

                  <p className="text-sm font-medium text-neutral-300">{plan.name}</p>
                  <p className="mt-3 text-3xl font-semibold text-white">
                    €{displayPrice}
                    <span className="text-sm font-normal text-neutral-400">
                      {isAnnual ? ' / year' : ' / month'}
                    </span>
                  </p>
                  {isAnnual ? (
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-emerald-300">
                      {getAnnualSavingsLabel(planId)}
                    </p>
                  ) : null}

                  <ul className="mt-5 space-y-2 text-sm text-neutral-300">
                    <li>{formatLimit(plan.maxPerMonth)}</li>
                    <li className="text-xs text-neutral-400">Resets monthly. You keep your invoice history.</li>
                    <li>
                      {formatPlatformFee(
                        plan.platformFeeFixedCents,
                        plan.platformFeePercent,
                        plan.platformFeeCapCents,
                      )}
                    </li>
                  </ul>

                  <Link
                    href={`/login?plan=${plan.id}&interval=${interval}&callbackUrl=${encodeURIComponent(callbackUrl)}`}
                    className={`${primaryCtaClasses} mt-6 w-full`}
                  >
                    Start with {plan.name}
                  </Link>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-neutral-900">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <RevealOnScroll className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-300">
              Built for developers.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              Keep your billing workflow close to your product and ops tooling.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <pre className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-xs leading-relaxed text-emerald-300">
{`// Fetch pending invoices
const res = await fetch('/api/invoices?status=pending')
const { invoices } = await res.json();`}
              </pre>
              <pre className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950 p-4 text-xs leading-relaxed text-emerald-300">
{`// Send public pay link
const payLink = 'https://lateless.org/pay/<token>'
await sendReminderEmail({ payLink });`}
              </pre>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      </main>
      <PublicFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
    </div>
  );
}
