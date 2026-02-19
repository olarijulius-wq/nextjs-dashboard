'use client';

import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import Link from 'next/link';
import { generatePagination } from '@/app/lib/utils';
import { usePathname, useSearchParams } from 'next/navigation';
import { DARK_PAGINATION_BTN } from '@/app/ui/theme/tokens';

export default function Pagination({
  totalPages,
  pageParam = 'page',
}: {
  totalPages: number;
  pageParam?: string;
}) {
  // NOTE: Uncomment this code in Chapter 10
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get(pageParam)) || 1;
  const allPages = generatePagination(currentPage, totalPages);

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams);
    params.set(pageParam, pageNumber.toString());
    return `${pathname}?${params.toString()}`;
  };
  

  return (
    <>
      {/*  NOTE: Uncomment this code in Chapter 10 */}

      <div className="inline-flex">
        <PaginationArrow
          direction="left"
          href={createPageURL(currentPage - 1)}
          isDisabled={currentPage <= 1}
        />

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

        <PaginationArrow
          direction="right"
          href={createPageURL(currentPage + 1)}
          isDisabled={currentPage >= totalPages}
        />
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
  href,
  direction,
  isDisabled,
}: {
  href: string;
  direction: 'left' | 'right';
  isDisabled?: boolean;
}) {
  const className = clsx(
    `flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-900 bg-neutral-900 text-white transition duration-200 ease-out ${DARK_PAGINATION_BTN}`,
    {
      'pointer-events-none border-neutral-300 bg-white text-neutral-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-600': isDisabled,
      'hover:border-black hover:bg-black/90 hover:scale-[1.01]': !isDisabled,
      'mr-2 md:mr-4': direction === 'left',
      'ml-2 md:ml-4': direction === 'right',
    },
  );

  const icon =
    direction === 'left' ? (
      <ArrowLeftIcon className="w-4" />
    ) : (
      <ArrowRightIcon className="w-4" />
    );

  return isDisabled ? (
    <div className={className}>{icon}</div>
  ) : (
    <Link className={className} href={href}>
      {icon}
    </Link>
  );
}
