'use client';

import { useState } from 'react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import MobileDrawer from '@/app/ui/dashboard/mobile-drawer';

type MobileNavProps = {
  userEmail: string;
  logoutAction: () => Promise<void>;
};

export default function MobileNav({ userEmail, logoutAction }: MobileNavProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileNavOpen((current) => !current)}
        className="pointer-events-auto fixed right-[calc(env(safe-area-inset-right)+12px)] top-[calc(env(safe-area-inset-top)+12px)] z-[130] inline-flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-200 bg-white/95 text-slate-900 shadow-lg backdrop-blur transition hover:border-neutral-300 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-black/90 dark:text-neutral-200 dark:hover:border-neutral-700 dark:hover:text-white md:hidden"
        aria-expanded={mobileNavOpen}
        aria-controls="dashboard-mobile-drawer"
        aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
      >
        {mobileNavOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
      </button>

      <MobileDrawer
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        userEmail={userEmail}
        logoutAction={logoutAction}
      />
    </>
  );
}
