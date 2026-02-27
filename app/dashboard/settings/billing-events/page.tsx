import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import BillingEventsPanel from './billing-events-panel';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const metadata: Metadata = {
  title: 'Billing Events',
};

type BillingEventsSearchParams = {
  q?: string;
  t?: string;
  status?: string;
  page?: string;
  pageSize?: string;
  sort?: string;
  dir?: string;
};

const ALLOWED_SORT = new Set(['created_at', 'event_type', 'status']);
const ALLOWED_DIR = new Set(['asc', 'desc']);

export default async function BillingEventsPage(props: {
  searchParams?: Promise<BillingEventsSearchParams>;
}) {
  const searchParams = await props.searchParams;

  let context;
  try {
    context = await ensureWorkspaceContextForCurrentUser();
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login?callbackUrl=/dashboard/settings/billing-events');
    }
    throw error;
  }

  const canView = context.userRole === 'owner' || context.userRole === 'admin';
  if (!canView) {
    redirect('/dashboard/settings');
  }

  if (!isInternalAdmin(context.userEmail)) {
    redirect('/dashboard/settings');
  }

  const q = searchParams?.q?.trim() ?? '';
  const t = searchParams?.t?.trim() ?? '';
  const status = searchParams?.status?.trim() ?? '';
  const sort = ALLOWED_SORT.has(searchParams?.sort ?? '')
    ? (searchParams?.sort as 'created_at' | 'event_type' | 'status')
    : 'created_at';
  const dir = ALLOWED_DIR.has(searchParams?.dir ?? '')
    ? (searchParams?.dir as 'asc' | 'desc')
    : 'desc';

  const parsedPage = Number(searchParams?.page ?? '1');
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.trunc(parsedPage) : 1;

  const parsedPageSize = Number(searchParams?.pageSize ?? '50');
  const pageSize =
    parsedPageSize === 25 || parsedPageSize === 50 || parsedPageSize === 100
      ? parsedPageSize
      : 50;

  const offset = (page - 1) * pageSize;

  const whereParts = [sql`workspace_id = ${context.workspaceId}`];
  if (t) {
    whereParts.push(sql`event_type = ${t}`);
  }
  if (status) {
    whereParts.push(sql`status = ${status}`);
  }
  if (q) {
    const pattern = `%${q}%`;
    whereParts.push(sql`(event_type ilike ${pattern} or meta::text ilike ${pattern})`);
  }
  const whereSql = whereParts.reduce(
    (acc, clause, index) => (index === 0 ? clause : sql`${acc} and ${clause}`),
    whereParts[0],
  );
  const orderBy = `${sort} ${dir}`;

  const countRows = await sql<{ count: string }[]>`
    select count(*)::text as count
    from public.billing_events
    where ${whereSql}
  `;

  const totalCount = Number(countRows[0]?.count ?? '0');
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const rows = await sql<{
    id: string;
    event_type: string;
    status: string | null;
    stripe_event_id: string | null;
    stripe_object_id: string | null;
    user_email: string | null;
    created_at: Date;
    meta: unknown;
  }[]>`
    select
      id,
      event_type,
      status,
      stripe_event_id,
      stripe_object_id,
      user_email,
      created_at,
      meta
    from public.billing_events
    where ${whereSql}
    order by ${sql.unsafe(orderBy)}
    limit ${pageSize}
    offset ${offset}
  `;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Billing events</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Workspace-scoped audit trail for billing and recovery activity.
        </p>
      </div>
      <BillingEventsPanel
        rows={rows.map((row) => ({
          id: row.id,
          eventType: row.event_type,
          status: row.status,
          stripeEventId: row.stripe_event_id,
          stripeObjectId: row.stripe_object_id,
          userEmail: row.user_email,
          createdAt: row.created_at.toISOString(),
          meta: row.meta,
        }))}
        totalPages={totalPages}
        totalCount={totalCount}
        currentPage={page}
        pageSize={pageSize}
        query={{
          q,
          t,
          status,
          sort,
          dir,
        }}
      />
    </div>
  );
}
