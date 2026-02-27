import { NextResponse } from 'next/server';
import { diagnosticsEnabled } from '@/app/lib/admin-gates';
import {
  getSmokeCheckAccessDecision,
  runProductionSmokeChecks,
} from '@/app/lib/smoke-check';
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
  if (!diagnosticsEnabled()) {
    return noindexJson({ ok: false, error: 'Not found' }, 404);
  }

  try {
    const workspaceContext = await ensureWorkspaceContextForCurrentUser();
    if (!isInternalAdmin(workspaceContext.userEmail)) {
      return noindexJson({ ok: false, error: 'Forbidden' }, 403);
    }

    const decision = await getSmokeCheckAccessDecision();
    if (!decision.allowed || !decision.context) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[diag-gate] /api/settings/smoke-check/run denied: ${decision.reason}`);
      }
      return noindexJson({ ok: false, error: 'Forbidden' }, 403);
    }

    const payload = await runProductionSmokeChecks(decision.context);
    return noindexJson(payload);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return noindexJson({ ok: false, error: 'Unauthorized' }, 401);
    }
    console.error('Production smoke check failed:', error);
    return noindexJson(
      { ok: false, error: 'Failed to run production smoke checks.' },
      500,
    );
  }
}
