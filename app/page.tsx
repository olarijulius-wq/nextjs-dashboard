import AcmeLogo from '@/app/ui/acme-logo';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import styles from '@/app/ui/home.module.css';
import { lusitana } from '@/app/ui/fonts';
import Image from 'next/image';

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col p-6 text-slate-100">
      <div className={styles.shape}>
        <AcmeLogo />
      </div>
      <div className="mt-4 flex grow flex-col gap-4 md:flex-row">
        <div className="flex flex-col justify-center gap-6 rounded-lg border border-slate-800 bg-slate-900/80 px-6 py-10 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:w-2/5 md:px-14">
          <div className="space-y-4">
            <p
              className={`${lusitana.className} text-2xl text-slate-100 md:text-3xl md:leading-normal`}
            >
              <strong>Get paid faster, automatically.</strong>
            </p>
            <p className="text-slate-400 md:text-lg">
              Send invoices with one-click payment links, automate reminders,
              and see which clients always pay late.
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
            <div id="pricing">
              <p className="font-semibold text-slate-100">Flexible plans</p>
              <p className="text-slate-400">
                Free for up to 3 invoices a month. Solo, Pro, and Studio for
                growing businesses.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="flex items-center gap-3 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-400 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-sky-900/40 transition duration-150 hover:from-sky-400 hover:to-cyan-300"
            >
              <span>Start free</span>
              <ArrowRightIcon className="w-4" />
            </Link>
            <Link
              href="/#pricing"
              className="flex items-center gap-3 rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-800/60"
            >
              View pricing
            </Link>
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
    </main>
  );
}
