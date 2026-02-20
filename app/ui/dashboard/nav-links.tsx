'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { getDashboardLinks } from '@/app/ui/dashboard/nav-links-data';

type NavLinksProps = {
  userEmail?: string;
  showBillingRecoveryWarning?: boolean;
};

export default function NavLinks({
  userEmail = '',
  showBillingRecoveryWarning = false,
}: NavLinksProps) {
  const pathname = usePathname();
  const dashboardLinks = getDashboardLinks(userEmail);

  return (
    <>
      {dashboardLinks.map((link) => {
        const LinkIcon = link.icon;
        const isActive =
          link.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.name}
            href={link.href}
            className={clsx(
              'flex h-[44px] grow items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition duration-200 ease-out hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 md:flex-none md:justify-start dark:border-neutral-900 dark:bg-black dark:text-neutral-400 dark:hover:border-neutral-800 dark:hover:bg-neutral-950 dark:hover:text-neutral-100',
              {
                'border-neutral-300 bg-neutral-100 text-neutral-900 shadow-[0_0_0_1px_rgba(115,115,115,0.25)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:shadow-[0_0_0_1px_rgba(163,163,163,0.25)]':
                  isActive,
              },
            )}
          >
            <LinkIcon className="w-5" />
            <p className="hidden md:block">{link.name}</p>
            {showBillingRecoveryWarning && link.proOnly ? (
              <span className="hidden rounded-full border border-amber-400/60 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-900 md:inline-flex dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                billing
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
