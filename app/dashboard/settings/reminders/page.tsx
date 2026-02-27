import { Metadata } from 'next';
import postgres from 'postgres';
import { redirect } from 'next/navigation';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';
import {
  listReminderRunLogsPaged,
  isReminderRunLogsMigrationRequiredError,
  type ReminderRunLogRecord,
  type ReminderRunsQueryDir,
  type ReminderRunsQueryHasMore,
  type ReminderRunsQueryLegacy,
  type ReminderRunsQuerySent,
  type ReminderRunsQuerySort,
  type ReminderRunsQueryTriggeredBy,
} from '@/app/lib/reminder-run-logs';
import { isSettingsRemindersAdminEmail } from '@/app/lib/admin-gates';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';
import {
  countBadRows,
  countScopeRuns,
  getReminderRunsSchema,
  sampleBadRows,
} from '@/app/lib/reminder-runs-diagnostics';
import RemindersAdminPanel from './reminders-admin-panel';

export const metadata: Metadata = {
  title: 'Reminders Admin',
};

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export default async function RemindersAdminPage(props: {
  searchParams?: Promise<{
    scope?: string;
    q?: string;
    t?: string;
    more?: string;
    sent?: string;
    legacy?: string;
    sort?: string;
    dir?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  let migrationWarning: string | null = null;
  let runs: ReminderRunLogRecord[] = [];
  let activeWorkspaceId: string | null = null;
  let activeUserEmail: string | null = null;
  let selectedScope: 'workspace' | 'all' = 'workspace';
  let canUseAllScope = false;
  let totalCount = 0;
  let currentPage = 1;
  let pageSize = 50;
  let totalPages = 0;
  let supportsHasMoreFilter = true;
  let queryState: {
    q: string;
    triggeredBy: ReminderRunsQueryTriggeredBy;
    hasMore: ReminderRunsQueryHasMore;
    sent: ReminderRunsQuerySent;
    legacy: ReminderRunsQueryLegacy;
    sort: ReminderRunsQuerySort;
    dir: ReminderRunsQueryDir;
  } = {
    q: '',
    triggeredBy: 'all',
    hasMore: 'all',
    sent: 'all',
    legacy: 'all',
    sort: 'ran_at',
    dir: 'desc',
  };
  let diagnostics:
    | {
        schema: {
          hasWorkspaceId: boolean;
          hasUserEmail: boolean;
          hasActorEmail: boolean;
          hasConfig: boolean;
          rawJsonType: string | null;
        };
        counts: {
          totalRuns: number;
          workspaceScopedRuns: number;
          legacyRuns: number;
          cronRunsMissingWorkspaceId: number;
          rowsMissingUserEmail: number;
          totalBadRows: number;
        };
        samples: Array<{
          id: string;
          ranAt: string;
          triggeredBy: string;
          sent: number;
          workspaceId: string | null;
          userEmail: string | null;
          candidateWorkspaceIds: string[];
          updatedInvoiceIdsLength: number;
        }>;
      }
    | null = null;

  try {
    const searchParams = await props.searchParams;
    const context = await ensureWorkspaceContextForCurrentUser();
    const canView = context.userRole === 'owner' || context.userRole === 'admin';

    if (!canView) {
      redirect('/dashboard/settings');
    }

    if (!isInternalAdmin(context.userEmail)) {
      redirect('/dashboard/settings');
    }

    if (!isSettingsRemindersAdminEmail(context.userEmail)) {
      redirect('/dashboard/settings');
    }

    activeWorkspaceId = context.workspaceId;
    activeUserEmail = context.userEmail;
    canUseAllScope = true;
    const requestedScope = searchParams?.scope?.trim().toLowerCase();
    selectedScope = requestedScope === 'all' && canUseAllScope ? 'all' : 'workspace';

    const q = searchParams?.q?.trim() || '';
    const triggeredBy: ReminderRunsQueryTriggeredBy =
      searchParams?.t === 'cron' || searchParams?.t === 'manual' ? searchParams.t : 'all';
    const hasMore: ReminderRunsQueryHasMore =
      searchParams?.more === 'true' || searchParams?.more === 'false'
        ? searchParams.more
        : 'all';
    const sent: ReminderRunsQuerySent =
      searchParams?.sent === 'gt0' || searchParams?.sent === 'eq0'
        ? searchParams.sent
        : 'all';
    const legacy: ReminderRunsQueryLegacy =
      searchParams?.legacy === 'legacy' || searchParams?.legacy === 'scoped'
        ? searchParams.legacy
        : 'all';
    const sort: ReminderRunsQuerySort =
      searchParams?.sort === 'sent' ||
      searchParams?.sort === 'failed' ||
      searchParams?.sort === 'skipped' ||
      searchParams?.sort === 'triggered_by' ||
      searchParams?.sort === 'actor_email' ||
      searchParams?.sort === 'ran_at'
        ? searchParams.sort
        : 'ran_at';
    const dir: ReminderRunsQueryDir =
      searchParams?.dir === 'asc' || searchParams?.dir === 'desc'
        ? searchParams.dir
        : 'desc';
    const parsedPage = Number(searchParams?.page);
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.trunc(parsedPage) : 1;
    const parsedPageSize = Number(searchParams?.pageSize);
    const safePageSize =
      parsedPageSize === 10 ||
      parsedPageSize === 25 ||
      parsedPageSize === 50 ||
      parsedPageSize === 100
        ? parsedPageSize
        : 50;

    const logs = await listReminderRunLogsPaged({
      scope: selectedScope,
      workspaceId: context.workspaceId,
      userEmail: context.userEmail,
      q,
      triggeredBy,
      hasMore,
      sent,
      legacy,
      sort,
      dir,
      page: safePage,
      pageSize: safePageSize,
    });
    runs = logs.rows;
    totalCount = logs.totalCount;
    currentPage = logs.page;
    pageSize = logs.pageSize;
    totalPages = logs.totalPages;
    supportsHasMoreFilter = logs.capabilities.hasHasMore;
    queryState = {
      q,
      triggeredBy,
      hasMore,
      sent,
      legacy,
      sort,
      dir,
    };

    const schema = await getReminderRunsSchema(sql);
    const [badCounts, scopeCounts, samples] = await Promise.all([
      countBadRows(sql, schema),
      countScopeRuns(
        sql,
        { workspaceId: context.workspaceId, userEmail: context.userEmail },
        schema,
      ),
      sampleBadRows(sql, 5, schema),
    ]);
    diagnostics = {
      schema: {
        hasWorkspaceId: schema.hasWorkspaceId,
        hasUserEmail: schema.hasUserEmail,
        hasActorEmail: schema.hasActorEmail,
        hasConfig: schema.hasConfig,
        rawJsonType: schema.rawJsonType,
      },
      counts: {
        totalRuns: scopeCounts.totalRuns,
        workspaceScopedRuns: scopeCounts.workspaceScopedRuns,
        legacyRuns: Math.max(0, scopeCounts.totalRuns - scopeCounts.workspaceScopedRuns),
        cronRunsMissingWorkspaceId: badCounts.cronRunsMissingWorkspaceId,
        rowsMissingUserEmail: badCounts.rowsMissingUserEmail,
        totalBadRows: badCounts.totalBadRows,
      },
      samples,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login?callbackUrl=/dashboard/settings/reminders');
    }

    if (
      isTeamMigrationRequiredError(error) ||
      isReminderRunLogsMigrationRequiredError(error)
    ) {
      migrationWarning =
        'Reminder admin logs unavailable. Run migrations through 032_backfill_reminder_runs_scope.sql.';
    } else {
      throw error;
    }
  }

  return (
    <div className="space-y-4">
      {migrationWarning ? (
        <p className="rounded-xl border border-amber-300 bg-amber-100 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {migrationWarning}
        </p>
      ) : null}
      <RemindersAdminPanel
        runs={runs}
        activeWorkspaceId={activeWorkspaceId}
        activeUserEmail={activeUserEmail}
        selectedScope={selectedScope}
        canUseAllScope={canUseAllScope}
        queryState={queryState}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
        supportsHasMoreFilter={supportsHasMoreFilter}
        diagnostics={diagnostics}
      />
    </div>
  );
}
