'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  HomeIcon,
  PowerIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { getDashboardLinks } from '@/app/ui/dashboard/nav-links-data';
import ThemeToggleMenuItem from '@/app/ui/dashboard/theme-toggle-menu-item';
import { lusitana } from '@/app/ui/fonts';
import {
  NEUTRAL_FOCUS_RING_CLASSES,
  NEUTRAL_INACTIVE_ITEM_CLASSES,
} from '@/app/ui/dashboard/neutral-interaction';

type MobileDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  logoutAction: () => Promise<void>;
  showBillingRecoveryWarning?: boolean;
};

export default function MobileDrawer({
  open,
  onOpenChange,
  userEmail,
  logoutAction,
  showBillingRecoveryWarning = false,
}: MobileDrawerProps) {
  const pathname = usePathname();
  const mainLinks = getDashboardLinks(userEmail);
  const accountMenuItemClasses = `flex items-center gap-2 rounded-lg px-2 py-2 text-base text-slate-900 transition dark:text-neutral-100 ${NEUTRAL_INACTIVE_ITEM_CLASSES} ${NEUTRAL_FOCUS_RING_CLASSES}`;

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <div
        className={clsx(
          'pointer-events-none fixed inset-0 z-[120] bg-black/35 transition-opacity duration-300 ease-out md:hidden',
          open ? 'opacity-100' : 'opacity-0',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        onClick={() => onOpenChange(false)}
        aria-hidden={!open}
      />

      <div
        id="dashboard-mobile-drawer"
        className={clsx(
          'fixed inset-y-0 left-0 z-[125] w-[min(86vw,360px)] border-r border-neutral-200 bg-white text-slate-900 shadow-2xl transition-transform duration-300 ease-out dark:border-neutral-800 dark:bg-black dark:text-neutral-100 md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col overflow-y-auto px-5 pb-8 pt-5">
          <div className="flex items-center justify-start">
            <Link
              href="/"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-900 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Home
            </Link>
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
                    onClick={() => onOpenChange(false)}
                    className={clsx(
                      `${lusitana.className} flex items-center gap-3 rounded-xl px-2 py-3 text-3xl leading-none text-slate-700 transition hover:bg-neutral-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-neutral-950 dark:hover:text-white`,
                      isActive && 'text-slate-900 dark:text-white',
                    )}
                  >
                    <LinkIcon className="h-6 w-6 shrink-0" />
                    <span>{link.name}</span>
                    {showBillingRecoveryWarning && link.proOnly ? (
                      <span className="rounded-full border border-amber-400/60 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                        Billing
                      </span>
                    ) : null}
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
                onClick={() => onOpenChange(false)}
                className={accountMenuItemClasses}
              >
                <UserCircleIcon className="h-5 w-5" />
                My profile
              </Link>
              <Link
                href="/dashboard/settings"
                onClick={() => onOpenChange(false)}
                className={accountMenuItemClasses}
              >
                <Cog6ToothIcon className="h-5 w-5" />
                Settings
              </Link>
              <ThemeToggleMenuItem
                staticLabel="Toggle theme"
                className="px-2 py-2 text-base"
              />
              <Link
                href="/"
                onClick={() => onOpenChange(false)}
                className={accountMenuItemClasses}
              >
                <HomeIcon className="h-5 w-5" />
                Homepage
              </Link>
              <Link
                href="/onboarding"
                onClick={() => onOpenChange(false)}
                className={accountMenuItemClasses}
              >
                <UserCircleIcon className="h-5 w-5" />
                Onboarding
              </Link>
              <form
                action={logoutAction}
                onSubmit={() => onOpenChange(false)}
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
