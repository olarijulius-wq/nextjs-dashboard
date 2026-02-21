import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLaunchCheckAccessContext, getLatestLaunchCheckRun } from '@/app/lib/launch-check';
import { getLatestSmokeCheckRun, getSmokeCheckAccessContext } from '@/app/lib/smoke-check';
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
  const [launchContext, smokeContext] = await Promise.all([
    getLaunchCheckAccessContext(),
    getSmokeCheckAccessContext(),
  ]);
  if (!launchContext || !smokeContext) {
    notFound();
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
