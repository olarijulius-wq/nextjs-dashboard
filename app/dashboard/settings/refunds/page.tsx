import { Metadata } from 'next';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import RefundRequestsPanel from './refund-requests-panel';

export const metadata: Metadata = {
  title: 'Refund Requests',
};

const migrationMessage =
  'Refund requests require DB migration 019_add_refund_requests.sql. Run migrations and retry.';

export default async function RefundsPage() {
  let canManage = false;
  let migrationWarning: string | null = null;

  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    canManage = context.userRole === 'owner' || context.userRole === 'admin';
  } catch (error) {
    if (isTeamMigrationRequiredError(error)) {
      migrationWarning = migrationMessage;
    } else {
      throw error;
    }
  }

  if (migrationWarning) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        {migrationWarning}
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-slate-700 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:text-slate-300 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        Only owners and admins can view refund requests.
      </div>
    );
  }

  return <RefundRequestsPanel />;
}
