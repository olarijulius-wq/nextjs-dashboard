// app/api/customers/export/route.ts
import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { auth } from '@/auth';
import { PLAN_CONFIG, resolveEffectivePlan } from '@/app/lib/config';
import { enforceRateLimit } from '@/app/lib/security/api-guard';
import { requireWorkspaceContext } from '@/app/lib/workspace-context';
import { resolveBillingContext } from '@/app/lib/workspace-billing';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const TEST_HOOKS_ENABLED =
  process.env.NODE_ENV === 'test' && process.env.LATELLESS_TEST_MODE === '1';
export const __testHooksEnabled = TEST_HOOKS_ENABLED;

export const __testHooks = {
  authOverride: null as (null | (() => Promise<{ user?: { email?: string | null } | null } | null>)),
  requireWorkspaceContextOverride: null as
    | (null | (() => Promise<{ userEmail: string; workspaceId: string }>)),
  enforceRateLimitOverride: null as
    | (null | ((req: Request, input: {
      bucket: string;
      windowSec: number;
      ipLimit: number;
      userLimit: number;
    }, opts: { userKey: string }) => Promise<Response | null>)),
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function GET(req: Request) {
  const session = TEST_HOOKS_ENABLED
    ? (__testHooks.authOverride ? await __testHooks.authOverride() : await auth())
    : await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let context;
  try {
    context = TEST_HOOKS_ENABLED
      ? (__testHooks.requireWorkspaceContextOverride
        ? await __testHooks.requireWorkspaceContextOverride()
        : await requireWorkspaceContext())
      : await requireWorkspaceContext();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const email = normalizeEmail(context.userEmail);

  const rl = TEST_HOOKS_ENABLED
    ? (__testHooks.enforceRateLimitOverride
      ? await __testHooks.enforceRateLimitOverride(req, {
        bucket: 'customers_export',
        windowSec: 300,
        ipLimit: 10,
        userLimit: 5,
      }, { userKey: email })
      : await enforceRateLimit(req, {
        bucket: 'customers_export',
        windowSec: 300,
        ipLimit: 10,
        userLimit: 5,
      }, { userKey: email }))
    : await enforceRateLimit(req, {
      bucket: 'customers_export',
      windowSec: 300,
      ipLimit: 10,
      userLimit: 5,
    }, { userKey: email });
  if (rl) return rl;

  const billing = await resolveBillingContext({
    workspaceId: context.workspaceId,
    userEmail: email,
  });

  const effectivePlan = resolveEffectivePlan(
    billing.plan,
    billing.subscriptionStatus,
  );
  const planConfig = PLAN_CONFIG[effectivePlan];

  if (!planConfig.canExportCsv) {
    return NextResponse.json(
      {
        error: 'PLAN_REQUIRED',
        message:
          'CSV export is available on Solo, Pro, and Studio. Upgrade your plan in Settings.',
        requiredPlan: 'solo',
      },
      { status: 403 },
    );
  }

  // Tõmba kõik customers, mis kuuluvad sellele user’ile
  const [scopeMeta] = await sql<{ has_workspace_id: boolean }[]>`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'customers'
        and column_name = 'workspace_id'
    ) as has_workspace_id
  `;
  const workspaceId = context.workspaceId?.trim() || '';
  const useWorkspaceScope = Boolean(scopeMeta?.has_workspace_id) && workspaceId.length > 0;

  const rows = await sql<
    { id: string; name: string; email: string | null }[]
  >`
    select id, name, email
    from public.customers
    where
      (${useWorkspaceScope} = true and workspace_id = ${workspaceId})
      or (${useWorkspaceScope} = false and lower(user_email) = ${email})
    order by name asc
  `;

  // Ehita CSV
  const header = ['id', 'name', 'email'];
  const escape = (value: unknown) => {
    const str = value == null ? '' : String(value);
    // Topeltjutumärgid escape’iks
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const lines = [
    header.join(','), // header
    ...rows.map((row) =>
      [
        escape(row.id),
        escape(row.name),
        escape(row.email ?? ''),
      ].join(','),
    ),
  ];

  const csv = lines.join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="customers.csv"',
    },
  });
}
