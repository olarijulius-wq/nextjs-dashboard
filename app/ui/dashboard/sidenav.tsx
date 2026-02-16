import Link from 'next/link';
import NavLinks from '@/app/ui/dashboard/nav-links';
import AcmeLogo from '@/app/ui/acme-logo';
import {
  ChevronUpIcon,
  Cog6ToothIcon,
  HomeIcon,
  PowerIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { signOut } from '@/auth';
import { auth } from '@/auth';
import ThemeToggleMenuItem from '@/app/ui/dashboard/theme-toggle-menu-item';
import MobileDrawer from '@/app/ui/dashboard/mobile-drawer';
import {
  NEUTRAL_FOCUS_RING_CLASSES,
  NEUTRAL_INACTIVE_ITEM_CLASSES,
} from '@/app/ui/dashboard/neutral-interaction';

function getInitial(value: string) {
  const initial = value.trim().charAt(0).toUpperCase();
  return initial || '?';
}

export default async function SideNav() {
  const session = await auth();
  const userEmail = session?.user?.email ?? '';
  const identityLabel = userEmail || 'Account';
  const avatarInitial = getInitial(userEmail || '?');
  const logoutAction = async () => {
    'use server';
    await signOut({ redirectTo: '/' });
  };
  const accountMenuItemClasses = `flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-700 transition dark:text-neutral-300 ${NEUTRAL_INACTIVE_ITEM_CLASSES} ${NEUTRAL_FOCUS_RING_CLASSES}`;

  return (
    <div className="flex h-full flex-col gap-2 px-3 py-4 md:px-2">
      <MobileDrawer userEmail={userEmail} logoutAction={logoutAction} />

      <div className="hidden md:flex md:h-full md:flex-col">
        <Link
          className="mb-2 flex h-20 items-end justify-start rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] transition md:h-40 dark:border-neutral-900 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]"
          href="/"
        >
          <div className="w-32 text-slate-900 dark:text-slate-100 md:w-40">
            <AcmeLogo />
          </div>
        </Link>
        <div className="flex grow flex-row justify-between space-x-2 md:flex-col md:space-x-0 md:space-y-2">
          <NavLinks userEmail={userEmail} />
          <div className="hidden h-auto w-full grow rounded-md border border-neutral-200 bg-white md:block dark:border-neutral-900 dark:bg-black"></div>
          <details className="group relative">
            <summary className="flex h-[52px] w-full cursor-pointer list-none items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 text-left text-sm text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-900 dark:bg-black dark:text-neutral-200 dark:hover:border-neutral-800 dark:hover:bg-neutral-950">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black bg-black text-xs font-semibold text-white dark:border-neutral-700 dark:bg-black dark:text-neutral-200">
                {avatarInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {identityLabel}
                </p>
              </div>
              <ChevronUpIcon className="h-4 w-4 text-neutral-500 transition group-open:rotate-180 dark:text-neutral-400" />
            </summary>
            <div className="absolute bottom-full left-0 right-0 z-20 mb-2 rounded-xl border border-neutral-200 bg-white p-2 shadow-xl backdrop-blur dark:border-neutral-900 dark:bg-black">
              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-500">
                Account
              </p>
              <Link
                href="/dashboard/profile"
                className={accountMenuItemClasses}
              >
                <UserCircleIcon className="h-4 w-4" />
                My profile
              </Link>
              <Link
                href="/dashboard/settings"
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
                className={accountMenuItemClasses}
              >
                <HomeIcon className="h-4 w-4" />
                Homepage
              </Link>
              <Link
                href="/onboarding"
                className={accountMenuItemClasses}
              >
                <UserCircleIcon className="h-4 w-4" />
                Onboarding
              </Link>
              <form
                action={logoutAction}
              >
                <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10">
                  <PowerIcon className="h-4 w-4" />
                  Logout
                </button>
              </form>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
