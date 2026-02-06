import AcmeLogo from '@/app/ui/acme-logo';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import styles from '@/app/ui/home.module.css';
import { lusitana } from '@/app/ui/fonts';
import Image from 'next/image';
import { PLAN_CONFIG } from '@/app/lib/config';
import ViewPricingButton from '@/app/ui/landing/view-pricing-button';
import PlanSelectButton from '@/app/ui/landing/plan-select-button';

export default function Page() {
  const studioLimit = PLAN_CONFIG.studio.maxPerMonth;
  const studioLimitLabel = Number.isFinite(studioLimit)
    ? `Up to ${studioLimit} invoices per month`
    : 'Unlimited invoices per month';

  return (
    <main className="flex min-h-screen flex-col p-6 text-slate-100">
      <div className={styles.shape}>
        <AcmeLogo />
      </div>
      <div className="mt-4 flex grow flex-col gap-6 md:flex-row">
        <div className="flex flex-col justify-center gap-6 rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-10 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:w-2/5 md:px-14">
          <div className="space-y-4">
            <p
              className={`${lusitana.className} text-2xl text-slate-100 md:text-3xl md:leading-normal`}
            >
              <strong>Get paid faster, automatically.</strong>
            </p>
            <p className="text-slate-400 md:text-lg">
              Lateless helps freelancers and small teams get paid on time with
              smarter invoices, automatic reminders, and late payer insights.
            </p>
          </div>

          <div className="space-y-4 text-sm text-slate-200 md:text-base">
            <div>
              <p className="font-semibold text-slate-100">One-click payments</p>
              <p className="text-slate-400">
                Every invoice ships with a Stripe &quot;Pay now&quot; button. When the
                payment lands, the invoice closes itself.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100">Automatic reminders</p>
              <p className="text-slate-400">
                No more chasing. Overdue invoices get reminders on day 1, 7, and
                21 with the payment link included.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100">
                Late payer analytics
              </p>
              <p className="text-slate-400">
                Spot the clients who always pay 10+ days late and adjust your
                terms before they hurt cash flow.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-100">Flexible plans</p>
              <p className="text-slate-400">
                Free for up to {PLAN_CONFIG.free.maxPerMonth} invoices a month.
                Solo, Pro, and Studio for growing businesses.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-3 rounded-xl border border-sky-500/40 bg-sky-500/80 px-5 py-2.5 text-sm font-medium text-slate-950 transition duration-200 ease-out hover:bg-sky-400/90 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <span>Start free</span>
              <ArrowRightIcon className="w-4" />
            </Link>
            <ViewPricingButton className="inline-flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-2.5 text-sm font-medium text-slate-100 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950" />
          </div>
        </div>
        <div className="flex items-center justify-center p-6 md:w-3/5 md:px-28 md:py-12">
          {/* Add Hero Images Here */}
          <Image
            src="/hero-desktop.png"
            width={1000}
            height={760}
            className="hidden md:block"
            alt="Screenshots of the dashboard project showing desktop version"
          />
          <Image
            src="/hero-mobile.png"
            width={560}
            height={620}
            className="block md:hidden"
            alt="Screenshot of the dashboard project showing mobile version"
          />

        </div>
      </div>

      <section id="pricing" className="mt-16">
        <div className="mb-8 max-w-2xl">
          <h2 className={`${lusitana.className} text-2xl md:text-3xl`}>
            Pricing
          </h2>
          <p className="mt-2 text-sm text-slate-400 md:text-base">
            Start free, then scale your plan as you grow.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-[0_18px_35px_rgba(0,0,0,0.45)] transition hover:border-slate-600">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Free</h3>
              <p className="text-sm text-slate-400">
                Best for trying things out
              </p>
            </div>
            <div className="mb-6">
              <p className="text-2xl font-semibold text-slate-100">
                €{PLAN_CONFIG.free.priceMonthlyEuro} / month
              </p>
            </div>
            <ul className="mb-6 space-y-2 text-sm text-slate-300">
              <li>
                Up to {PLAN_CONFIG.free.maxPerMonth} invoices per month
              </li>
              <li>One-click payments</li>
              <li>Late payer analytics (Solo+)</li>
              <li>Manual reminders (no automation)</li>
            </ul>
            <Link
              href="/signup"
              className="mt-auto inline-flex items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/80 px-4 py-2 text-sm font-medium text-slate-950 transition duration-200 ease-out hover:bg-sky-400/90 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Start free
            </Link>
          </div>

          <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-[0_18px_35px_rgba(0,0,0,0.45)] transition hover:border-slate-600">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Solo</h3>
              <p className="text-sm text-slate-400">
                For freelancers and solo founders
              </p>
            </div>
            <div className="mb-6">
              <p className="text-2xl font-semibold text-slate-100">
                €{PLAN_CONFIG.solo.priceMonthlyEuro} / month
              </p>
            </div>
            <ul className="mb-6 space-y-2 text-sm text-slate-300">
              <li>
                Up to {PLAN_CONFIG.solo.maxPerMonth} invoices per month
              </li>
              <li>One-click payments</li>
              <li>Automatic reminders (day 1, 7, 21)</li>
              <li>Late payer analytics</li>
            </ul>
            <PlanSelectButton
              plan="solo"
              className="mt-auto inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-100 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Choose Solo
            </PlanSelectButton>
          </div>

          <div className="relative flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-[0_18px_35px_rgba(0,0,0,0.45)] transition hover:border-slate-500">
            <span className="absolute right-4 top-4 rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-1 text-xs font-semibold text-sky-200">
              Most popular
            </span>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Pro</h3>
              <p className="text-sm text-slate-400">
                For small teams and agencies
              </p>
            </div>
            <div className="mb-6">
              <p className="text-2xl font-semibold text-slate-100">
                €{PLAN_CONFIG.pro.priceMonthlyEuro} / month
              </p>
            </div>
            <ul className="mb-6 space-y-2 text-sm text-slate-300">
              <li>
                Up to {PLAN_CONFIG.pro.maxPerMonth} invoices per month
              </li>
              <li>Everything in Solo</li>
              <li>Better suited for agencies and small teams</li>
            </ul>
            <PlanSelectButton
              plan="pro"
              className="mt-auto inline-flex items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-100 transition duration-200 ease-out hover:border-sky-400/70 hover:bg-sky-500/20 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Choose Pro
            </PlanSelectButton>
          </div>

          <div className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-[0_18px_35px_rgba(0,0,0,0.45)] transition hover:border-slate-600">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-100">Studio</h3>
              <p className="text-sm text-slate-400">
                For studios and heavier usage
              </p>
            </div>
            <div className="mb-6">
              <p className="text-2xl font-semibold text-slate-100">
                €{PLAN_CONFIG.studio.priceMonthlyEuro} / month
              </p>
            </div>
            <ul className="mb-6 space-y-2 text-sm text-slate-300">
              <li>{studioLimitLabel}</li>
              <li>Everything in Pro</li>
              <li>Best for high-volume billing</li>
            </ul>
            <PlanSelectButton
              plan="studio"
              className="mt-auto inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-100 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Choose Studio
            </PlanSelectButton>
          </div>
        </div>
      </section>
    </main>
  );
}
