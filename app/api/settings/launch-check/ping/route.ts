import { NextResponse } from 'next/server';
import { getLaunchCheckAccessContext, getLaunchCheckPingPayload } from '@/app/lib/launch-check';

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
  const context = await getLaunchCheckAccessContext();
  if (!context) {
    return noindexJson({ ok: false, error: 'Not Found' }, 404);
  }

  try {
    const payload = await getLaunchCheckPingPayload();
    return noindexJson({ ok: true, ...payload });
  } catch (error) {
    console.error('Launch readiness ping failed:', error);
    return noindexJson({ ok: false, error: 'Failed to load launch check env.' }, 500);
  }
}
