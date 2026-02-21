import { NextResponse } from 'next/server';
import {
  getSmokeCheckAccessContext,
  getSmokeCheckPingPayload,
} from '@/app/lib/smoke-check';

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
  const context = await getSmokeCheckAccessContext();
  if (!context) {
    return noindexJson({ ok: false, error: 'Not Found' }, 404);
  }

  try {
    const payload = await getSmokeCheckPingPayload(context);
    return noindexJson({ ok: true, ...payload });
  } catch (error) {
    console.error('Production smoke check ping failed:', error);
    return noindexJson({ ok: false, error: 'Failed to load smoke check state.' }, 500);
  }
}
