import Link from 'next/link';
import { LEGAL_LAST_UPDATED } from '@/app/legal/constants';

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-400">
            Legal
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Cookies Policy</h1>
          <p className="mt-3 text-sm text-neutral-400">
            Last updated: {LEGAL_LAST_UPDATED}
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-neutral-300">
          <section>
            <h2 className="text-base font-medium text-white">Necessary cookies only</h2>
            <p className="mt-2">
              Lateless uses strictly necessary cookies only. These are required to
              provide secure sign-in and core account functionality.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">Cookie categories</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Authentication and session continuity</li>
              <li>Security and fraud prevention</li>
              <li>Essential preferences needed for interface behavior</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white">No analytics or marketing cookies</h2>
            <p className="mt-2">
              We do not use advertising or marketing cookies. We currently do not run
              third-party analytics in the application.
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
