import { NextResponse } from 'next/server';
import { diagnosticsEnabled } from '@/app/lib/admin-gates';
import {
  type DiagnosticsAccessDecision,
  getSmokeCheckAccessDecision,
  getSmokeCheckPingPayload,
} from '@/app/lib/smoke-check';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';

export const runtime = 'nodejs';

export const __testHooks = {
  ensureWorkspaceContextForCurrentUserOverride:
    null as null | typeof ensureWorkspaceContextForCurrentUser,
  getSmokeCheckAccessDecisionOverride: null as null | (() => Promise<DiagnosticsAccessDecision>),
  getSmokeCheckPingPayloadOverride:
    null as null | ((context: unknown) => Promise<Record<string, unknown>>),
};

function noindexJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function GET() {
  if (!diagnosticsEnabled()) {
    return noindexJson({ ok: false, error: 'Not found' }, 404);
  }

  try {
    const resolveWorkspaceContext =
      __testHooks.ensureWorkspaceContextForCurrentUserOverride ?? ensureWorkspaceContextForCurrentUser;
    const workspaceContext = await resolveWorkspaceContext();
    if (!isInternalAdmin(workspaceContext.userEmail)) {
      return noindexJson({ ok: false, error: 'Forbidden' }, 403);
    }

    const resolveDecision = __testHooks.getSmokeCheckAccessDecisionOverride ?? getSmokeCheckAccessDecision;
    const decision = await resolveDecision();
    if (!decision.allowed || !decision.context) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[diag-gate] /api/settings/smoke-check/ping denied: ${decision.reason}`);
      }
      return noindexJson({ ok: false, error: 'Forbidden' }, 403);
    }

    const resolvePayload =
      __testHooks.getSmokeCheckPingPayloadOverride ??
      (getSmokeCheckPingPayload as (context: unknown) => Promise<Record<string, unknown>>);
    const payload = await resolvePayload(decision.context);
    return noindexJson({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return noindexJson({ ok: false, error: 'Unauthorized' }, 401);
    }
    console.error('Production smoke check ping failed:', error);
    return noindexJson({ ok: false, error: 'Failed to load smoke check state.' }, 500);
  }
}
