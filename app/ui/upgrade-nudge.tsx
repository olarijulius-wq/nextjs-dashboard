import Link from 'next/link';
import { primaryButtonClasses, secondaryButtonClasses } from '@/app/ui/button';
import type { PlanId } from '@/app/lib/config';

type UpgradeNudgeVariant = 'soft' | 'warn' | 'block';

export default function UpgradeNudge({
  planId,
  usedThisMonth,
  cap,
  percentUsed,
  variant,
  interval,
}: {
  planId: PlanId;
  usedThisMonth: number;
  cap: number | null;
  percentUsed: number;
  variant?: UpgradeNudgeVariant;
  interval?: string;
}) {
  if (cap === null) {
    return null;
  }

  const resolvedVariant =
    variant ??
    (percentUsed >= 1
      ? 'block'
      : percentUsed >= 0.9
        ? 'warn'
        : percentUsed >= 0.7
          ? 'soft'
          : null);

  if (!resolvedVariant) {
    return null;
  }

  const message =
    resolvedVariant === 'block'
      ? `Monthly invoice limit reached (${usedThisMonth}/${cap}).`
      : resolvedVariant === 'warn'
        ? `Almost at your limit (${usedThisMonth}/${cap}). Upgrade to avoid interruptions.`
        : `You're close to your monthly invoice limit (${usedThisMonth}/${cap}).`;

  const billingHref = `/dashboard/settings/billing?plan=${encodeURIComponent(planId)}${
    interval ? `&interval=${encodeURIComponent(interval)}` : ''
  }`;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 text-slate-900 shadow-sm dark:border-neutral-800/80 dark:bg-neutral-950/95 dark:text-neutral-100 dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900 dark:text-neutral-100">{message}</p>
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            Current plan: <span className="uppercase tracking-wide">{planId}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={billingHref} className={`${primaryButtonClasses} px-3 py-2 text-xs`}>
            Upgrade plan
          </Link>
          {resolvedVariant === 'block' ? (
            <Link href="/dashboard/settings/usage" className={`${secondaryButtonClasses} px-3 py-2 text-xs`}>
              View usage
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
