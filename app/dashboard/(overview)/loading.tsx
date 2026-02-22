const shimmer =
  'before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-slate-200/80 before:to-transparent dark:before:via-slate-500/40';

function Block({ className }: { className: string }) {
  return (
    <div
      className={`${shimmer} relative overflow-hidden rounded-2xl bg-slate-200 dark:bg-neutral-900 ${className}`}
    />
  );
}

export default function Loading() {
  return (
    <main className="space-y-6">
      <Block className="h-8 w-36 rounded-md" />

      <Block className="min-h-[136px] w-full border border-neutral-200 p-4 dark:border-neutral-800" />

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid gap-6 sm:grid-cols-2">
          <Block className="min-h-[150px] border border-neutral-200 p-4 dark:border-neutral-800" />
          <Block className="min-h-[150px] border border-neutral-200 p-4 dark:border-neutral-800" />
          <Block className="min-h-[150px] border border-neutral-200 p-4 dark:border-neutral-800" />
          <Block className="min-h-[150px] border border-neutral-200 p-4 dark:border-neutral-800" />
        </div>
        <Block className="min-h-[236px] border border-neutral-200 p-4 dark:border-neutral-800" />
      </div>

      <div className="space-y-6">
        <Block className="min-h-[500px] w-full border border-neutral-200 p-4 dark:border-neutral-800" />

        <div className="grid gap-6 md:grid-cols-2">
          <Block className="min-h-[420px] border border-neutral-200 p-4 dark:border-neutral-800" />
          <Block className="min-h-[420px] border border-neutral-200 p-4 dark:border-neutral-800" />
        </div>
      </div>
    </main>
  );
}
