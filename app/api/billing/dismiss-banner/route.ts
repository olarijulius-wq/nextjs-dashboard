import { NextResponse } from 'next/server';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { dismissDunningBanner } from '@/app/lib/billing-dunning';

export async function POST() {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    await dismissDunningBanner(context.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    console.error('[billing] failed to dismiss recovery banner', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to dismiss billing banner.' },
      { status: 500 },
    );
  }
}
