import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { ensureWorkspaceContextForCurrentUser } from '@/app/lib/workspaces';
import { isReminderManualRunAdmin } from '@/app/lib/reminder-admin';

export const runtime = 'nodejs';

function getBaseUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : new URL(req.url).origin)
  );
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userEmail = session?.user?.email?.trim().toLowerCase() ?? '';

    if (!userEmail) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const context = await ensureWorkspaceContextForCurrentUser();
    if (context.userRole !== 'owner' && context.userRole !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!isReminderManualRunAdmin(userEmail)) {
      return NextResponse.json(
        { ok: false, error: 'Manual reminder runs are restricted to admin users.' },
        { status: 403 },
      );
    }

    const cronToken = process.env.REMINDER_CRON_TOKEN?.trim();
    if (!cronToken) {
      return NextResponse.json(
        { ok: false, error: 'REMINDER_CRON_TOKEN is not configured.' },
        { status: 500 },
      );
    }

    const runUrl = new URL('/api/reminders/run', getBaseUrl(req));
    runUrl.searchParams.set('triggeredBy', 'manual');

    const runResponse = await fetch(runUrl.toString(), {
      method: 'POST',
      headers: {
        'x-reminder-cron-token': cronToken,
        'x-reminders-triggered-by': 'manual',
      },
      cache: 'no-store',
    });

    const payload = await runResponse.json().catch(() => null);

    if (runResponse.ok) {
      revalidatePath('/dashboard/settings/reminders');
    }

    return NextResponse.json(payload, { status: runResponse.status });
  } catch (error) {
    console.error('Manual reminders run failed:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to run reminders manually.' },
      { status: 500 },
    );
  }
}
