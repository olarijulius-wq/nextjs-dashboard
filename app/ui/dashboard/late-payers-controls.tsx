'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import Search from '@/app/ui/search';
import SelectTrigger from '@/app/ui/list-controls/select-trigger';
import {
  listControlsLabelClasses,
  listControlsPanelClasses,
  listControlsRowClasses,
} from '@/app/ui/list-controls/styles';
import type { LatePayerSortDir, LatePayerSortKey } from '@/app/lib/data';

const PAGE_SIZE_KEY = 'lateless.latePayersPageSize';
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

type LatePayersControlsProps = {
  sortKey: LatePayerSortKey;
  sortDir: LatePayerSortDir;
  pageSize: number;
};

function normalizeStoredPageSize(value: string | null): number | null {
  if (value === '25' || value === '50' || value === '100' || value === '200') {
    return Number(value);
  }
  return null;
}

export default function LatePayersControls({
  sortKey,
  sortDir,
  pageSize,
}: LatePayersControlsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const replaceWithParams = (updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams);
    updater(params);
    params.set('lpPage', '1');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (searchParams.get('lpPageSize')) {
      return;
    }

    const storedPageSize = normalizeStoredPageSize(
      window.localStorage.getItem(PAGE_SIZE_KEY),
    );

    if (!storedPageSize) {
      return;
    }

    const params = new URLSearchParams(searchParams);
    params.set('lpPageSize', String(storedPageSize));
    params.set('lpPage', '1');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <div className={listControlsPanelClasses}>
      <div className="flex items-center gap-2">
        <Search
          placeholder="Search customer, email, invoice #..."
          queryParam="lpQuery"
          pageParam="lpPage"
        />
      </div>

      <div className={listControlsRowClasses}>
        <label className={listControlsLabelClasses} htmlFor="late-payers-sort">
          Sort
        </label>
        <SelectTrigger
          id="late-payers-sort"
          value={sortKey}
          onChange={(event) => {
            replaceWithParams((params) => {
              params.set('lpSort', event.target.value);
            });
          }}
          className="min-w-36"
        >
          <option value="days_overdue">Days overdue</option>
          <option value="paid_invoices">Paid invoices</option>
          <option value="amount">Amount</option>
          <option value="name">Name</option>
          <option value="email">Email</option>
        </SelectTrigger>

        <SelectTrigger
          aria-label="Sort direction"
          value={sortDir}
          onChange={(event) => {
            replaceWithParams((params) => {
              params.set('lpDir', event.target.value);
            });
          }}
          className="min-w-24"
        >
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </SelectTrigger>

        <label
          className={clsx(listControlsLabelClasses, 'ml-1')}
          htmlFor="late-payers-page-size"
        >
          Rows per page
        </label>
        <SelectTrigger
          id="late-payers-page-size"
          value={String(pageSize)}
          onChange={(event) => {
            const nextPageSize = Number(event.target.value);
            window.localStorage.setItem(PAGE_SIZE_KEY, String(nextPageSize));
            replaceWithParams((params) => {
              params.set('lpPageSize', String(nextPageSize));
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
