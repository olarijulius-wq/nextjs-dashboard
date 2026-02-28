import SideNav from '@/app/ui/dashboard/sidenav';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import FeedbackButton from '@/app/ui/dashboard/feedback-button';
import BillingRecoveryBanner from '@/app/ui/dashboard/billing-recovery-banner';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import {
  fetchWorkspaceDunningState,
  shouldShowDunningBanner,
} from '@/app/lib/billing-dunning';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};
 
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }
  const showFeedbackButton =
    session.user.email.trim().toLowerCase() === 'user@nextmail.com';
  let showRecoveryBanner = false;

  try {
    const workspaceContext = await ensureWorkspaceContextForCurrentUser();
    const dunningState = await fetchWorkspaceDunningState(workspaceContext.workspaceId);
    showRecoveryBanner = shouldShowDunningBanner(dunningState);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login');
    }
    showRecoveryBanner = false;
  }

  return (
    <div className="flex flex-col bg-white text-slate-900 md:h-screen md:flex-row md:overflow-hidden dark:bg-black dark:text-slate-100">
      <aside className="z-50 w-full flex-none overflow-hidden border-b border-neutral-200 bg-white pt-[env(safe-area-inset-top)] md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r md:pt-0 dark:border-neutral-800 dark:bg-black">
        <SideNav />
      </aside>
      {/* min-w-0 lets long children shrink instead of forcing page-level horizontal overflow */}
      <main className="min-w-0 w-full flex-1 overflow-y-auto overflow-x-hidden bg-white p-6 md:h-screen md:p-12 dark:bg-black">
        {showRecoveryBanner ? (
          <div className="mb-4">
            <BillingRecoveryBanner />
          </div>
        ) : null}
        {showFeedbackButton ? (
          <div className="mb-4 flex justify-end">
            <FeedbackButton />
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
