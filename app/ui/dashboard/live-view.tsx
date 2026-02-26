import postgres from 'postgres';
import clsx from 'clsx';
import {
  fetchStripeConnectStatusForUser,
  type StripeConnectStatus,
} from '@/app/lib/data';
import { formatCurrencySuffix } from '@/app/lib/utils';
import { RevealOnScroll } from '@/app/ui/motion/reveal';
import { requireWorkspaceContext } from '@/app/lib/workspace-context';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

type LiveStats = {
  pendingThisWeekCents: number;
  reminderQueueCount: number;
  hasData: boolean;
};

function parseMoney(value: string | number) {
  if (typeof value === 'number') return value;
  const normalized = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getProgressWidth(pendingAmount: string) {
  const pending = parseMoney(pendingAmount);
  const dynamicMax = Math.max(1000, pending * 1.3);
  const ratio = dynamicMax > 0 ? (pending / dynamicMax) * 100 : 0;
  const clamped = Math.min(100, Math.max(5, ratio));
  return `${Math.round(clamped)}%`;
}

async function fetchLiveStats(userEmail: string, workspaceId: string): Promise<LiveStats> {
  try {
    const [pendingRow, reminderRow] = await Promise.all([
      sql<{ pending: string | null }[]>`
        SELECT COALESCE(SUM(amount), 0)::text AS pending
        FROM invoices
        WHERE workspace_id = ${workspaceId}
          AND status = 'pending'
          AND date >= date_trunc('week', current_date)::date
          AND date < (date_trunc('week', current_date) + interval '7 day')::date
      `,
      sql<{ queue_count: string | null }[]>`
        SELECT COUNT(*)::text AS queue_count
        FROM invoices
        WHERE workspace_id = ${workspaceId}
          AND status = 'pending'
          AND due_date IS NOT NULL
          AND due_date < current_date
      `,
    ]);

    return {
      pendingThisWeekCents: Number(pendingRow[0]?.pending ?? '0'),
      reminderQueueCount: Number(reminderRow[0]?.queue_count ?? '0'),
      hasData: true,
    };
  } catch {
    return {
      pendingThisWeekCents: 0,
      reminderQueueCount: 0,
      hasData: false,
    };
  }
}

export async function LatelessLiveView() {
  let stats: LiveStats = {
    pendingThisWeekCents: 0,
    reminderQueueCount: 0,
    hasData: false,
  };
  let stripeStatus: StripeConnectStatus = {
    hasAccount: false,
    accountId: null,
    detailsSubmitted: false,
    payoutsEnabled: false,
    isReadyForTransfers: false,
  };

  try {
    const { userEmail, workspaceId } = await requireWorkspaceContext();
    const [liveStats, connectStatus] = await Promise.all([
      fetchLiveStats(userEmail, workspaceId),
      fetchStripeConnectStatusForUser(userEmail),
    ]);
    stats = liveStats;
    stripeStatus = connectStatus;
  } catch {
    // Keep zero/default UI when user or stats are unavailable.
  }

  const pendingLabel = formatCurrencySuffix(stats.pendingThisWeekCents);
  const progressWidth = getProgressWidth(pendingLabel);
  const isSynced = stripeStatus.isReadyForTransfers;
  const queueText = !stats.hasData
    ? 'No data yet'
    : stats.reminderQueueCount > 0
      ? `${stats.reminderQueueCount} invoices in the reminder queue`
      : 'No invoices in the reminder queue';

  return (
    <RevealOnScroll className="h-full">
      <article className="h-full rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500 dark:text-neutral-400">
            LATELESS LIVE VIEW
          </p>
          <span
            className={clsx(
              'rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em]',
              isSynced
                ? 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300',
            )}
          >
            {isSynced ? 'SYNCED' : 'NOT SYNCED'}
          </span>
        </div>

        <div className="space-y-3">
          <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Pending this week
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {pendingLabel}
              </p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className="h-2 rounded-full bg-neutral-700 dark:bg-neutral-200/80"
                style={{ width: progressWidth }}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">
                Reminder queue
              </span>
              <span className="text-neutral-600 dark:text-neutral-300">
                Today
              </span>
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-200">
              {queueText}
            </p>
          </section>
        </div>
      </article>
    </RevealOnScroll>
  );
}
