import type { Metadata } from 'next';
import TopNav from '@/app/ui/marketing/top-nav';
import PublicFooter from '@/app/ui/marketing/public-footer';

export const metadata: Metadata = {
  title: 'Help',
  description:
    'How Lateless handles invoices, reminders, Stripe payouts, usage resets, and invoice history.',
  alternates: {
    canonical: '/help',
  },
  openGraph: {
    title: 'Lateless Help',
    description:
      'How Lateless handles invoices, reminders, Stripe payouts, usage resets, and invoice history.',
    url: '/help',
  },
};

export default function HelpPage() {
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
        <h1 className="text-3xl font-semibold text-white">Help</h1>
        <div className="mt-8 space-y-8 text-sm leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-base font-medium text-white">Invoice dates</h2>
            <p className="mt-2">
              The created date is when the draft invoice record was made. The issued date is when you send it to a customer.
              Reminder scheduling uses the issued date and due date.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Reminders</h2>
            <p className="mt-2">
              Lateless can send overdue reminders on day 1, day 7, and day 21 after due date based on your settings.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Stripe payouts</h2>
            <p className="mt-2">
              Customers pay through Stripe Checkout. Funds settle to your connected Stripe account according to your Stripe payout schedule.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Plan limits and history</h2>
            <p className="mt-2">
              Plan invoice limits reset monthly. Invoice history remains available even after a monthly limit reset.
            </p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
