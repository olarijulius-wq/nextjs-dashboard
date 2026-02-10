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
    const currentPassword =
      typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    const confirmNewPassword =
      typeof body?.confirmNewPassword === 'string' ? body.confirmNewPassword : '';

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return NextResponse.json(
        { ok: false, message: 'All password fields are required.' },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { ok: false, message: 'New password must be at least 8 characters.' },
        { status: 400 },
      );
    }

    if (newPassword !== confirmNewPassword) {
      return NextResponse.json(
        { ok: false, message: 'New password confirmation does not match.' },
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

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      return NextResponse.json(
        { ok: false, message: 'Current password is incorrect.' },
        { status: 400 },
      );
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    await sql`
      update users
      set password = ${nextHash}
      where id = ${user.id}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Change password failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to change password.' },
      { status: 500 },
    );
  }
}
