import type { Metadata } from 'next';
import Link from 'next/link';
import postgres from 'postgres';
import AcmeLogo from '@/app/ui/acme-logo';
import ResetPasswordForm from './reset-password-form';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const metadata: Metadata = {
  title: 'Reset password',
};

type ResetPasswordPageProps = {
  params: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage(props: ResetPasswordPageProps) {
  const params = await props.params;
  const token = params?.token?.trim() ?? '';

  let isValidLink = false;

  if (token) {
    const [user] = await sql<{ id: string }[]>`
      select id
      from users
      where password_reset_token = ${token}
        and password_reset_sent_at is not null
        and password_reset_sent_at >= now() - interval '1 hour'
      limit 1
    `;
    isValidLink = Boolean(user);
  }

  return (
    <main className="flex items-center justify-center md:h-screen">
      <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
        <div className="flex h-20 w-full items-end rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:h-36">
          <div className="w-32 text-slate-100 md:w-36">
            <AcmeLogo />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-8 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <h1 className="mb-3 text-2xl text-slate-100">Set a new password</h1>

          {!isValidLink ? (
            <div className="space-y-4">
              <p className="text-sm text-amber-200">
                This link is invalid or has expired.
              </p>
              <Link
                href="/forgot-password"
                className="inline-flex items-center rounded-xl border border-slate-700/70 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 transition duration-200 ease-out hover:bg-slate-800 hover:scale-[1.01]"
              >
                Request a new reset link
              </Link>
            </div>
          ) : (
            <ResetPasswordForm token={token} />
          )}
        </div>
      </div>
    </main>
  );
}
