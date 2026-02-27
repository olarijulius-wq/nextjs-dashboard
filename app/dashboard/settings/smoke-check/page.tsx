import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { diagnosticsEnabled } from '@/app/lib/admin-gates';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';
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
  let context;
  try {
    context = await ensureWorkspaceContextForCurrentUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login?callbackUrl=/dashboard/settings/smoke-check');
    }
    throw error;
  }
  if (!isInternalAdmin(context.userEmail)) {
    redirect('/dashboard/settings');
  }

  if (!diagnosticsEnabled()) {
    notFound();
  }

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
