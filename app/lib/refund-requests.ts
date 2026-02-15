import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const REFUND_REQUESTS_MIGRATION_REQUIRED_CODE =
  'REFUND_REQUESTS_MIGRATION_REQUIRED';

export type RefundRequestStatus = 'pending' | 'approved' | 'declined';

function buildRefundRequestsMigrationRequiredError() {
  const error = new Error(REFUND_REQUESTS_MIGRATION_REQUIRED_CODE) as Error & {
    code: string;
  };
  error.code = REFUND_REQUESTS_MIGRATION_REQUIRED_CODE;
  return error;
}

export function isRefundRequestsMigrationRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === REFUND_REQUESTS_MIGRATION_REQUIRED_CODE ||
      error.message === REFUND_REQUESTS_MIGRATION_REQUIRED_CODE)
  );
}

let refundRequestsSchemaReadyPromise: Promise<void> | null = null;

export async function assertRefundRequestsSchemaReady(): Promise<void> {
  if (!refundRequestsSchemaReadyPromise) {
    refundRequestsSchemaReadyPromise = (async () => {
      const [result] = await sql<{
        refund_requests: string | null;
      }[]>`
        select to_regclass('public.refund_requests') as refund_requests
      `;

      if (!result?.refund_requests) {
        throw buildRefundRequestsMigrationRequiredError();
      }
    })();
  }

  return refundRequestsSchemaReadyPromise;
}

export function isRefundWindowOpen(paidAt: Date | null) {
  if (!paidAt) return false;
  const paidAtMs = paidAt.getTime();
  if (Number.isNaN(paidAtMs)) return false;
  return Date.now() - paidAtMs <= 30 * 24 * 60 * 60 * 1000;
}

export function normalizeOptionalEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}
