import AcmeLogo from '@/app/ui/acme-logo';
import LoginForm from '@/app/ui/login-form';
import { Suspense } from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login',
};
 
export default function LoginPage() {
  return (
    <main className="flex items-center justify-center md:h-screen">
      <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
        <div className="flex h-20 w-full items-end rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:h-36">
          <div className="w-32 text-slate-100 md:w-36">
            <AcmeLogo />
          </div>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="mt-4 text-center text-sm text-slate-400">
          No account?{' '}
          <a href="/signup" className="text-sky-300 hover:underline">
            Create one
          </a>
        </p>
      </div>
    </main>
  );
}
