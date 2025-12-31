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
        className="mt-4 rounded-md bg-gradient-to-r from-sky-500 to-cyan-400 px-4 py-2 text-sm text-white shadow-lg shadow-sky-900/40 transition duration-150 hover:from-sky-400 hover:to-cyan-300"
      >
        Go Back
      </Link>
    </main>
  );
}
