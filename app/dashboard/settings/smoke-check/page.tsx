import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getSmokeCheckAccessDecision,
  getLatestSmokeCheckRun,
  getSmokeCheckPingPayload,
} from '@/app/lib/smoke-check';
import { PageShell, SectionCard } from '@/app/ui/page-layout';
import SmokeCheckPanel from './smoke-check-panel';

export const metadata: Metadata = {
  title: 'Production smoke checks',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SmokeCheckPage() {
  const decision = await getSmokeCheckAccessDecision();
  if (!decision.allowed || !decision.context) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[diag-gate] /dashboard/settings/smoke-check denied: ${decision.reason}`);
    }
    notFound();
  }

  const [lastRun, ping] = await Promise.all([
    getLatestSmokeCheckRun(),
    getSmokeCheckPingPayload(decision.context),
  ]);

  return (
    <PageShell
      title="Production smoke checks"
      subtitle="Safe launch P0 verification for payments, email, webhooks, schema, and observability."
      className="max-w-5xl"
    >
      <SectionCard>
        <SmokeCheckPanel
          initialLastRun={lastRun}
          initialEmailPreview={ping.emailPreview}
          timezone="Europe/Tallinn"
        />
      </SectionCard>
    </PageShell>
  );
}
