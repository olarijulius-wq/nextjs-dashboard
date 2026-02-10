'use client';

import { useSyncExternalStore } from 'react';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/app/ui/theme/theme-provider';
import clsx from 'clsx';

type ThemeToggleMenuItemProps = {
  staticLabel?: string;
  className?: string;
};

const baseClassName =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-neutral-100';

export default function ThemeToggleMenuItem({
  staticLabel,
  className,
}: ThemeToggleMenuItemProps = {}) {
  const { theme, toggleTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <button
        type="button"
        className={clsx(baseClassName, className)}
      >
        <MoonIcon className="h-4 w-4" />
        {staticLabel ?? 'Toggle theme'}
      </button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={clsx(baseClassName, className)}
    >
      {isDark ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
      {staticLabel ?? (isDark ? 'Light theme' : 'Dark theme')}
    </button>
  );
}
