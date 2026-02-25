import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  countWorkspacesForUser,
  createWorkspaceForUser,
  isTeamMigrationRequiredError,
  normalizeCompanyName,
  TEAM_MIGRATION_REQUIRED_CODE,
} from '@/app/lib/workspaces';
import { requireWorkspaceRole } from '@/app/lib/workspace-context';
import { COMPANY_LIMIT_BY_PLAN, normalizePlan } from '@/app/lib/config';
import { readCanonicalWorkspacePlanSource } from '@/app/lib/billing-sync';
import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

const createCompanySchema = z
  .object({
    name: z
      .string()
      .max(200)
      .optional()
      .default('Company')
      .transform((value) => normalizeCompanyName(value)),
  })
  .strict();

async function resolveCompanyLimitForUser(input: { workspaceId: string; userId: string }) {
  const planSource = await readCanonicalWorkspacePlanSource({
    workspaceId: input.workspaceId,
    userId: input.userId,
  });
  const plan = normalizePlan(planSource.value);
  return {
    plan,
    limit: COMPANY_LIMIT_BY_PLAN[plan],
  };
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireWorkspaceRole(['owner', 'admin']);

    const rl = await enforceRateLimit(
      request,
      {
        bucket: 'companies_create',
        windowSec: 300,
        ipLimit: 20,
        userLimit: 8,
      },
      { userKey: context.userEmail },
    );
    if (rl) return rl;

    const parsedBody = await parseJsonBody(request, createCompanySchema);
    if (!parsedBody.ok) return parsedBody.response;

    const [counts, planLimit] = await Promise.all([
      countWorkspacesForUser(context.userId),
      resolveCompanyLimitForUser({
        workspaceId: context.workspaceId,
        userId: context.userId,
      }),
    ]);

    if (counts >= planLimit.limit) {
      return NextResponse.json(
        {
          ok: false,
          code: 'COMPANY_LIMIT_REACHED',
          message: `Your ${planLimit.plan} plan allows up to ${Number.isFinite(planLimit.limit) ? planLimit.limit : 'unlimited'} companies.`,
          plan: planLimit.plan,
          limit: Number.isFinite(planLimit.limit) ? planLimit.limit : null,
        },
        { status: 409 },
      );
    }

    const created = await createWorkspaceForUser({
      userId: context.userId,
      name: parsedBody.data.name ?? 'Company',
    });

    return NextResponse.json({
      ok: true,
      id: created.id,
      name: created.name,
    });
  } catch (error) {
    if (isTeamMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: TEAM_MIGRATION_REQUIRED_CODE,
          message:
            'Team requires DB migrations 007_add_workspaces_and_team.sql and 013_add_active_workspace_and_company_profile_workspace_scope.sql. Run migrations and retry.',
        },
        { status: 503 },
      );
    }

    if (error instanceof Error && error.message === 'invalid_company_name') {
      return NextResponse.json(
        {
          ok: false,
          code: 'INVALID_COMPANY_NAME',
          message: 'Company name must be between 1 and 80 characters.',
        },
        { status: 400 },
      );
    }

    console.error('Create company failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to create company.' },
      { status: 500 },
    );
  }
}
