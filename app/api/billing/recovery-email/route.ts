import { NextResponse } from 'next/server';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import {
  fetchWorkspaceDunningState,
  logRecoveryEmailFailure,
  maybeSendRecoveryEmailForWorkspace,
} from '@/app/lib/billing-dunning';

export async function POST() {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    const canManageBilling =
      context.userRole === 'owner' || context.userRole === 'admin';

    if (!canManageBilling) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const state = await fetchWorkspaceDunningState(context.workspaceId);
    if (!state?.recoveryRequired) {
      return NextResponse.json(
        { ok: false, error: 'Recovery email is only available for unpaid subscriptions.' },
        { status: 400 },
      );
    }

    const result = await maybeSendRecoveryEmailForWorkspace({
      workspaceId: context.workspaceId,
    });

    if (result.sent) {
      return NextResponse.json({ ok: true, sent: true });
    }

    return NextResponse.json(
      {
        ok: true,
        sent: false,
        skipped: true,
        reason: result.reason ?? 'skipped',
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown billing email error.';

    try {
      const context = await ensureWorkspaceContextForCurrentUser();
      await logRecoveryEmailFailure({
        workspaceId: context.workspaceId,
        userEmail: context.userEmail,
        error: message,
      });
    } catch {
      // best effort log only
    }

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.error('[billing] failed to send recovery email', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to send billing recovery email.' },
      { status: 500 },
    );
  }
}
