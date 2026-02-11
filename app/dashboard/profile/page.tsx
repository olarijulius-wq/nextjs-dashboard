import { Metadata } from 'next';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import postgres from 'postgres';
import { disableTwoFactor, enableTwoFactor } from '@/app/lib/actions';
import { primaryButtonClasses } from '@/app/ui/button';
import {
  DeleteAccountForm,
  EmailPasswordPanel,
} from './profile-security-panel';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const metadata: Metadata = {
  title: 'My Profile',
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default async function ProfilePage(props: {
  searchParams?: Promise<{ twoFactor?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }

  const searchParams = await props.searchParams;
  const twoFactorStatus = searchParams?.twoFactor;
  const userEmail = normalizeEmail(session.user.email);

  const [user] = await sql<
    {
      email: string;
      is_verified: boolean | null;
      two_factor_enabled: boolean | null;
    }[]
  >`
    SELECT email, is_verified, two_factor_enabled
    FROM users
    WHERE lower(email) = ${userEmail}
    LIMIT 1
  `;

  let connectedOnLabel = 'your account';
  try {
    const [createdAtRecord] = await sql<{ created_at: Date | null }[]>`
      SELECT created_at
      FROM users
      WHERE lower(email) = ${userEmail}
      LIMIT 1
    `;
    if (createdAtRecord?.created_at) {
      connectedOnLabel = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(createdAtRecord.created_at);
    }
  } catch {
    connectedOnLabel = 'your account';
  }

  return (
    <div className="w-full max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          My Profile
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Account-level identity and authentication settings.
        </p>
      </div>

      {twoFactorStatus === 'enabled' && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-100 p-4 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          Two-factor authentication is enabled.
        </div>
      )}

      {twoFactorStatus === 'disabled' && (
        <div className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-slate-700 dark:border-slate-600/50 dark:bg-slate-800/40 dark:text-slate-200">
          Two-factor authentication is disabled.
        </div>
      )}

      {twoFactorStatus === 'verify-required' && (
        <div className="rounded-xl border border-amber-300 bg-amber-100 p-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Verify your email before enabling two-factor authentication.
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Your email
        </h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          {userEmail}
        </p>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Password
        </h2>
        <div className="mt-3">
          <EmailPasswordPanel
            email={userEmail}
            connectedOnLabel={connectedOnLabel}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Multi-Factor Authentication (2FA)
        </h2>
        {!user?.two_factor_enabled ? (
          <>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              When enabled, each login requires a 6-digit code sent to your
              email.
            </p>
            <form action={enableTwoFactor} className="mt-3">
              <button
                type="submit"
                disabled={!user?.is_verified}
                className={primaryButtonClasses}
              >
                Enable 2FA
              </button>
            </form>
            {!user?.is_verified && (
              <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                Verify your email first to enable 2FA.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              2FA is active. You will need an emailed 6-digit code on every
              login.
            </p>
            <form action={disableTwoFactor} className="mt-3">
              <button
                type="submit"
                className={primaryButtonClasses}
              >
                Disable 2FA
              </button>
            </form>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Delete account
        </h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
          This permanently deletes your account and its data in Lateless.
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Type <code>DELETE</code> and enter your current password.
        </p>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
