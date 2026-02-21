import Link from 'next/link';

const navAnchorClasses =
  'text-sm text-neutral-300 transition hover:text-white';

export default function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-800/80 bg-black/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-base font-semibold tracking-tight text-white">
          Lateless
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          <Link href="/pricing" className={navAnchorClasses}>
            Pricing
          </Link>
          <Link href="/faq" className={navAnchorClasses}>
            FAQ
          </Link>
          <Link href="/help" className={navAnchorClasses}>
            Help
          </Link>
          <Link href="/privacy" className={`${navAnchorClasses} hidden lg:inline`}>
            Privacy
          </Link>
          <Link href="/terms" className={`${navAnchorClasses} hidden lg:inline`}>
            Terms
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-full px-3 py-2 text-sm text-neutral-300 transition hover:bg-neutral-900 hover:text-white"
          >
            Log in
          </Link>
          <Link
            href="/login?signup=1"
            className="inline-flex items-center rounded-full border border-white bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-neutral-200"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
