import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';
import { getLaunchCheckAccessContext, getLatestLaunchCheckRun } from '@/app/lib/launch-check';
import { PageShell, SectionCard } from '@/app/ui/page-layout';
import LaunchCheckPanel from './launch-check-panel';

export const metadata: Metadata = {
  title: 'Launch readiness',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LaunchCheckPage() {
  let workspaceContext;
  try {
    workspaceContext = await ensureWorkspaceContextForCurrentUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login?callbackUrl=/dashboard/settings/launch-check');
    }
    throw error;
  }
  if (!isInternalAdmin(workspaceContext.userEmail)) {
    redirect('/dashboard/settings');
  }

  const context = await getLaunchCheckAccessContext();
  if (!context) {
    redirect('/dashboard/settings');
  }

  const lastRun = await getLatestLaunchCheckRun();

  return (
    <PageShell
      title="Launch readiness"
      subtitle="Run SEO/canonical/noindex checks against the resolved production site URL."
      className="max-w-5xl"
    >
      <SectionCard>
        <LaunchCheckPanel initialLastRun={lastRun} timezone="Europe/Tallinn" />
      </SectionCard>
    </PageShell>
  );
}
