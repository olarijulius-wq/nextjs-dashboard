'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import clsx from 'clsx';
import { generatePagination } from '@/app/lib/utils';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DARK_PAGINATION_BTN } from '@/app/ui/theme/tokens';

export default function Pagination({
  totalPages,
  pageParam = 'page',
}: {
  totalPages: number;
  pageParam?: string;
}) {
  // NOTE: Uncomment this code in Chapter 10
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const safeTotalPages = Math.max(1, totalPages);
  const rawPage = Number(searchParams.get(pageParam)) || 1;
  const currentPage = Math.min(Math.max(rawPage, 1), safeTotalPages);
  const allPages = generatePagination(currentPage, safeTotalPages);
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < safeTotalPages;

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams);
    params.set(pageParam, pageNumber.toString());
    return `${pathname}?${params.toString()}`;
  };
  if (safeTotalPages <= 1) {
    return (
      <div className="inline-flex">
        <PaginationNumber
          href={createPageURL(1)}
          page={1}
          position="single"
          isActive={true}
        />
      </div>
    );
  }

  return (
    <>
      {/*  NOTE: Uncomment this code in Chapter 10 */}

      <div className="inline-flex">
        {hasPrev ? (
          <PaginationArrow
            direction="left"
            onNavigate={() => router.push(createPageURL(currentPage - 1))}
          />
        ) : null}

        <div className="flex -space-x-px">
          {allPages.map((page, index) => {
            let position: 'first' | 'last' | 'single' | 'middle' | undefined;

            if (index === 0) position = 'first';
            if (index === allPages.length - 1) position = 'last';
            if (allPages.length === 1) position = 'single';
            if (page === '...') position = 'middle';

            return (
              <PaginationNumber
                key={`${page}-${index}`}
                href={createPageURL(page)}
                page={page}
                position={position}
                isActive={currentPage === page}
              />
            );
          })}
        </div>

        {hasNext ? (
          <PaginationArrow
            direction="right"
            onNavigate={() => router.push(createPageURL(currentPage + 1))}
          />
        ) : null}
      </div>
    </>
  );
}

function PaginationNumber({
  page,
  href,
  isActive,
  position,
}: {
  page: number | string;
  href: string;
  position?: 'first' | 'last' | 'middle' | 'single';
  isActive: boolean;
}) {
  const className = clsx(
    `flex h-10 w-10 items-center justify-center border border-neutral-900 bg-neutral-900 text-sm text-white transition duration-200 ease-out ${DARK_PAGINATION_BTN}`,
    {
      'rounded-l-xl': position === 'first' || position === 'single',
      'rounded-r-xl': position === 'last' || position === 'single',
      'z-10 border-black bg-black text-white shadow-[0_0_0_1px_rgba(15,23,42,0.12)] dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:shadow-[0_0_0_1px_rgba(63,63,70,0.6)]':
        isActive,
      'hover:border-black hover:bg-black/90 hover:scale-[1.01]': !isActive && position !== 'middle',
      'border-neutral-300 bg-white text-neutral-500 dark:border-zinc-800 dark:bg-black dark:text-zinc-500': position === 'middle',
    },
  );

  return isActive || position === 'middle' ? (
    <div className={className}>{page}</div>
  ) : (
    <Link href={href} className={className}>
      {page}
    </Link>
  );
}

function PaginationArrow({
  onNavigate,
  direction,
  isDisabled,
}: {
  onNavigate: () => void;
  direction: 'left' | 'right';
  isDisabled?: boolean;
}) {
  const className = clsx(
    `flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-900 bg-neutral-900 text-white transition duration-200 ease-out ${DARK_PAGINATION_BTN}`,
    {
      'border-neutral-300 bg-white text-neutral-400 opacity-60 dark:border-zinc-800 dark:bg-black dark:text-zinc-500': isDisabled,
      'hover:border-black hover:bg-black/90 hover:scale-[1.01]': !isDisabled,
      'mr-2 md:mr-4': direction === 'left',
      'ml-2 md:ml-4': direction === 'right',
    },
  );

  const icon =
    direction === 'left' ? (
      <ChevronLeftIcon className="h-4 w-4" />
    ) : (
      <ChevronRightIcon className="h-4 w-4" />
    );

  return (
    <button
      type="button"
      onClick={onNavigate}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-label={direction === 'left' ? 'Go to previous page' : 'Go to next page'}
      title={direction === 'left' ? 'Previous page' : 'Next page'}
      className={className}
    >
      {icon}
    </button>
  );
}
