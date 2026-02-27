import { NextResponse } from 'next/server';
import {
  getLaunchCheckAccessDecision,
  runLaunchReadinessChecks,
} from '@/app/lib/launch-check';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';

export const runtime = 'nodejs';

function noindexJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function POST() {
  try {
    const workspaceContext = await ensureWorkspaceContextForCurrentUser();
    if (!isInternalAdmin(workspaceContext.userEmail)) {
      return noindexJson({ ok: false, error: 'Forbidden' }, 403);
    }

    const decision = await getLaunchCheckAccessDecision();
    if (!decision.allowed || !decision.context) {
      return noindexJson({ ok: false, error: 'Forbidden' }, 403);
    }

    const payload = await runLaunchReadinessChecks(decision.context.userEmail);
    return noindexJson(payload);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return noindexJson({ ok: false, error: 'Unauthorized' }, 401);
    }
    console.error('Launch readiness check failed:', error);
    return noindexJson(
      { ok: false, error: 'Failed to run launch readiness checks.' },
      500,
    );
  }
}
