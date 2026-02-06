import Link from 'next/link';
import { FaceFrownIcon } from '@heroicons/react/24/outline';
 
export default function NotFound() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-2">
      <FaceFrownIcon className="w-10 text-slate-500" />
      <h2 className="text-xl font-semibold">404 Not Found</h2>
      <p>Could not find the requested invoice.</p>
      <Link
        href="/dashboard/invoices"
        className="mt-4 inline-flex items-center rounded-xl border border-sky-500/40 bg-sky-500/80 px-4 py-2 text-sm font-medium text-slate-950 transition duration-200 ease-out hover:bg-sky-400/90 hover:scale-[1.01]"
      >
        Go Back
      </Link>
    </main>
  );
}
