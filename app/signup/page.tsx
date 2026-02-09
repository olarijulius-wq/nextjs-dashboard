import { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import SignupForm from '@/app/ui/signup-form';
import AuthLayout from '@/app/(auth)/_components/auth-layout';

export const metadata: Metadata = {
  title: 'Sign up',
};

export default function Page() {
  return (
    <AuthLayout
      title="Create a Lateless account"
      subtitle={
        <>
          Already have an account?{' '}
          <Link href="/login" className="text-white hover:text-white/90">
            Log in.
          </Link>
        </>
      }
      maxWidthClassName="max-w-lg"
    >
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  );
}
