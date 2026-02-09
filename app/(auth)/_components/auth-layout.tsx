import Link from 'next/link';
import type { ReactNode } from 'react';
import { LatelessMark } from '@/app/ui/lateless-mark';

type AuthLayoutProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  maxWidthClassName?: string;
};

export default function AuthLayout({
  title,
  subtitle,
  children,
  maxWidthClassName = 'max-w-lg',
}: AuthLayoutProps) {
  return (
    <main className="dark relative min-h-screen overflow-hidden bg-black px-6 py-10 text-white [color-scheme:dark]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_800px_at_50%_55%,rgba(0,0,0,0.15),rgba(0,0,0,0.85)_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,transparent_56%,rgba(255,255,255,0.1)_58%,rgba(255,255,255,0.18)_59%,rgba(255,255,255,0.08)_61%,transparent_66%,transparent_100%),radial-gradient(900px_700px_at_95%_35%,rgba(255,255,255,0.18),rgba(255,255,255,0.06)_45%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(320deg,transparent_0%,transparent_54%,rgba(255,255,255,0.08)_56%,rgba(255,255,255,0.16)_57%,rgba(255,255,255,0.06)_60%,transparent_65%,transparent_100%),radial-gradient(900px_700px_at_18%_92%,rgba(255,255,255,0.14),rgba(255,255,255,0.05)_45%,transparent_72%)]" />
        <div className="absolute inset-0 opacity-[0.55] [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0px,rgba(255,255,255,0.035)_1px,transparent_1px,transparent_7px),repeating-linear-gradient(90deg,rgba(255,255,255,0.02)_0px,rgba(255,255,255,0.02)_1px,transparent_1px,transparent_9px)] [mask-image:radial-gradient(900px_700px_at_50%_40%,rgba(0,0,0,0.9),transparent_72%)] [mix-blend-mode:overlay]" />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_900px_at_110%_-10%,rgba(255,255,255,0.14),rgba(255,255,255,0.05)_45%,transparent_70%)]" />
      </div>

      <Link
        href="/"
        className="absolute left-6 top-6 z-10 text-sm text-white/70 transition hover:text-white"
      >
        {'\u2190'} Home
      </Link>

      <div className="relative z-10 flex min-h-[calc(100vh-5rem)] items-center justify-center">
        <div className={`w-full ${maxWidthClassName}`}>
          <div className="space-y-7 text-center">
            <div className="flex justify-center">
              <LatelessMark size={44} />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                {title}
              </h1>
              {subtitle ? (
                <p className="text-sm text-white/70">{subtitle}</p>
              ) : null}
            </div>

            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
