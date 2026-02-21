import { NextResponse } from 'next/server';
import { getLaunchCheckAccessContext, runLaunchReadinessChecks } from '@/app/lib/launch-check';

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
  const context = await getLaunchCheckAccessContext();
  if (!context) {
    return noindexJson({ ok: false, error: 'Not Found' }, 404);
  }

  try {
    const payload = await runLaunchReadinessChecks(context.userEmail);
    return noindexJson(payload);
  } catch (error) {
    console.error('Launch readiness check failed:', error);
    return noindexJson(
      { ok: false, error: 'Failed to run launch readiness checks.' },
      500,
    );
  }
}
