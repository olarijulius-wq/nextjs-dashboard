'use client';

import { useState } from 'react';

type CopyLinkButtonProps = {
  text: string;
};

export default function CopyLinkButton({ text }: CopyLinkButtonProps) {
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
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-sky-400/60 hover:bg-slate-800/80"
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
