'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useDebouncedCallback } from 'use-debounce';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useMemo, useState } from 'react';
import Pagination from '@/app/ui/invoices/pagination';
import SelectTrigger from '@/app/ui/list-controls/select-trigger';
import {
  listControlsInputClasses,
  listControlsLabelClasses,
  listControlsPanelClasses,
  listControlsRowClasses,
} from '@/app/ui/list-controls/styles';

type BillingEventRow = {
  id: string;
  eventType: string;
  status: string | null;
  stripeEventId: string | null;
  stripeObjectId: string | null;
  userEmail: string | null;
  createdAt: string;
  meta: unknown;
};

type BillingEventsPanelProps = {
  rows: BillingEventRow[];
  totalPages: number;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  query: {
    q: string;
    t: string;
    status: string;
    sort: string;
    dir: string;
  };
};

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export default function BillingEventsPanel({
  rows,
  totalPages,
  totalCount,
  currentPage,
  pageSize,
  query,
}: BillingEventsPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const expandedRows = useMemo(() => expandedIds, [expandedIds]);

  function updateParam(key: string, value: string, resetPage: boolean = true) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    if (resetPage) {
      params.set('page', '1');
    }

    router.replace(`${pathname}?${params.toString()}`);
  }

  const onSearch = useDebouncedCallback((value: string) => {
    updateParam('q', value);
  }, 250);

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className={listControlsPanelClasses}>
        <div className={listControlsRowClasses}>
          <label className={`min-w-[220px] flex-1 ${listControlsLabelClasses}`}>
            Search
            <div className="relative mt-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                defaultValue={query.q}
                placeholder="Search event type or meta"
                className={`${listControlsInputClasses} pl-9`}
                onChange={(event) => onSearch(event.target.value)}
              />
            </div>
          </label>

          <label className={listControlsLabelClasses}>
            Type
            <div className="mt-1">
              <SelectTrigger
                value={query.t}
                onChange={(event) => updateParam('t', event.target.value)}
                className="min-w-[180px]"
              >
                <option value="">All</option>
                <option value="invoice.payment_failed">invoice.payment_failed</option>
                <option value="invoice.payment_succeeded">invoice.payment_succeeded</option>
                <option value="customer.subscription.updated">customer.subscription.updated</option>
                <option value="customer.subscription.deleted">customer.subscription.deleted</option>
                <option value="portal.opened">portal.opened</option>
                <option value="recovery_email_sent">recovery_email_sent</option>
                <option value="recovery_email_failed">recovery_email_failed</option>
              </SelectTrigger>
            </div>
          </label>

          <label className={listControlsLabelClasses}>
            Status
            <div className="mt-1">
              <SelectTrigger
                value={query.status}
                onChange={(event) => updateParam('status', event.target.value)}
                className="min-w-[150px]"
              >
                <option value="">All</option>
                <option value="active">active</option>
                <option value="past_due">past_due</option>
                <option value="unpaid">unpaid</option>
                <option value="canceled">canceled</option>
                <option value="incomplete">incomplete</option>
                <option value="trialing">trialing</option>
                <option value="unknown">unknown</option>
              </SelectTrigger>
            </div>
          </label>

          <label className={listControlsLabelClasses}>
            Sort
            <div className="mt-1">
              <SelectTrigger
                value={query.sort}
                onChange={(event) => updateParam('sort', event.target.value)}
                className="min-w-[150px]"
              >
                <option value="created_at">created_at</option>
                <option value="event_type">event_type</option>
                <option value="status">status</option>
              </SelectTrigger>
            </div>
          </label>

          <label className={listControlsLabelClasses}>
            Direction
            <div className="mt-1">
              <SelectTrigger
                value={query.dir}
                onChange={(event) => updateParam('dir', event.target.value)}
                className="min-w-[120px]"
              >
                <option value="desc">desc</option>
                <option value="asc">asc</option>
              </SelectTrigger>
            </div>
          </label>

          <label className={listControlsLabelClasses}>
            Page size
            <div className="mt-1">
              <SelectTrigger
                value={String(pageSize)}
                onChange={(event) => updateParam('pageSize', event.target.value)}
                className="min-w-[110px]"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </SelectTrigger>
            </div>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs uppercase tracking-[0.08em] text-slate-500 dark:border-neutral-800 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Stripe</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-sm text-slate-600 dark:text-neutral-400">
                    No billing events matched your filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const expanded = expandedRows.has(row.id);
                  return (
                    <Fragment key={row.id}>
                      <tr className="align-top">
                        <td className="px-4 py-3 text-slate-700 dark:text-neutral-300">
                          {formatTimestamp(row.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-neutral-100">
                          {row.eventType}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-neutral-300">
                          {row.status ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-neutral-300">
                          {row.userEmail ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-neutral-400">
                          <p>{row.stripeEventId ?? '—'}</p>
                          <p>{row.stripeObjectId ?? ''}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(row.id)}
                            className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
                          >
                            {expanded ? 'Hide' : 'Show'}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={6} className="px-4 pb-4">
                            <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800 dark:border-neutral-800 dark:bg-black dark:text-neutral-200">
                              {JSON.stringify(row.meta ?? {}, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-neutral-400">
        <p>
          Showing page {currentPage} of {Math.max(1, totalPages)} · {totalCount} events
        </p>
        <Pagination totalPages={totalPages} pageParam="page" />
      </div>
    </div>
  );
}
