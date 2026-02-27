import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { diagnosticsEnabled } from '@/app/lib/admin-gates';
import { getMigrationReport } from '@/app/lib/migration-tracker';
import { getSmokeCheckAccessDecision } from '@/app/lib/smoke-check';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';
import { SectionCard } from '@/app/ui/page-layout';
import MigrationsPanel from './migrations-panel';

export const metadata: Metadata = {
  title: 'Migrations',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MigrationsPage() {
  let context;
  try {
    context = await ensureWorkspaceContextForCurrentUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login?callbackUrl=/dashboard/settings/migrations');
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
  if (!decision.allowed) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[diag-gate] /dashboard/settings/migrations denied: ${decision.reason}`);
    }
    redirect('/dashboard/settings');
  }

  const report = await getMigrationReport();

  return (
    <SectionCard>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Migrations</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Deployment safety report for repository SQL migrations.
          </p>
        </div>
        <MigrationsPanel
          lastApplied={report.lastApplied}
          pending={report.pending}
          pendingFilenames={report.pendingFilenames}
        />
      </div>
    </SectionCard>
  );
}
