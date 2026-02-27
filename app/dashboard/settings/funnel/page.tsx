import { Metadata } from 'next';
import postgres from 'postgres';
import { redirect } from 'next/navigation';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import { isReminderManualRunAdmin } from '@/app/lib/reminder-admin';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';
import type { FunnelEventName } from '@/app/lib/funnel-events';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const metadata: Metadata = {
  title: 'Funnel (Last 7 Days)',
};

const ORDERED_STEPS: FunnelEventName[] = [
  'signup_completed',
  'company_saved',
  'customer_created',
  'invoice_created',
  'first_reminder_sent',
  'billing_opened',
  'checkout_started',
  'subscription_active',
];

function isFunnelEventsMigrationRequiredError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '42P01'
  );
}

type EventCountRow = {
  event_name: string;
  users_7d: string;
  users_24h: string;
};

async function fetchFunnelCounts() {
  const rows = await sql<EventCountRow[]>`
    select
      event_name,
      count(distinct case when event_at >= now() - interval '7 days' then lower(user_email) end)::text as users_7d,
      count(distinct case when event_at >= now() - interval '24 hours' then lower(user_email) end)::text as users_24h
    from public.funnel_events
    where event_at >= now() - interval '7 days'
    group by event_name
    order by event_name asc
  `;

  const countsByEvent = new Map<string, number>();
  rows.forEach((row) => {
    countsByEvent.set(row.event_name, Number(row.users_7d ?? '0'));
  });

  return {
    rows: rows.map((row) => ({
      eventName: row.event_name,
      users7d: Number(row.users_7d ?? '0'),
      users24h: Number(row.users_24h ?? '0'),
    })),
    countsByEvent,
  };
}

export default async function FunnelSettingsPage() {
  let canView = false;
  let migrationWarning: string | null = null;
  let counts:
    | {
        rows: { eventName: string; users7d: number; users24h: number }[];
        countsByEvent: Map<string, number>;
      }
    | null = null;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const hasWorkspaceAccess =
      context.userRole === 'owner' || context.userRole === 'admin';
    if (!hasWorkspaceAccess) {
      redirect('/dashboard/settings');
    }
    if (!isInternalAdmin(context.userEmail)) {
      redirect('/dashboard/settings');
    }
    canView = isReminderManualRunAdmin(context.userEmail);

    if (!canView) {
      redirect('/dashboard/settings');
    }

    counts = await fetchFunnelCounts();
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login?callbackUrl=/dashboard/settings/funnel');
    }

    if (isTeamMigrationRequiredError(error) || isFunnelEventsMigrationRequiredError(error)) {
      migrationWarning =
        'Funnel data unavailable. Run migration 028_add_funnel_events.sql.';
    } else {
      throw error;
    }
  }

  if (!canView) {
    redirect('/dashboard/settings');
  }

  const rows = counts?.rows ?? [];
  const countsByEvent = counts?.countsByEvent ?? new Map<string, number>();

  return (
    <div className="space-y-4">
      {migrationWarning ? (
        <p className="rounded-xl border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {migrationWarning}
        </p>
      ) : null}

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Event counts (last 7 days)
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Distinct users by event name.
        </p>

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            No funnel events recorded in the last 7 days.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase tracking-[0.08em] text-slate-600 dark:bg-black dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">event</th>
                  <th className="px-3 py-2">users (7d)</th>
                  <th className="px-3 py-2">users (24h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {rows.map((row) => (
                  <tr key={row.eventName} className="text-slate-800 dark:text-slate-200">
                    <td className="px-3 py-2">{row.eventName}</td>
                    <td className="px-3 py-2">{row.users7d}</td>
                    <td className="px-3 py-2">{row.users24h}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Activation funnel (last 7 days)
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Distinct users and conversion from previous step.
        </p>

        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-[0.08em] text-slate-600 dark:bg-black dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">step</th>
                <th className="px-3 py-2">users (7d)</th>
                <th className="px-3 py-2">conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {ORDERED_STEPS.map((eventName, index) => {
                const count = countsByEvent.get(eventName) ?? 0;
                const previousEventName = index > 0 ? ORDERED_STEPS[index - 1] : null;
                const previousCount = previousEventName
                  ? (countsByEvent.get(previousEventName) ?? 0)
                  : 0;
                const conversion =
                  index === 0
                    ? '100%'
                    : previousCount > 0
                      ? `${Math.round((count / previousCount) * 100)}%`
                      : '0%';

                return (
                  <tr key={eventName} className="text-slate-800 dark:text-slate-200">
                    <td className="px-3 py-2">{eventName}</td>
                    <td className="px-3 py-2">{count}</td>
                    <td className="px-3 py-2">{conversion}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
