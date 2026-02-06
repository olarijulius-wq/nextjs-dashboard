import { Metadata } from 'next';
import SignupForm from '@/app/ui/signup-form';
import { lusitana } from '@/app/ui/fonts';

export const metadata: Metadata = {
  title: 'Sign up',
};

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h1 className={`${lusitana.className} mb-2 text-2xl text-slate-100`}>
          Create your account
        </h1>
        <p className="mb-6 text-sm text-slate-400">
          Sign up to access your dashboard.
        </p>
        <SignupForm />
      </div>
    </main>
  );
}
