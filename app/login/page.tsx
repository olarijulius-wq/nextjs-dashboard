import AcmeLogo from '@/app/ui/acme-logo';
import LoginForm from '@/app/ui/login-form';
import { Suspense } from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login',
};

type LoginPageProps = {
  searchParams?: Promise<{
    signup?: string;
    verified?: string;
    reset?: string;
  }>;
};

export default async function LoginPage(props: LoginPageProps) {
  const searchParams = await props.searchParams;
  const signupSuccess = searchParams?.signup === 'success';
  const verifiedSuccess = searchParams?.verified === 'success';
  const verifiedAlready = searchParams?.verified === 'already';
  const resetSuccess = searchParams?.reset === 'success';

  return (
    <main className="flex items-center justify-center md:h-screen">
      <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
        <div className="flex h-20 w-full items-end rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:h-36">
          <div className="w-32 text-slate-100 md:w-36">
            <AcmeLogo />
          </div>
        </div>
        {signupSuccess && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
            Account created. We&apos;ve sent a verification email to your
            address. Please check your inbox and spam folder.
          </div>
        )}
        {verifiedSuccess && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
            Your email has been verified. You can now log in.
          </div>
        )}
        {verifiedAlready && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200 shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
            This verification link is invalid or has already been used. If needed,
            request a new one from the login page.
          </div>
        )}
        {resetSuccess && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
            Your password has been reset. You can now log in.
          </div>
        )}
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="mt-4 text-center text-sm text-slate-400">
          No account?{' '}
          <a href="/signup" className="text-slate-200 hover:underline">
            Create one
          </a>
        </p>
      </div>
    </main>
  );
}
