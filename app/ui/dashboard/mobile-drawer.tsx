'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ArrowLeftIcon,
  ChevronUpIcon,
  Cog6ToothIcon,
  HomeIcon,
  PowerIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import NavLinks from '@/app/ui/dashboard/nav-links';
import ThemeToggleMenuItem from '@/app/ui/dashboard/theme-toggle-menu-item';
import FitTextEmail from '@/app/ui/dashboard/fit-text-email';
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

type AccountMenuItemsProps = {
  logoutAction: () => Promise<void>;
  onItemSelect?: () => void;
};

const accountMenuItemClasses = `flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-700 transition dark:text-neutral-300 ${NEUTRAL_INACTIVE_ITEM_CLASSES} ${NEUTRAL_FOCUS_RING_CLASSES}`;

function getInitial(value: string) {
  const initial = value.trim().charAt(0).toUpperCase();
  return initial || '?';
}

export function hasAccountMenuItems(input: {
  logoutAction?: (() => Promise<void>) | null;
}) {
  const hasProfileLink = true;
  const hasSettingsLink = true;
  const hasHomepageLink = true;
  const hasOnboardingLink = true;
  const hasThemeToggle = true;
  const hasLogout = typeof input.logoutAction === 'function';

  return (
    hasProfileLink ||
    hasSettingsLink ||
    hasHomepageLink ||
    hasOnboardingLink ||
    hasThemeToggle ||
    hasLogout
  );
}

export function AccountMenuItems({
  logoutAction,
  onItemSelect,
}: AccountMenuItemsProps) {
  return (
    <>
      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-500">
        Account
      </p>
      <Link
        href="/dashboard/profile"
        onClick={onItemSelect}
        className={accountMenuItemClasses}
      >
        <UserCircleIcon className="h-4 w-4" />
        My profile
      </Link>
      <Link
        href="/dashboard/settings"
        onClick={onItemSelect}
        className={accountMenuItemClasses}
      >
        <Cog6ToothIcon className="h-4 w-4" />
        Settings
      </Link>
      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-500">
        Preferences
      </p>
      <ThemeToggleMenuItem />
      <Link
        href="/"
        onClick={onItemSelect}
        className={accountMenuItemClasses}
      >
        <HomeIcon className="h-4 w-4" />
        Homepage
      </Link>
      <Link
        href="/dashboard/onboarding"
        onClick={onItemSelect}
        className={accountMenuItemClasses}
      >
        <UserCircleIcon className="h-4 w-4" />
        Onboarding
      </Link>
      <form
        action={logoutAction}
        onSubmit={onItemSelect}
      >
        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10">
          <PowerIcon className="h-4 w-4" />
          Logout
        </button>
      </form>
    </>
  );
}

export default function MobileDrawer({
  open,
  onOpenChange,
  userEmail,
  logoutAction,
  showBillingRecoveryWarning = false,
}: MobileDrawerProps) {
  const identityLabel = userEmail || 'Account';
  const avatarInitial = getInitial(userEmail || '?');
  const shouldShowAccountMenu = hasAccountMenuItems({ logoutAction });

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
        <div className="relative flex h-full flex-col overflow-y-auto px-5 pb-36 pt-5">
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
            <nav
              className="mt-4 space-y-1 [&>a]:justify-start [&>a>p]:!block"
              onClick={(event: React.MouseEvent<HTMLElement>) => {
                if ((event.target as HTMLElement).closest('a')) {
                  onOpenChange(false);
                }
              }}
            >
              <NavLinks
                userEmail={userEmail}
                showBillingRecoveryWarning={showBillingRecoveryWarning}
              />
            </nav>
          </div>

          {shouldShowAccountMenu ? (
            <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10">
              <details className="group pointer-events-auto relative rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-xl backdrop-blur dark:border-neutral-900 dark:bg-black/95">
                <summary className="flex h-[52px] w-full cursor-pointer list-none items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 text-left text-sm text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-900 dark:bg-black dark:text-neutral-200 dark:hover:border-neutral-800 dark:hover:bg-neutral-950">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black bg-black text-xs font-semibold text-white dark:border-neutral-700 dark:bg-black dark:text-neutral-200">
                    {avatarInitial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <FitTextEmail
                      email={identityLabel}
                      className="font-medium text-neutral-900 dark:text-neutral-100"
                    />
                  </div>
                  <ChevronUpIcon className="h-4 w-4 text-neutral-500 transition group-open:rotate-180 dark:text-neutral-400" />
                </summary>
                <div className="absolute bottom-full left-0 right-0 z-20 mb-2 rounded-xl border border-neutral-200 bg-white p-2 shadow-xl backdrop-blur dark:border-neutral-900 dark:bg-black">
                  <AccountMenuItems
                    logoutAction={logoutAction}
                    onItemSelect={() => onOpenChange(false)}
                  />
                </div>
              </details>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
