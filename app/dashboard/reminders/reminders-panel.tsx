'use client';

import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export type ReminderPanelItem = {
  invoiceId: string;
  invoiceLabel: string;
  amountLabel: string;
  dueDateLabel: string;
  nextSendDateLabel: string;
  reminderNumber: number;
  customerName: string;
  customerEmail: string;
  status: 'pending' | 'paid';
  reason: string;
  willSend: 'yes' | 'no';
  skipReason: string | null;
  pauseState: 'invoice_paused' | 'customer_paused' | null;
  isUnsubscribed: boolean;
  unsubscribeEnabled: boolean;
  isInvoicePaused: boolean;
  isCustomerPaused: boolean;
  dueDateIso: string;
  nextSendDateIso: string;
  lastReminderSentAtIso: string | null;
  reminderLevel: number;
  subject: string;
  previewBody: string;
};

type RemindersPanelProps = {
  items: ReminderPanelItem[];
  canRunReminders: boolean;
  smtpMigrationWarning: string | null;
  emailProvider: string | null;
  smtpHost: string | null;
  fromEmail: string | null;
  resendDomain: string | null;
  canManagePauses: boolean;
  pauseMigrationWarning: string | null;
};

type PauseScope = 'invoice' | 'customer';

type ReminderRunSkippedBreakdown = {
  paused?: number;
  unsubscribed?: number;
  missing_email?: number;
  not_eligible?: number;
  other?: number;
};

type ReminderRunErrorItem = {
  invoiceId: string;
  recipientEmail?: string;
  errorCode?: string | null;
  errorType?: string | null;
  message: string;
};

type ReminderRunRecord = {
  run_id: string;
  ran_at: string;
  source: 'manual' | 'cron' | 'dev';
  dry_run: boolean;
  attempted: number;
  sent: number;
  skipped: number;
  errors: number;
  error_items?: ReminderRunErrorItem[];
  duration_ms: number | null;
  skipped_breakdown: ReminderRunSkippedBreakdown;
};

function formatRunTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatTriggeredBy(value: ReminderRunRecord['source']) {
  if (value === 'dev') {
    return 'Dev';
  }

  if (value === 'cron') {
    return 'Cron';
  }

  return 'Manual';
}

function StatusPill({ status }: { status: ReminderPanelItem['status'] }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        status === 'pending'
          ? 'border-orange-500/70 bg-orange-100 text-orange-900 dark:border-orange-500/35 dark:bg-orange-500/20 dark:text-orange-200'
          : 'border-emerald-500/70 bg-emerald-100 text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/20 dark:text-emerald-200',
      )}
    >
      {status === 'pending' ? 'Pending' : 'Paid'}
    </span>
  );
}

function PausePill({ pauseState }: { pauseState: ReminderPanelItem['pauseState'] }) {
  if (!pauseState) {
    return null;
  }

  return (
    <span className="inline-flex items-center rounded-full border border-neutral-500/60 bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-900 dark:border-neutral-500/45 dark:bg-neutral-800 dark:text-neutral-100">
      Paused
    </span>
  );
}

function WillSendPill({ item }: { item: ReminderPanelItem }) {
  if (item.willSend === 'yes') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/70 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900 dark:border-emerald-500/35 dark:bg-emerald-500/20 dark:text-emerald-200">
        Eligible
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full border border-neutral-500/60 bg-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-900 dark:border-neutral-500/45 dark:bg-neutral-800 dark:text-neutral-100">
      {item.skipReason ?? 'Blocked'}
    </span>
  );
}

