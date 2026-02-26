'use client';

import { ReactNode, useRef, useState } from 'react';
import clsx from 'clsx';
import Search from '@/app/ui/search';

type MobileExpandableSearchToolbarProps = {
  searchPlaceholder: string;
  actions: ReactNode;
};

export default function MobileExpandableSearchToolbar({
  searchPlaceholder,
  actions,
}: MobileExpandableSearchToolbarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const blurTimerRef = useRef<number | null>(null);

  const handleFocus = () => {
    if (blurTimerRef.current) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setIsSearchFocused(true);
  };

  const handleBlur = () => {
    blurTimerRef.current = window.setTimeout(() => {
      setIsSearchFocused(false);
      blurTimerRef.current = null;
    }, 80);
  };

  return (
    <div className="mb-4 flex w-full items-start gap-3 md:items-center md:justify-between">
      <Search
        placeholder={searchPlaceholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={clsx(
          'min-w-0 transition-all duration-150',
          isSearchFocused ? 'w-full flex-1' : 'flex-1 md:max-w-[320px]',
        )}
      />
      <div
        className={clsx(
          'items-center gap-2 pt-1 md:pt-0',
          isSearchFocused ? 'hidden md:flex' : 'flex',
        )}
      >
        {actions}
      </div>
    </div>
  );
}
