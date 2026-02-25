import Link from 'next/link';
import NavLinks from '@/app/ui/dashboard/nav-links';
import { AccountMenuItems } from '@/app/ui/dashboard/mobile-drawer';
import AcmeLogo from '@/app/ui/acme-logo';
import {
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { signOut } from '@/auth';
import { auth } from '@/auth';
import MobileNav from '@/app/ui/dashboard/mobile-nav';
import FitTextEmail from '@/app/ui/dashboard/fit-text-email';
import {
  ensureWorkspaceContextForCurrentUser,
} from '@/app/lib/workspaces';
import { fetchWorkspaceDunningState } from '@/app/lib/billing-dunning';

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
  const accountMenuItemCount = 6;
  const shouldShowAccountMenu = accountMenuItemCount > 0;
  let showBillingRecoveryWarning = false;
  try {
    const workspaceContext = await ensureWorkspaceContextForCurrentUser();
    const dunningState = await fetchWorkspaceDunningState(workspaceContext.workspaceId);
    showBillingRecoveryWarning = Boolean(dunningState?.recoveryRequired);
  } catch {
    showBillingRecoveryWarning = false;
  }

  return (
    <div className="flex h-full flex-col gap-2 px-3 py-4 md:px-2">
      <MobileNav
        userEmail={userEmail}
        logoutAction={logoutAction}
        showBillingRecoveryWarning={showBillingRecoveryWarning}
      />

      <div className="hidden md:flex md:h-full md:flex-col">
        <Link
          className="mb-2 flex h-20 items-end justify-start rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] transition md:h-40 dark:border-neutral-900 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]"
          href="/"
        >
          <div className="w-32 text-slate-900 dark:text-slate-100 md:w-40">
            <AcmeLogo />
          </div>
        </Link>
        <div className="flex h-full flex-col">
          <NavLinks
            userEmail={userEmail}
            showBillingRecoveryWarning={showBillingRecoveryWarning}
          />
          {shouldShowAccountMenu ? (
            <div className="mt-auto sticky bottom-4 z-[90] w-full pt-4">
              <details className="group relative rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-xl backdrop-blur dark:border-neutral-900 dark:bg-black/95">
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
                  />
                </div>
              </details>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
