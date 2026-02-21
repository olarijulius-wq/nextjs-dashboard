import LoginForm from '@/app/ui/login-form';
import { Suspense } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import AuthLayout from '@/app/(auth)/_components/auth-layout';

export const metadata: Metadata = {
  title: 'Login',
  robots: {
    index: false,
    follow: false,
  },
};

type LoginPageProps = {
  searchParams?: Promise<{
    signup?: string;
    verified?: string;
    reset?: string;
    error?: string;
    plan?: string;
    interval?: string;
    callbackUrl?: string;
  }>;
};

export default async function LoginPage(props: LoginPageProps) {
  const searchParams = await props.searchParams;
  const signupSuccess = searchParams?.signup === 'success';
  const verifiedSuccess = searchParams?.verified === 'success';
  const verifiedAlready = searchParams?.verified === 'already';
  const resetSuccess = searchParams?.reset === 'success';
  const oauthAccountNotLinked = searchParams?.error === 'OAuthAccountNotLinked';
  const callbackUrl =
    searchParams?.callbackUrl ??
    (searchParams?.plan
      ? `/dashboard/settings/billing?plan=${searchParams.plan}${searchParams?.interval ? `&interval=${searchParams.interval}` : ''}`
      : null);
  const signupHref = callbackUrl
    ? `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/signup';
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const githubEnabled = Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          Don&apos;t have an account?{' '}
          <Link href={signupHref} className="text-white hover:text-white/90">
            Sign up.
          </Link>
        </>
      }
      maxWidthClassName="max-w-lg"
    >
      <div className="space-y-3">
        {signupSuccess && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Account created. We&apos;ve sent a verification email to your
            address. Please check your inbox and spam folder.
          </div>
        )}
        {verifiedSuccess && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Your email has been verified. You can now log in.
          </div>
        )}
        {verifiedAlready && (
          <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            This verification link is invalid or has already been used. If
            needed, request a new one from the login page.
          </div>
        )}
        {resetSuccess && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Your password has been reset. You can now log in.
          </div>
        )}
        {oauthAccountNotLinked && (
          <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            Account exists. Please log in with email/password first, then connect
            Google/GitHub from Settings.
          </div>
        )}
        <Suspense>
          <LoginForm googleEnabled={googleEnabled} githubEnabled={githubEnabled} />
        </Suspense>
      </div>
    </AuthLayout>
  );
}
