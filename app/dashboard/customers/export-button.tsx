'use client';

import { useState } from 'react';
import { Button } from '@/app/ui/button';

type ExportCustomersButtonProps = {
  canExportCsv: boolean;
};

export default function ExportCustomersButton({
  canExportCsv,
}: ExportCustomersButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = loading
    ? 'Exporting…'
    : canExportCsv
      ? 'Download CSV'
      : 'Available on Solo, Pro, and Studio plans';

  async function handleExport() {
    if (!canExportCsv) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/customers/export', {
        method: 'GET',
      });

      if (!res.ok) {
        let message = 'Failed to export customers.';
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
          else if (data?.error) message = data.error;
        } catch {
          // ignore JSON parse error
        }
        throw new Error(message);
      }

      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'customers.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || 'Failed to export customers.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        onClick={handleExport}
        title={title}
        aria-disabled={loading || !canExportCsv}
        disabled={loading || !canExportCsv}
        variant="secondary"
      >
        {loading ? 'Exporting…' : 'Export CSV'}
      </Button>
      {!canExportCsv && (
        <p className="text-xs text-slate-400">
          Available on Solo, Pro, and Studio plans.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-500" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
