import Link from 'next/link';
import { SUPPORT_EMAIL } from '@/app/legal/constants';

const footerLinkClasses = 'transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

export default function PublicFooter() {
  return (
    <footer className="border-t border-neutral-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-neutral-400 md:flex-row md:items-center md:justify-between">
        <p>Lateless - payment links, reminders, and Stripe payouts.</p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-4">
          <Link href="/pricing" className={footerLinkClasses}>
            Pricing
          </Link>
          <Link href="/faq" className={footerLinkClasses}>
            FAQ
          </Link>
          <Link href="/help" className={footerLinkClasses}>
            Help
          </Link>
          <Link href="/privacy" className={footerLinkClasses}>
            Privacy
          </Link>
          <Link href="/terms" className={footerLinkClasses}>
            Terms
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={footerLinkClasses}>
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
