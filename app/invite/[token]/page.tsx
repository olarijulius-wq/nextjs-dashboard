import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { fetchInviteByToken } from '@/app/lib/workspaces';
import AcceptInviteButton from './accept-invite-button';
import { secondaryButtonClasses } from '@/app/ui/button';

export const metadata: Metadata = {
  title: 'Team Invite',
  robots: {
    index: false,
    follow: false,
  },
};

type InvitePageProps = {
  params: Promise<{ token?: string }>;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default async function InvitePage(props: InvitePageProps) {
  const params = await props.params;
  const token = params?.token?.trim() ?? '';

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <p className="text-sm text-red-600 dark:text-red-300">Invite link is invalid.</p>
        </div>
      </main>
    );
  }

  const invite = await fetchInviteByToken(token);

  if (!invite) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <p className="text-sm text-red-600 dark:text-red-300">Invite link is invalid.</p>
        </div>
      </main>
    );
  }

  if (invite.acceptedAt) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Invite already used
          </h1>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            This invite has already been accepted.
          </p>
          <Link href="/dashboard/settings/team" className={`${secondaryButtonClasses} mt-4 px-3 py-2`}>
            Open team settings
          </Link>
        </div>
      </main>
    );
  }

  if (invite.isExpired) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Invite expired
          </h1>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            This invite link has expired. Ask the workspace owner for a new invite.
          </p>
        </div>
      </main>
    );
  }

  const session = await auth();
  const sessionEmail = session?.user?.email ? normalizeEmail(session.user.email) : null;

  if (!sessionEmail) {
    const callbackUrl = encodeURIComponent(`/invite/${token}`);
    redirect(`/login?callbackUrl=${callbackUrl}`);
  }

  const emailMismatch = sessionEmail !== invite.email;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Join workspace
        </h1>

        <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
          <p>
            Workspace: <span className="font-medium">{invite.workspaceName}</span>
          </p>
          <p>
            Role: <span className="font-medium">{invite.role}</span>
          </p>
          <p>
            Invite email: <span className="font-medium">{invite.email}</span>
          </p>
          <p>
            Signed in as: <span className="font-medium">{sessionEmail}</span>
          </p>
        </div>

        {emailMismatch ? (
          <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-700 dark:text-amber-200">
            This invite is for a different email. Sign in with the invited email.
          </div>
        ) : (
          <AcceptInviteButton token={token} />
        )}
      </div>
    </main>
  );
}
