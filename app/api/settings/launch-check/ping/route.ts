import { NextResponse } from 'next/server';
import {
  getLaunchCheckAccessDecision,
  getLaunchCheckPingPayload,
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

export async function GET() {
  try {
    const workspaceContext = await ensureWorkspaceContextForCurrentUser();
    if (!isInternalAdmin(workspaceContext.userEmail)) {
      return noindexJson({ ok: false, error: 'Forbidden' }, 403);
    }

    const decision = await getLaunchCheckAccessDecision();
    if (!decision.allowed) {
      return noindexJson({ ok: false, error: 'Forbidden' }, 403);
    }

    const payload = await getLaunchCheckPingPayload();
    return noindexJson({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return noindexJson({ ok: false, error: 'Unauthorized' }, 401);
    }
    console.error('Launch readiness ping failed:', error);
    return noindexJson({ ok: false, error: 'Failed to load launch check env.' }, 500);
  }
}
