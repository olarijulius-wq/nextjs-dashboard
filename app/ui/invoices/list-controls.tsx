'use client';

import { useEffect } from 'react';
import clsx from 'clsx';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  secondaryButtonClasses,
  toolbarButtonClasses,
} from '@/app/ui/button';
import SelectTrigger from '@/app/ui/list-controls/select-trigger';
import {
  listControlsLabelClasses,
  listControlsPanelClasses,
  listControlsRowClasses,
} from '@/app/ui/list-controls/styles';
import type {
  InvoiceSortDir,
  InvoiceSortKey,
  InvoiceStatusFilter,
} from '@/app/lib/data';

const PAGE_SIZE_KEY = 'lateless.invoicePageSize';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type InvoicesListControlsProps = {
  statusFilter: InvoiceStatusFilter;
  sortKey: InvoiceSortKey;
  sortDir: InvoiceSortDir;
  pageSize: number;
};

function normalizeStoredPageSize(value: string | null): number | null {
  if (value === '10' || value === '25' || value === '50' || value === '100') {
    return Number(value);
  }
  return null;
}

export default function InvoicesListControls({
  statusFilter,
  sortKey,
  sortDir,
  pageSize,
}: InvoicesListControlsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const replaceWithParams = (updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams);
    updater(params);
    params.set('page', '1');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (searchParams.get('pageSize')) {
      return;
    }

    const storedPageSize = normalizeStoredPageSize(
      window.localStorage.getItem(PAGE_SIZE_KEY),
    );

    if (!storedPageSize) {
      return;
    }

    const params = new URLSearchParams(searchParams);
    params.set('pageSize', String(storedPageSize));
    params.set('page', '1');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <div
      className={clsx(
        listControlsPanelClasses,
        'md:flex-row md:items-center md:justify-between',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['all', 'All'],
          ['overdue', 'Overdue'],
          ['unpaid', 'Unpaid'],
          ['paid', 'Paid'],
        ] as const).map(([value, label]) => {
          const active = statusFilter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                replaceWithParams((params) => {
                  if (value === 'all') {
                    params.delete('status');
                  } else {
                    params.set('status', value);
                  }
                });
              }}
              className={clsx(
                active ? toolbarButtonClasses : secondaryButtonClasses,
                'h-9 px-3 text-xs md:text-sm',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className={listControlsRowClasses}>
        <label className={listControlsLabelClasses} htmlFor="invoice-sort">
          Sort
        </label>
        <SelectTrigger
          id="invoice-sort"
          value={sortKey}
          onChange={(event) => {
            replaceWithParams((params) => {
              params.set('sort', event.target.value);
            });
          }}
          className="min-w-36"
        >
          <option value="created_at">Created date</option>
          <option value="due_date">Due date</option>
          <option value="amount">Amount</option>
          <option value="customer">Customer (A-Z)</option>
          <option value="status">Status</option>
        </SelectTrigger>

        <SelectTrigger
          aria-label="Sort direction"
          value={sortDir}
          onChange={(event) => {
            replaceWithParams((params) => {
              params.set('dir', event.target.value);
            });
          }}
          className="min-w-24"
        >
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </SelectTrigger>

        <label
          className={clsx(listControlsLabelClasses, 'ml-1')}
          htmlFor="invoice-page-size"
        >
          Rows per page
        </label>
        <SelectTrigger
          id="invoice-page-size"
          value={String(pageSize)}
          onChange={(event) => {
            const nextPageSize = Number(event.target.value);
            window.localStorage.setItem(PAGE_SIZE_KEY, String(nextPageSize));
            replaceWithParams((params) => {
              params.set('pageSize', String(nextPageSize));
            });
          }}
          className="min-w-24"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectTrigger>
      </div>
    </div>
  );
}
