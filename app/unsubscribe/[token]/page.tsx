import type { Metadata } from 'next';
import { consumeUnsubscribeToken } from '@/app/lib/unsubscribe';

export const metadata: Metadata = {
  title: 'Unsubscribe',
};

type UnsubscribePageProps = {
  params: Promise<{ token?: string }>;
};

export default async function UnsubscribePage(props: UnsubscribePageProps) {
  const params = await props.params;
  const token = params?.token?.trim() ?? '';
  let result: { ok: false } | { ok: true; workspaceName: string; pageText: string } =
    { ok: false };
  if (token) {
    try {
      result = await consumeUnsubscribeToken(token);
    } catch {
      result = { ok: false };
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        {result.ok ? (
          <>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              You have been unsubscribed
            </h1>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              You have been unsubscribed from reminders for {result.workspaceName}.
            </p>
            {result.pageText && (
              <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                {result.pageText}
              </p>
            )}
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              If this was a mistake, contact support to be resubscribed.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              Link is invalid or expired
            </h1>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              This unsubscribe link is invalid or expired.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
