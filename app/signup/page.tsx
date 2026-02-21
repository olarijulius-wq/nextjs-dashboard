import { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import SignupForm from '@/app/ui/signup-form';
import AuthLayout from '@/app/(auth)/_components/auth-layout';

export const metadata: Metadata = {
  title: 'Sign up',
  robots: {
    index: false,
    follow: false,
  },
};

type SignupPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function Page(props: SignupPageProps) {
  const searchParams = await props.searchParams;
  const callbackUrl = searchParams?.callbackUrl ?? null;
  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/login';
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  const githubEnabled = Boolean(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
  );

  return (
    <AuthLayout
      title="Create a Lateless account"
      subtitle={
        <>
          Already have an account?{' '}
          <Link href={loginHref} className="text-white hover:text-white/90">
            Log in.
          </Link>
        </>
      }
      maxWidthClassName="max-w-lg"
    >
      <Suspense>
        <SignupForm
          googleEnabled={googleEnabled}
          githubEnabled={githubEnabled}
          callbackUrl={callbackUrl}
        />
      </Suspense>
    </AuthLayout>
  );
}
