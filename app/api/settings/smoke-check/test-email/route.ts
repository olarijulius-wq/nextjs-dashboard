import { NextResponse } from 'next/server';
import {
  getSmokeCheckAccessDecision,
  sendSmokeCheckTestEmail,
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

export async function POST() {
  const decision = await getSmokeCheckAccessDecision();
  if (!decision.allowed || !decision.context) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[diag-gate] /api/settings/smoke-check/test-email denied: ${decision.reason}`);
    }
    return noindexJson({ ok: false, error: 'Not Found' }, 404);
  }

  try {
    const result = await sendSmokeCheckTestEmail(decision.context);
    if (!result.ok && result.rateLimited) {
      return noindexJson(result, 429);
    }
    return noindexJson(result, result.ok ? 200 : 500);
  } catch (error) {
    console.error('Smoke check test email failed:', error);
    return noindexJson({ ok: false, error: 'Failed to send smoke test email.' }, 500);
  }
}
