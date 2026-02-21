import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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
  const context = await getLaunchCheckAccessContext();
  if (!context) {
    notFound();
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
