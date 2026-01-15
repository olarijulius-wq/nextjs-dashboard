import { lusitana } from '@/app/ui/fonts';
import { fetchLatePayerStats } from '@/app/lib/data';

function formatDelay(days: number) {
  const rounded = Math.round(days);
  return `Avg +${rounded} days`;
}

export default async function LatePayers() {
  const latePayers = await fetchLatePayerStats();
  const isEmpty = !latePayers || latePayers.length === 0;

  return (
    <div className="flex w-full flex-col">
      <h2 className={`${lusitana.className} mb-4 text-xl md:text-2xl`}>
        Late payers
      </h2>

      <div className="flex grow flex-col rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        {isEmpty ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-6">
            <p className="text-sm text-slate-200">
              No late payer data yet. Mark invoices as paid or wait for
              payments.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60">
            {latePayers.map((payer) => (
              <div
                key={payer.customer_id}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 px-6 py-4 last:border-none"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100 md:text-base">
                    {payer.name}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {payer.email}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-300">
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1">
                    {payer.paid_invoices} paid
                  </span>
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200">
                    {formatDelay(payer.avg_delay_days)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
