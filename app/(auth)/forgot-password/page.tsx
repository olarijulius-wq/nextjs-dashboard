import type { Metadata } from 'next';
import AcmeLogo from '@/app/ui/acme-logo';
import ForgotPasswordForm from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password',
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex items-center justify-center md:h-screen">
      <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
        <div className="flex h-20 w-full items-end rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:h-36">
          <div className="w-32 text-slate-100 md:w-36">
            <AcmeLogo />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-8 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
          <h1 className="mb-3 text-2xl text-slate-100">Reset your password</h1>
          <p className="mb-5 text-sm text-slate-400">
            Enter your email and we&apos;ll send a password reset link.
          </p>
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
