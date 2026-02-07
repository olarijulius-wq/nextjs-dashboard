import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { sendEmailVerification } from '@/app/lib/email';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function resolveBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.AUTH_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000')
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const emailValue = body?.email;
    if (typeof emailValue !== 'string' || emailValue.trim() === '') {
      return NextResponse.json({ ok: true });
    }

    const normalizedEmail = normalizeEmail(emailValue);
    const [user] = await sql<{
      id: string;
      email: string;
      is_verified: boolean;
    }[]>`
      select id, email, is_verified
      from users
      where lower(email) = ${normalizedEmail}
      limit 1
    `;

    if (!user || user.is_verified) {
      return NextResponse.json({ ok: true });
    }

    const token = crypto.randomUUID();
    await sql`
      update users
      set verification_token = ${token},
          verification_sent_at = now()
      where id = ${user.id}
    `;

    const baseUrl = resolveBaseUrl();
    const verifyUrl = `${baseUrl}/verify/${token}`;

    await sendEmailVerification({
      to: normalizedEmail,
      verifyUrl,
    });
  } catch (error) {
    console.error('Resend verification failed:', error);
  }

  return NextResponse.json({ ok: true });
}
