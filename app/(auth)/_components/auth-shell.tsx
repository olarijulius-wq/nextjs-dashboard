import Link from 'next/link';
import type { ReactNode } from 'react';

type AuthShellProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  maxWidthClassName?: string;
};

export default function AuthShell({
  title,
  subtitle,
  children,
  maxWidthClassName = 'max-w-xl',
}: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(255,255,255,0.11),transparent_52%),radial-gradient(90%_70%_at_50%_100%,rgba(255,255,255,0.06),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_50%,transparent_58%,rgba(0,0,0,0.6)_100%)]" />
        <div className="absolute inset-0 opacity-[0.035] bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.9)_0px,rgba(255,255,255,0.9)_1px,transparent_1px,transparent_2px)]" />
      </div>

      <Link
        href="/"
        className="absolute left-6 top-6 text-sm text-white/70 transition hover:text-white"
      >
        {'\u2190'} Home
      </Link>

      <div
        className={`relative w-full ${maxWidthClassName} rounded-3xl border border-white/10 bg-white/[0.055] p-10 shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl`}
      >
        <div className="mb-7">
          <div className="mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-sm font-semibold text-white">
            L
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-white/70">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  );
}
