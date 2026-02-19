'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import SelectTrigger from '@/app/ui/list-controls/select-trigger';
import {
  listControlsLabelClasses,
  listControlsPanelClasses,
  listControlsRowClasses,
} from '@/app/ui/list-controls/styles';
import type { CustomerSortDir, CustomerSortKey } from '@/app/lib/data';

const PAGE_SIZE_KEY = 'lateless.customerPageSize';
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type CustomersListControlsProps = {
  sortKey: CustomerSortKey;
  sortDir: CustomerSortDir;
  pageSize: number;
};

function normalizeStoredPageSize(value: string | null): number | null {
  if (value === '10' || value === '25' || value === '50' || value === '100') {
    return Number(value);
  }
  return null;
}

export default function CustomersListControls({
  sortKey,
  sortDir,
  pageSize,
}: CustomersListControlsProps) {
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
        'md:flex-row md:items-center md:justify-end',
      )}
    >
      <div className={listControlsRowClasses}>
        <label className={listControlsLabelClasses} htmlFor="customer-sort">
          Sort
        </label>
        <SelectTrigger
          id="customer-sort"
          value={sortKey}
          onChange={(event) => {
            replaceWithParams((params) => {
              params.set('sort', event.target.value);
            });
          }}
          className="min-w-36"
        >
          <option value="name">Name (A-Z)</option>
          <option value="email">Email (A-Z)</option>
          <option value="created_at">Created date</option>
          <option value="total_invoices">Total invoices</option>
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
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </SelectTrigger>

        <label
          className={clsx(listControlsLabelClasses, 'ml-1')}
          htmlFor="customer-page-size"
        >
          Rows per page
        </label>
        <SelectTrigger
          id="customer-page-size"
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
