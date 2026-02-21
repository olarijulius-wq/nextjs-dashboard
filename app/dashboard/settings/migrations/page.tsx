import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { diagnosticsEnabled } from '@/app/lib/admin-gates';
import { getMigrationReport } from '@/app/lib/migration-tracker';
import { getSmokeCheckAccessDecision } from '@/app/lib/smoke-check';
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
  if (!diagnosticsEnabled()) {
    notFound();
  }

  const decision = await getSmokeCheckAccessDecision();
  if (!decision.allowed) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[diag-gate] /dashboard/settings/migrations denied: ${decision.reason}`);
    }
    notFound();
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
