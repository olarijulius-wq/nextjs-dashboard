'use client';

import { useState } from 'react';
import { secondaryButtonClasses } from '@/app/ui/button';

type CopyLinkButtonProps = {
  text: string;
  label?: string;
};

export default function CopyLinkButton({ text, label = 'Copy payment link' }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleCopy}
        className={`${secondaryButtonClasses} px-3 py-2 text-xs`}
      >
        {label}
      </button>
      {copied ? <p className="text-xs text-emerald-700 dark:text-emerald-300">Copied</p> : null}
    </div>
  );
}
