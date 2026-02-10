import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import postgres from 'postgres';
import { requireUserEmail } from '@/app/lib/data';

export const runtime = 'nodejs';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  let userEmail = '';

  try {
    userEmail = await requireUserEmail();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Unauthorized.' },
      { status: 401 },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const confirmText = typeof body?.confirmText === 'string' ? body.confirmText : '';
    const currentPassword =
      typeof body?.currentPassword === 'string' ? body.currentPassword : '';

    if (confirmText !== 'DELETE') {
      return NextResponse.json(
        { ok: false, message: 'Type DELETE to confirm account deletion.' },
        { status: 400 },
      );
    }

    if (!currentPassword) {
      return NextResponse.json(
        { ok: false, message: 'Current password is required.' },
        { status: 400 },
      );
    }

    const normalizedEmail = normalizeEmail(userEmail);
    const [user] = await sql<{ id: string; password: string | null }[]>`
      select id, password
      from users
      where lower(email) = ${normalizedEmail}
      limit 1
    `;

    if (!user?.password) {
      return NextResponse.json(
        { ok: false, message: 'Account password is not available for this login method.' },
        { status: 400 },
      );
    }

    const passwordsMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordsMatch) {
      return NextResponse.json(
        { ok: false, message: 'Current password is incorrect.' },
        { status: 400 },
      );
    }

    await sql`
      delete from public.invoices
      where lower(user_email) = ${normalizedEmail}
    `;
    await sql`
      delete from public.customers
      where lower(user_email) = ${normalizedEmail}
    `;
    await sql`
      delete from public.invoice_counters
      where lower(user_email) = ${normalizedEmail}
    `;
    await sql`
      delete from public.company_profiles
      where lower(user_email) = ${normalizedEmail}
    `;
    await sql`
      delete from public.users
      where id = ${user.id}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete account failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to delete account.' },
      { status: 500 },
    );
  }
}
