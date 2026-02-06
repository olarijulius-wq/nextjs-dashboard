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
      className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-100 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.01]"
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
