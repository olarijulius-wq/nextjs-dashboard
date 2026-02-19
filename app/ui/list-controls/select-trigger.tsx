'use client';

import type { SelectHTMLAttributes } from 'react';
import clsx from 'clsx';
import { listControlsSelectClasses } from '@/app/ui/list-controls/styles';

type SelectTriggerProps = SelectHTMLAttributes<HTMLSelectElement>;

export default function SelectTrigger({
  className,
  children,
  ...props
}: SelectTriggerProps) {
  return (
    <div className="relative">
      <select {...props} className={clsx(listControlsSelectClasses, className)}>
        {children}
      </select>
      <span
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-neutral-400"
        aria-hidden="true"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
          <path
            d="M4.5 6.5L8 10L11.5 6.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
