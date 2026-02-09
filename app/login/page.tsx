import LoginForm from '@/app/ui/login-form';
import { Suspense } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import AuthLayout from '@/app/(auth)/_components/auth-layout';

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
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-white hover:text-white/90">
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
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </AuthLayout>
  );
}
