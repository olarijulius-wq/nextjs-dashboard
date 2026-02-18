'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftIcon,
  Bars3Icon,
  PowerIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { getDashboardLinks } from '@/app/ui/dashboard/nav-links-data';
import ThemeToggleMenuItem from '@/app/ui/dashboard/theme-toggle-menu-item';
import { lusitana } from '@/app/ui/fonts';
import {
  NEUTRAL_FOCUS_RING_CLASSES,
  NEUTRAL_INACTIVE_ITEM_CLASSES,
} from '@/app/ui/dashboard/neutral-interaction';

type MobileDrawerProps = {
  userEmail: string;
  logoutAction: () => Promise<void>;
};

export default function MobileDrawer({ userEmail, logoutAction }: MobileDrawerProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const mainLinks = getDashboardLinks(userEmail);
  const accountMenuItemClasses = `flex items-center gap-2 rounded-lg px-2 py-2 text-base text-slate-900 transition dark:text-neutral-100 ${NEUTRAL_INACTIVE_ITEM_CLASSES} ${NEUTRAL_FOCUS_RING_CLASSES}`;

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative z-20 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 bg-white text-slate-900 transition hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-black dark:text-neutral-200 dark:hover:border-neutral-700 dark:hover:text-white md:hidden"
        aria-expanded={open}
        aria-controls="dashboard-mobile-drawer"
        aria-label="Open navigation menu"
      >
        <Bars3Icon className="h-6 w-6" />
      </button>

      <div
        id="dashboard-mobile-drawer"
        className={clsx(
          'fixed inset-0 z-[120] border-r border-neutral-200 bg-white text-slate-900 transition-transform duration-300 ease-out dark:border-neutral-800 dark:bg-black dark:text-neutral-100 md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col overflow-y-auto px-5 pb-8 pt-5">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Home
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 text-slate-600 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-slate-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-100"
              aria-label="Close navigation menu"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-10 space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">Navigation</p>
            <nav className="mt-4 space-y-1">
              {mainLinks.map((link) => {
                const LinkIcon = link.icon;
                const isActive =
                  link.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname === link.href || pathname.startsWith(`${link.href}/`);

                return (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      `${lusitana.className} flex items-center gap-3 rounded-xl px-2 py-3 text-3xl leading-none text-slate-700 transition hover:bg-neutral-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-neutral-950 dark:hover:text-white`,
                      isActive && 'text-slate-900 dark:text-white',
                    )}
                  >
                    <LinkIcon className="h-6 w-6 shrink-0" />
                    <span>{link.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="my-8 border-t border-neutral-200 dark:border-neutral-800" />

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-500">Account</p>
            {userEmail ? (
              <p className="truncate py-2 text-sm text-slate-600 dark:text-neutral-400">{userEmail}</p>
            ) : null}
            <div className="space-y-1">
              <Link
                href="/dashboard/profile"
                onClick={() => setOpen(false)}
                className={accountMenuItemClasses}
              >
                <UserCircleIcon className="h-5 w-5" />
                My profile
              </Link>
              <ThemeToggleMenuItem
                staticLabel="Toggle theme"
                className="px-2 py-2 text-base"
              />
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className={accountMenuItemClasses}
              >
                <ArrowLeftIcon className="h-5 w-5" />
                Homepage
              </Link>
              <Link
                href="/onboarding"
                onClick={() => setOpen(false)}
                className={accountMenuItemClasses}
              >
                <UserCircleIcon className="h-5 w-5" />
                Onboarding
              </Link>
              <form
                action={logoutAction}
                onSubmit={() => setOpen(false)}
              >
                <button
                  type="submit"
                  className={`w-full text-left ${accountMenuItemClasses}`}
                >
                  <PowerIcon className="h-5 w-5" />
                  Log out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
