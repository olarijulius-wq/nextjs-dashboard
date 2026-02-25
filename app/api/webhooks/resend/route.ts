import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { enforceRateLimit } from '@/app/lib/security/api-guard';
import { applyReminderDeliveryFailureByProviderMessageId } from '@/app/lib/reminder-runs';

export const runtime = 'nodejs';

function toBufferFromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function verifySvixSignature(input: {
  body: string;
  headerId: string;
  headerTimestamp: string;
  headerSignature: string;
  secret: string;
}) {
  const secretRaw = input.secret.startsWith('whsec_')
    ? input.secret.slice('whsec_'.length)
    : input.secret;
  const signingSecret = toBufferFromBase64Url(secretRaw);
  if (signingSecret.length === 0) {
    return false;
  }

  const signedContent = `${input.headerId}.${input.headerTimestamp}.${input.body}`;
  const expected = createHmac('sha256', signingSecret).update(signedContent).digest('base64');
  const signatures = input.headerSignature
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const [, value] = part.split(',', 2);
      return value ? [value] : [];
    });

  return signatures.some((candidate) => {
    try {
      const expectedBuffer = Buffer.from(expected);
      const candidateBuffer = Buffer.from(candidate);
      return (
        expectedBuffer.length === candidateBuffer.length &&
        timingSafeEqual(expectedBuffer, candidateBuffer)
      );
    } catch {
      return false;
    }
  });
}

function extractEmailEventInfo(payload: unknown): {
  eventType: string | null;
  messageId: string | null;
  recipientEmail: string | null;
  errorCode: string | null;
  errorType: string | null;
  errorMessage: string;
} {
  const data = (payload ?? {}) as Record<string, unknown>;
  const eventTypeRaw = data.type;
  const eventType = typeof eventTypeRaw === 'string' ? eventTypeRaw.trim().toLowerCase() : null;

  const eventData = (data.data ?? {}) as Record<string, unknown>;
  const messageIdCandidates = [
    eventData.email_id,
    eventData.emailId,
    eventData.message_id,
    eventData.messageId,
    eventData.id,
    data.email_id,
    data.id,
  ];
  const messageId =
    messageIdCandidates.find((value): value is string => typeof value === 'string' && value.trim() !== '')
      ?.trim() ?? null;

  const toValue = eventData.to;
  let recipientEmail: string | null = null;
  if (typeof toValue === 'string') {
    recipientEmail = toValue.trim().toLowerCase() || null;
  } else if (Array.isArray(toValue)) {
    const firstRecipient = toValue.find(
      (value): value is string => typeof value === 'string' && value.trim() !== '',
    );
    recipientEmail = firstRecipient?.trim().toLowerCase() ?? null;
  }

  const bounce = (eventData.bounce ?? {}) as Record<string, unknown>;
  const rawCode = bounce.code ?? eventData.error_code ?? eventData.code;
  const rawType = bounce.type ?? eventData.error_type ?? eventData.error ?? eventData.reason;
  const rawMessage =
    bounce.message ??
    eventData.error_message ??
    eventData.message ??
    eventData.reason ??
    (typeof rawType === 'string' ? rawType : null);

  const errorCode = typeof rawCode === 'string' && rawCode.trim() ? rawCode.trim() : null;
  const errorType = typeof rawType === 'string' && rawType.trim() ? rawType.trim() : null;
  const errorMessage =
    typeof rawMessage === 'string' && rawMessage.trim()
      ? rawMessage.trim().slice(0, 300)
      : 'Delivery failed.';

  return {
    eventType,
    messageId,
    recipientEmail,
    errorCode,
    errorType,
    errorMessage,
  };
}

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(
    request,
    {
      bucket: 'resend_webhook',
      windowSec: 60,
      ipLimit: 300,
    },
    {},
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = await request.text();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim() ?? '';
  if (webhookSecret) {
    const svixId = request.headers.get('svix-id')?.trim() ?? '';
    const svixTimestamp = request.headers.get('svix-timestamp')?.trim() ?? '';
    const svixSignature = request.headers.get('svix-signature')?.trim() ?? '';

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ ok: false, error: 'Missing webhook signature headers.' }, { status: 400 });
    }

    const isValid = verifySvixSignature({
      body,
      headerId: svixId,
      headerTimestamp: svixTimestamp,
      headerSignature: svixSignature,
      secret: webhookSecret,
    });
    if (!isValid) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }
  }

  let payload: unknown = {};
  try {
    payload = (JSON.parse(body || '{}') ?? {}) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload.' }, { status: 400 });
  }
  const info = extractEmailEventInfo(payload);
  const isFailureEvent =
    info.eventType === 'email.bounced' ||
    info.eventType === 'email.delivery_failed' ||
    info.eventType === 'email.failed';

  if (!isFailureEvent || !info.messageId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const summary = await applyReminderDeliveryFailureByProviderMessageId({
    provider: 'resend',
    providerMessageId: info.messageId,
    errorCode: info.errorCode,
    errorType: info.errorType,
    errorMessage: info.recipientEmail
      ? `${info.errorMessage} (${info.recipientEmail})`
      : info.errorMessage,
  });

  return NextResponse.json({
    ok: true,
    updated_runs: summary.updatedRuns,
    updated_items: summary.updatedItems,
  });
}