function TopCards({
  smtpMigrationWarning,
  emailProvider,
  smtpHost,
  fromEmail,
  resendDomain,
}: {
  smtpMigrationWarning: string | null;
  emailProvider: string | null;
  smtpHost: string | null;
  fromEmail: string | null;
  resendDomain: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 md:col-span-6 md:p-5">
        <div className="flex h-full flex-col">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            How reminders work
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Automatic cadence for overdue pending invoices.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
            <li>Reminder #1: 1 day after due date.</li>
            <li>Reminder #2: 7 days after last reminder.</li>
            <li>Reminder #3: 14 days after last reminder.</li>
          </ul>
          <p className="mt-auto pt-4 text-sm text-neutral-600 dark:text-neutral-400">
            Reminder emails include a pay link and, when enabled, an unsubscribe link.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 md:col-span-6 md:p-5">
        <div className="flex h-full flex-col">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Email provider</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Current sending configuration for reminders.
          </p>

          {smtpMigrationWarning ? (
            <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">{smtpMigrationWarning}</p>
          ) : emailProvider === 'smtp' ? (
            <div className="mt-4 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                Provider: <span className="font-medium text-neutral-900 dark:text-neutral-100">Custom SMTP</span>
              </p>
              <p>
                Host:{' '}
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{smtpHost || 'Not set'}</span>
              </p>
              <p>
                From:{' '}
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{fromEmail || 'Not set'}</span>
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                Provider: <span className="font-medium text-neutral-900 dark:text-neutral-100">Resend</span>
              </p>
              <p>
                From domain:{' '}
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {resendDomain || 'Default sender domain'}
                </span>
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FiltersRow({
  search,
  setSearch,
  sendFilter,
  setSendFilter,
  pauseFilter,
  setPauseFilter,
}: {
  search: string;
  setSearch: (value: string) => void;
  sendFilter: 'all' | 'will-send' | 'skipped';
  setSendFilter: (value: 'all' | 'will-send' | 'skipped') => void;
  pauseFilter: 'any' | 'invoice_paused' | 'customer_paused';
  setPauseFilter: (value: 'any' | 'invoice_paused' | 'customer_paused') => void;
}) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.08em] text-neutral-500">
        Search
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Customer, email, invoice"
          className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm normal-case tracking-normal text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.08em] text-neutral-500">
        Will send
        <select
          value={sendFilter}
          onChange={(event) => setSendFilter(event.target.value as 'all' | 'will-send' | 'skipped')}
          className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm normal-case tracking-normal text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <option value="all">All</option>
          <option value="will-send">Will send</option>
          <option value="skipped">Skipped</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.08em] text-neutral-500">
        Pause state
        <select
          value={pauseFilter}
          onChange={(event) =>
            setPauseFilter(event.target.value as 'any' | 'invoice_paused' | 'customer_paused')
          }
          className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm normal-case tracking-normal text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          <option value="any">Any</option>
          <option value="invoice_paused">Invoice paused</option>
          <option value="customer_paused">Customer paused</option>
        </select>
      </label>
    </div>
  );
}

function ReminderActionButton({
  item,
  canManagePauses,
  pauseMigrationWarning,
  onPause,
  onResume,
  pendingInvoiceId,
}: {
  item: ReminderPanelItem;
  canManagePauses: boolean;
  pauseMigrationWarning: string | null;
  onPause: (item: ReminderPanelItem) => void;
  onResume: (item: ReminderPanelItem) => void;
  pendingInvoiceId: string | null;
}) {
  if (!canManagePauses || pauseMigrationWarning) {
    return null;
  }

  const isPending = pendingInvoiceId === item.invoiceId;

  if (item.pauseState) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onResume(item);
        }}
        disabled={isPending}
        className="inline-flex h-8 items-center justify-center rounded-lg border border-neutral-300 bg-neutral-100 px-3 text-xs font-medium text-neutral-900 transition hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        {isPending ? 'Resuming...' : 'Resume'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onPause(item);
      }}
      className="inline-flex h-8 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-black transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
    >
      Pause
    </button>
  );
}

function SummaryStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <article className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-[11px] uppercase tracking-[0.08em] text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">{hint}</p>
    </article>
  );
}

type UpcomingTableProps = {
  items: ReminderPanelItem[];
  selectedItem: ReminderPanelItem | null;
  onSelectItem: (invoiceId: string) => void;
  canRunReminders: boolean;
  handleRunNow: () => void;
  isRunning: boolean;
  runMessage: string;
  dryRun: boolean;
  setDryRun: (value: boolean) => void;
  canManagePauses: boolean;
  pauseMigrationWarning: string | null;
  onPauseItem: (item: ReminderPanelItem) => void;
  onResumeItem: (item: ReminderPanelItem) => void;
  pendingInvoiceId: string | null;
};

