import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { diagnosticsEnabled } from '@/app/lib/admin-gates';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';
import {
  getLaunchCheckAccessDecision,
  getLatestLaunchCheckRun,
} from '@/app/lib/launch-check';
import { getLatestSmokeCheckRun, getSmokeCheckAccessDecision } from '@/app/lib/smoke-check';
import { PageShell, SectionCard } from '@/app/ui/page-layout';
import AllChecksPanel from './all-checks-panel';

export const metadata: Metadata = {
  title: 'All checks',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AllChecksPage() {
  let context;
  try {
    context = await ensureWorkspaceContextForCurrentUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login?callbackUrl=/dashboard/settings/all-checks');
    }
    throw error;
  }
  if (!isInternalAdmin(context.userEmail)) {
    redirect('/dashboard/settings');
  }

  if (!diagnosticsEnabled()) {
    notFound();
  }

  const [launchDecision, smokeDecision] = await Promise.all([
    getLaunchCheckAccessDecision(),
    getSmokeCheckAccessDecision(),
  ]);
  if (!launchDecision.allowed || !smokeDecision.allowed) {
    if (process.env.NODE_ENV === 'development') {
      const reason = [
        !launchDecision.allowed ? `launch=${launchDecision.reason}` : null,
        !smokeDecision.allowed ? `smoke=${smokeDecision.reason}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
      console.warn(`[diag-gate] /dashboard/settings/all-checks denied: ${reason}`);
    }
    redirect('/dashboard/settings');
  }

  const [launchLastRun, smokeLastRun] = await Promise.all([
    getLatestLaunchCheckRun(),
    getLatestSmokeCheckRun(),
  ]);

  return (
    <PageShell
      title="All checks"
      subtitle="Run launch + smoke checks together and copy a release-ready markdown report."
      className="max-w-5xl"
    >
      <SectionCard>
        <AllChecksPanel
          initialLaunchLastRun={launchLastRun}
          initialSmokeLastRun={smokeLastRun}
          timezone="Europe/Tallinn"
        />
      </SectionCard>
    </PageShell>
  );
}
