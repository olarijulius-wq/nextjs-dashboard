'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
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
  const prefersReducedMotion = useReducedMotion();
  const dashboardLinks = getDashboardLinks(userEmail);
  const MotionLink = motion(Link);

  return (
    <>
      {dashboardLinks.map((link) => {
        const LinkIcon = link.icon;
        const isActive =
          link.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <MotionLink
            key={link.name}
            href={link.href}
            whileHover={prefersReducedMotion ? undefined : { y: -1 }}
            whileTap={prefersReducedMotion ? undefined : { y: 1, scale: 0.98 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.2, ease: 'easeOut' }
                : { type: 'spring', stiffness: 500, damping: 35 }
            }
            className={clsx(
              'relative flex h-[44px] grow items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm leading-5 font-medium text-neutral-700 shadow-[0_0_0_0_rgba(0,0,0,0)] transition duration-200 ease-out hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 hover:shadow-[0_4px_10px_rgba(15,23,42,0.06)] md:flex-none md:justify-start dark:border-neutral-900 dark:bg-black dark:text-neutral-400 dark:hover:border-zinc-700 dark:hover:bg-neutral-950 dark:hover:text-neutral-100 dark:hover:shadow-[0_0_0_1px_rgba(63,63,70,0.4),0_0_14px_rgba(16,185,129,0.08)]',
              {
                'border-neutral-300 bg-neutral-100 text-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_0_0_1px_rgba(115,115,115,0.25)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(163,163,163,0.25)]':
                  isActive,
              },
            )}
          >
            {isActive ? (
              <span
                aria-hidden
                className="absolute top-[7px] bottom-[7px] left-1.5 w-0.5 rounded-full bg-emerald-500/80 dark:bg-emerald-400/75"
              />
            ) : null}
            <LinkIcon className="w-5" />
            <p className="hidden text-sm leading-5 md:block">{link.name}</p>
            {showBillingRecoveryWarning && link.proOnly ? (
              <span className="hidden rounded-full border border-amber-400/60 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-900 md:inline-flex dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                billing
              </span>
            ) : null}
          </MotionLink>
        );
      })}
    </>
  );
}