function UpcomingTable({
  items,
  selectedItem,
  onSelectItem,
  canRunReminders,
  handleRunNow,
  isRunning,
  runMessage,
  dryRun,
  setDryRun,
  canManagePauses,
  pauseMigrationWarning,
  onPauseItem,
  onResumeItem,
  pendingInvoiceId,
}: UpcomingTableProps) {
  const [search, setSearch] = useState('');
  const [sendFilter, setSendFilter] = useState<'all' | 'will-send' | 'skipped'>('all');
  const [pauseFilter, setPauseFilter] = useState<'any' | 'invoice_paused' | 'customer_paused'>('any');

  const summaryCounts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let active = 0;
    let paused = 0;
    let dueSoon = 0;

    for (const item of items) {
      if (item.pauseState) {
        paused += 1;
      }

      if (item.willSend === 'yes' && !item.pauseState) {
        active += 1;
      }

      const nextSendDate = new Date(item.nextSendDateIso);
      if (Number.isNaN(nextSendDate.getTime())) {
        continue;
      }
      nextSendDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.floor(
        (nextSendDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntil >= 0 && daysUntil <= 3) {
        dueSoon += 1;
      }
    }

    return { active, paused, dueSoon };
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return items.filter((item) => {
      if (normalizedSearch) {
        const haystack = `${item.customerName} ${item.customerEmail} ${item.invoiceLabel}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      if (sendFilter === 'will-send' && item.willSend !== 'yes') {
        return false;
      }

      if (sendFilter === 'skipped' && item.willSend === 'yes') {
        return false;
      }

      if (pauseFilter !== 'any' && item.pauseState !== pauseFilter) {
        return false;
      }

      return true;
    });
  }, [items, search, sendFilter, pauseFilter]);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 md:p-5">
      <header>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Upcoming reminders</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Next 50 reminder candidates sorted by next send date.
        </p>
      </header>

      <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-500">Summary</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <SummaryStatCard
            label="Active"
            value={summaryCounts.active}
            hint="Eligible and not paused"
          />
          <SummaryStatCard
            label="Paused"
            value={summaryCounts.paused}
            hint="Invoice or customer pause"
          />
          <SummaryStatCard
            label="Due soon"
            value={summaryCounts.dueSoon}
            hint="Next send in 0-3 days"
          />
        </div>
      </div>

      <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            {canRunReminders ? (
              <div className="w-full">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-500">Controls</p>
                <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <input
                      id="dry-run-toggle"
                      type="checkbox"
                      checked={dryRun}
                      onChange={(event) => setDryRun(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border border-neutral-400 bg-white text-neutral-900 accent-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
                    />
                    <div className="flex flex-col">
                      <label
                        htmlFor="dry-run-toggle"
                        className="text-sm font-medium text-neutral-900 dark:text-neutral-100"
                      >
                        Dry run
                      </label>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        Simulates sending. No emails are sent and invoices aren’t updated.
                      </p>
                    </div>
                  </div>
                  <div className="w-full md:w-auto">
                    <button
                      type="button"
                      onClick={handleRunNow}
                      disabled={isRunning}
                      className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-neutral-900 bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60 md:h-9 md:w-auto md:text-xs"
                    >
                      {isRunning ? 'Running...' : 'Run reminders now'}
                    </button>
                  </div>
                </div>
                {runMessage ? (
                  <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{runMessage}</p>
                ) : null}
              </div>
            ) : (
              <div className="w-full md:ml-auto md:w-auto md:text-right">
                <button
                  type="button"
                  disabled
                  title="Owner/Admin only"
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-black opacity-60 md:h-9 md:w-auto md:text-xs"
                >
                  Run reminders now
                </button>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">Owner/Admin only.</p>
              </div>
            )}
          </div>

          <FiltersRow
            search={search}
            setSearch={setSearch}
            sendFilter={sendFilter}
            setSendFilter={setSendFilter}
            pauseFilter={pauseFilter}
            setPauseFilter={setPauseFilter}
          />
        </div>
      </div>

      {pauseMigrationWarning ? (
        <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">{pauseMigrationWarning}</p>
      ) : null}

      {filteredItems.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">No reminders match filters.</p>
      ) : (
        <>
          <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-neutral-500">Reminder list</p>
              <p className="text-xs text-neutral-500">{filteredItems.length} visible</p>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <div className="max-h-[70vh] min-h-0 overflow-y-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-black">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-neutral-200 bg-neutral-50 text-[11px] uppercase tracking-[0.08em] text-neutral-600 dark:border-neutral-800 dark:bg-black dark:text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Next send</th>
                  <th className="px-3 py-2 font-semibold">Reminder #</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Invoice</th>
                  <th className="px-3 py-2 font-semibold">Amount</th>
                  <th className="px-3 py-2 font-semibold">Due date</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Will send?</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {filteredItems.map((item) => {
                      const isSelected = selectedItem?.invoiceId === item.invoiceId;
                      return (
                        <tr
                          key={item.invoiceId}
                          tabIndex={0}
                          onClick={() => onSelectItem(item.invoiceId)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onSelectItem(item.invoiceId);
                            }
                          }}
                          className={clsx(
                            'cursor-pointer border-l-2 border-transparent bg-white text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-0 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:bg-neutral-900',
                            isSelected &&
                              'border-l-neutral-400 bg-neutral-100 text-neutral-900 dark:border-l-neutral-500 dark:bg-neutral-900 dark:text-neutral-100',
                          )}
                        >
                          <td className="px-3 py-3.5">{item.nextSendDateLabel}</td>
                          <td className="px-3 py-3.5">{item.reminderNumber}</td>
                          <td className="px-3 py-3.5">
                            <p className="font-medium text-neutral-900 dark:text-neutral-100">{item.customerName}</p>
                            <p className="text-xs text-neutral-600 dark:text-neutral-400">
                              {item.customerEmail || 'No email'}
                            </p>
                          </td>
                          <td className="px-3 py-3.5">{item.invoiceLabel}</td>
                          <td className="px-3 py-3.5 font-medium text-neutral-900 dark:text-neutral-100">{item.amountLabel}</td>
                          <td className="px-3 py-3.5">{item.dueDateLabel}</td>
                          <td className="px-3 py-3.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusPill status={item.status} />
                              <PausePill pauseState={item.pauseState} />
                            </div>
                          </td>
                          <td className="px-3 py-3.5">
                            <WillSendPill item={item} />
                          </td>
                          <td className="px-3 py-3.5">
                            <ReminderActionButton
                              item={item}
                              canManagePauses={canManagePauses}
                              pauseMigrationWarning={pauseMigrationWarning}
                              onPause={onPauseItem}
                              onResume={onResumeItem}
                              pendingInvoiceId={pendingInvoiceId}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3 md:hidden">
            {filteredItems.map((item) => {
              const isSelected = selectedItem?.invoiceId === item.invoiceId;
              return (
                <article
                  key={item.invoiceId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectItem(item.invoiceId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectItem(item.invoiceId);
                    }
                  }}
                  className={clsx(
                    'rounded-xl border p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-0',
                    'border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900',
                    isSelected &&
                      'border-neutral-400 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {item.nextSendDateLabel}
                      </p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        Reminder #{item.reminderNumber}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StatusPill status={item.status} />
                      <PausePill pauseState={item.pauseState} />
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{item.customerName}</p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">{item.customerEmail || 'No email'}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm">
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <span className="text-neutral-500">Amount:</span> {item.amountLabel}
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <span className="text-neutral-500">Due:</span> {item.dueDateLabel}
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300">
                      <span className="text-neutral-500">Invoice:</span> {item.invoiceLabel}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <WillSendPill item={item} />
                    <ReminderActionButton
                      item={item}
                      canManagePauses={canManagePauses}
                      pauseMigrationWarning={pauseMigrationWarning}
                      onPause={onPauseItem}
                      onResume={onResumeItem}
                      pendingInvoiceId={pendingInvoiceId}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function EmailPreviewCard({
  selectedItem,
  previewRef,
}: {
  selectedItem: ReminderPanelItem | null;
  previewRef: { current: HTMLElement | null };
}) {
  const [copyMessage, setCopyMessage] = useState('');

  const handleCopy = async () => {
    if (!selectedItem?.previewBody) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedItem.previewBody);
      setCopyMessage('Copied');
      window.setTimeout(() => setCopyMessage(''), 1500);
    } catch {
      setCopyMessage('Copy failed');
      window.setTimeout(() => setCopyMessage(''), 1500);
    }
  };

  return (
    <section
      ref={previewRef}
      className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 md:p-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Email preview</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Preview the plain text message for the selected reminder.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!selectedItem}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-black transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Copy preview
        </button>
      </div>

      {!selectedItem ? (
        <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">
          Select an upcoming reminder to preview the email.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-neutral-100 p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-xs uppercase tracking-[0.08em] text-neutral-500">Decision details</p>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                Due date: <span className="font-medium">{selectedItem.dueDateLabel}</span>
              </p>
              <p>
                Reminder level: <span className="font-medium">{selectedItem.reminderLevel}</span>
              </p>
              <p>
                Last reminder sent at:{' '}
                <span className="font-medium">
                  {selectedItem.lastReminderSentAtIso
                    ? new Date(selectedItem.lastReminderSentAtIso).toLocaleString('en-GB')
                    : 'Never'}
                </span>
              </p>
              <p>
                Unsubscribed: <span className="font-medium">{selectedItem.isUnsubscribed ? 'Yes' : 'No'}</span>
              </p>
              <p>
                Paused state:{' '}
                <span className="font-medium">
                  {selectedItem.pauseState
                    ? selectedItem.pauseState === 'invoice_paused'
                      ? 'Invoice paused'
                      : 'Customer paused'
                    : 'Not paused'}
                </span>
              </p>
              <p>
                Missing email:{' '}
                <span className="font-medium">{selectedItem.customerEmail ? 'No' : 'Yes'}</span>
              </p>
              <p>
                Next send date logic: <span className="font-medium">{selectedItem.reason}</span>
              </p>
              <p>
                Will send: <span className="font-medium">{selectedItem.willSend === 'yes' ? 'Yes' : 'No'}</span>
                {selectedItem.skipReason ? ` (${selectedItem.skipReason})` : ''}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-neutral-500">Subject</p>
            <p className="mt-1 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 font-mono text-sm font-semibold text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
              {selectedItem.subject}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-neutral-500">
              Body (plain text preview)
            </p>
            <pre className="mt-1 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-3 text-xs text-neutral-800 outline-none whitespace-pre-wrap md:whitespace-pre dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
              {selectedItem.previewBody}
            </pre>
          </div>
        </div>
      )}

      {copyMessage ? <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">{copyMessage}</p> : null}
    </section>
  );
}

function RunResultCard({ run }: { run: ReminderRunRecord }) {
  const skipped = run.skipped_breakdown;

  return (
    <article className="rounded-xl border border-neutral-300 bg-neutral-100 p-3 dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Last run result
        </p>
        <span className="inline-flex items-center rounded-full border border-neutral-400 bg-white px-2 py-0.5 text-xs font-medium text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100">
          {run.dry_run ? 'Dry run' : 'Normal'}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
        {formatRunTimestamp(run.ran_at)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-neutral-800 md:grid-cols-4 dark:text-neutral-200">
        <p>
          Sent: <span className="font-semibold">{run.sent}</span>
        </p>
        <p>
          Attempted: <span className="font-semibold">{run.attempted}</span>
        </p>
        <p>
          Errors: <span className="font-semibold">{run.errors}</span>
        </p>
        <p>
          Skipped: <span className="font-semibold">{run.skipped}</span>
        </p>
      </div>
      <p className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">Duration: {run.duration_ms ?? 0} ms</p>
      <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-neutral-700 md:grid-cols-2 dark:text-neutral-300">
        <p>Skipped paused: {skipped.paused ?? 0}</p>
        <p>Skipped unsubscribed: {skipped.unsubscribed ?? 0}</p>
        <p>Skipped missing email: {skipped.missing_email ?? 0}</p>
        <p>Skipped not eligible: {skipped.not_eligible ?? 0}</p>
        <p>Skipped other: {skipped.other ?? 0}</p>
      </div>
      {run.errors > 0 && (run.error_items?.length ?? 0) > 0 ? (
        <details className="mt-2 rounded border border-neutral-300 bg-white p-2 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
          <summary className="cursor-pointer font-medium">
            Show error details ({Math.min(run.error_items?.length ?? 0, 10)})
          </summary>
          <ul className="mt-2 space-y-1">
            {(run.error_items ?? []).slice(0, 10).map((item, index) => (
              <li key={`${item.invoiceId}-${item.recipientEmail ?? 'unknown'}-${index}`}>
                <span className="font-medium">
                  {item.recipientEmail || item.invoiceId}
                </span>
                : {item.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

function RecentRunsCard({
  runs,
  loading,
  errorMessage,
}: {
  runs: ReminderRunRecord[];
  loading: boolean;
  errorMessage: string;
}) {
  const latestRun = runs[0] ?? null;
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 md:p-5">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Recent runs</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Persistent run history for this workspace.
      </p>

      {latestRun ? <div className="mt-4"><RunResultCard run={latestRun} /></div> : null}

      {loading ? (
        <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">Loading recent runs...</p>
      ) : errorMessage ? (
        <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">{errorMessage}</p>
      ) : runs.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">No run history yet.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {runs.map((run) => (
            <details
              key={run.run_id}
              className="rounded-lg border border-neutral-200 bg-neutral-100 p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {formatRunTimestamp(run.ran_at)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
                    <span className="rounded border border-neutral-400 bg-white px-2 py-0.5 dark:border-neutral-600 dark:bg-neutral-950">
                      {run.dry_run ? 'Dry run' : 'Normal'}
                    </span>
                    <span>{formatTriggeredBy(run.source)}</span>
                    <span>Sent: {run.sent} / Attempted: {run.attempted} / Errors: {run.errors} / Skipped: {run.skipped}</span>
                  </div>
                </div>
              </summary>
              <div className="mt-3 space-y-2 text-xs text-neutral-700 dark:text-neutral-300">
                <p>Duration: {run.duration_ms ?? 0} ms</p>
                <p>
                  Skipped breakdown: paused {run.skipped_breakdown.paused ?? 0}, unsubscribed{' '}
                  {run.skipped_breakdown.unsubscribed ?? 0}, missing email{' '}
                  {run.skipped_breakdown.missing_email ?? 0}, not eligible{' '}
                  {run.skipped_breakdown.not_eligible ?? 0}, other {run.skipped_breakdown.other ?? 0}
                </p>
                {run.errors > 0 && (run.error_items?.length ?? 0) > 0 ? (
                  <ul className="space-y-1">
                    {(run.error_items ?? []).slice(0, 10).map((item, index) => (
                      <li key={`${run.run_id}-${item.invoiceId}-${index}`}>
                        {item.recipientEmail || item.invoiceId}: {item.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function PauseModal({
  open,
  selectedItem,
  onClose,
  onSubmit,
}: {
  open: boolean;
  selectedItem: ReminderPanelItem | null;
  onClose: () => void;
  onSubmit: (scope: PauseScope, reason: string) => void;
}) {
  const [scope, setScope] = useState<PauseScope>('invoice');
  const [reason, setReason] = useState('');

  if (!open || !selectedItem) {
    return null;
  }

  const canPauseCustomer = selectedItem.customerEmail.trim() !== '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-neutral-300 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Pause reminder</h3>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Choose scope for {selectedItem.invoiceLabel}.
        </p>

        <label className="mt-3 block text-xs uppercase tracking-[0.08em] text-neutral-500">
          Scope
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as PauseScope)}
            className="mt-1 h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm normal-case tracking-normal text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          >
            <option value="invoice">This invoice only</option>
            <option value="customer" disabled={!canPauseCustomer}>
              This customer (all invoices)
            </option>
          </select>
        </label>

        <label className="mt-3 block text-xs uppercase tracking-[0.08em] text-neutral-500">
          Reason (optional)
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            placeholder="Internal note"
          />
        </label>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-neutral-100 px-3 text-xs font-medium text-neutral-900 transition hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(scope, reason)}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-3 text-xs font-medium text-black transition hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
          >
            Pause
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RemindersPanel({
  items,
  canRunReminders,
  smtpMigrationWarning,
  emailProvider,
  smtpHost,
  fromEmail,
  resendDomain,
  canManagePauses,
  pauseMigrationWarning,
}: RemindersPanelProps) {
  const router = useRouter();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(items[0]?.invoiceId ?? '');
  const [runMessage, setRunMessage] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [recentRuns, setRecentRuns] = useState<ReminderRunRecord[]>([]);
  const [recentRunsLoading, setRecentRunsLoading] = useState(true);
  const [recentRunsError, setRecentRunsError] = useState('');
  const [pauseMessage, setPauseMessage] = useState('');
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseTarget, setPauseTarget] = useState<ReminderPanelItem | null>(null);
  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | null>(null);
  const [isRunning, startRunTransition] = useTransition();
  const [, startRefreshTransition] = useTransition();
  const previewRef = useRef<HTMLElement | null>(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.invoiceId === selectedInvoiceId) ?? items[0] ?? null,
    [items, selectedInvoiceId],
  );

  useEffect(() => {
    let cancelled = false;

    const loadRuns = async () => {
      setRecentRunsLoading(true);
      setRecentRunsError('');

      try {
        const response = await fetch('/api/settings/reminders/runs', {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              runs?: ReminderRunRecord[];
              message?: string;
            }
          | null;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setRecentRunsError(payload?.message ?? 'Failed to load recent runs.');
          setRecentRuns([]);
          return;
        }

        setRecentRuns(Array.isArray(payload?.runs) ? payload!.runs : []);
      } catch {
        if (!cancelled) {
          setRecentRunsError('Failed to load recent runs.');
          setRecentRuns([]);
        }
      } finally {
        if (!cancelled) {
          setRecentRunsLoading(false);
        }
      }
    };

    loadRuns();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectItem = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);

    if (typeof window === 'undefined') {
      return;
    }

    if (!window.matchMedia('(max-width: 767px)').matches) {
      return;
    }

    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleRunNow = () => {
    if (isRunning) {
      return;
    }

    setRunMessage('');
    startRunTransition(async () => {
      try {
        const response = await fetch('/api/reminders/run', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun, triggeredBy: 'manual', source: 'manual' }),
        });
        const payload = (await response.json().catch(() => null)) as {
          updatedCount?: number;
          dryRun?: boolean;
          durationMs?: number;
          summary?: {
            attempted?: number;
            sentCount?: number;
            skippedCount?: number;
            errorCount?: number;
            skippedBreakdown?: ReminderRunSkippedBreakdown;
            wouldSendCount?: number;
          };
          errors?: ReminderRunErrorItem[];
          ranAt?: string;
          runLogWritten?: boolean;
          runLogWarning?: string | null;
          error?: string;
        } | null;

        if (!response.ok) {
          const message = payload?.error || 'Failed to run reminders.';
          setRunMessage(message);
          return;
        }

        const summary = payload?.summary;
        const attemptedCount = summary?.attempted ?? 0;
        const sentCount = summary?.sentCount ?? payload?.updatedCount ?? 0;
        const skippedCount = summary?.skippedCount ?? 0;
        const errorCount = summary?.errorCount ?? 0;
        const isDryRunResponse = Boolean(payload?.dryRun);

        setRunMessage(
          isDryRunResponse
            ? `Dry run finished. Would send ${summary?.wouldSendCount ?? 0}, sent 0, attempted 0, skipped ${skippedCount}, errors 0.`
            : `Run finished. Sent ${sentCount} / Attempted ${attemptedCount} / Errors ${errorCount} / Skipped ${skippedCount}.`,
        );
        try {
          const runsResponse = await fetch('/api/settings/reminders/runs', {
            method: 'GET',
            cache: 'no-store',
          });
          const runsPayload = (await runsResponse.json().catch(() => null)) as
            | { runs?: ReminderRunRecord[]; message?: string }
            | null;
          if (runsResponse.ok) {
            setRecentRuns(Array.isArray(runsPayload?.runs) ? runsPayload!.runs : []);
            setRecentRunsError('');
          } else {
            setRecentRunsError(runsPayload?.message ?? 'Failed to load recent runs.');
          }
        } catch {
          setRecentRunsError('Failed to load recent runs.');
        }

        startRefreshTransition(() => {
          router.refresh();
        });
      } catch {
        setRunMessage('Failed to run reminders.');
      }
    });
  };

  const sendPauseMutation = async (input: {
    endpoint: '/api/reminders/pause' | '/api/reminders/resume';
    scope: PauseScope;
    invoiceId?: string;
    email?: string;
    reason?: string;
  }) => {
    const response = await fetch(input.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: input.scope,
        invoiceId: input.invoiceId,
        email: input.email,
        reason: input.reason,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { message?: string; error?: string }
      | null;

    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || 'Request failed.');
    }
  };

  const handlePauseSubmit = (scope: PauseScope, reason: string) => {
    if (!pauseTarget) {
      return;
    }

    const invoiceId = pauseTarget.invoiceId;
    const email = pauseTarget.customerEmail.trim();
    setPendingInvoiceId(invoiceId);
    setPauseMessage('');
    setPauseModalOpen(false);

    startRunTransition(async () => {
      try {
        await sendPauseMutation({
          endpoint: '/api/reminders/pause',
          scope,
          invoiceId,
          email,
          reason,
        });
        setPauseMessage('Pause updated.');
        router.refresh();
      } catch (error) {
        setPauseMessage(error instanceof Error ? error.message : 'Failed to pause reminder.');
      } finally {
        setPendingInvoiceId(null);
      }
    });
  };

  const handleResumeItem = (item: ReminderPanelItem) => {
    const scope: PauseScope = item.pauseState === 'invoice_paused' ? 'invoice' : 'customer';

    setPendingInvoiceId(item.invoiceId);
    setPauseMessage('');

    startRunTransition(async () => {
      try {
        await sendPauseMutation({
          endpoint: '/api/reminders/resume',
          scope,
          invoiceId: item.invoiceId,
          email: item.customerEmail,
        });
        setPauseMessage('Pause removed.');
        router.refresh();
      } catch (error) {
        setPauseMessage(error instanceof Error ? error.message : 'Failed to resume reminder.');
      } finally {
        setPendingInvoiceId(null);
      }
    });
  };

  return (
    <>
      {pauseModalOpen ? (
        <PauseModal
          open={pauseModalOpen}
          selectedItem={pauseTarget}
          onClose={() => setPauseModalOpen(false)}
          onSubmit={handlePauseSubmit}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="md:col-span-12">
          <TopCards
            smtpMigrationWarning={smtpMigrationWarning}
            emailProvider={emailProvider}
            smtpHost={smtpHost}
            fromEmail={fromEmail}
            resendDomain={resendDomain}
          />
        </div>

        <div className="md:col-span-12">
          <UpcomingTable
            items={items}
            selectedItem={selectedItem}
            onSelectItem={handleSelectItem}
            canRunReminders={canRunReminders}
            handleRunNow={handleRunNow}
            isRunning={isRunning}
            runMessage={runMessage}
            dryRun={dryRun}
            setDryRun={setDryRun}
            canManagePauses={canManagePauses}
            pauseMigrationWarning={pauseMigrationWarning}
            onPauseItem={(item) => {
              setPauseTarget(item);
              setPauseModalOpen(true);
            }}
            onResumeItem={handleResumeItem}
            pendingInvoiceId={pendingInvoiceId}
          />
          {pauseMessage ? (
            <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">{pauseMessage}</p>
          ) : null}
        </div>

        <div className="md:col-span-12">
          <EmailPreviewCard selectedItem={selectedItem} previewRef={previewRef} />
        </div>

        <div className="md:col-span-12">
          <RecentRunsCard
            runs={recentRuns}
            loading={recentRunsLoading}
            errorMessage={recentRunsError}
          />
        </div>
      </div>
    </>
  );
}
