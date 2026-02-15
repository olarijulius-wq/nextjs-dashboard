export const allowedPayStatuses = ['pending', 'overdue', 'failed'] as const;

export type AllowedPayStatus = (typeof allowedPayStatuses)[number];

export function canPayInvoiceStatus(status: string | null | undefined): boolean {
  if (typeof status !== 'string') {
    return false;
  }

  return (allowedPayStatuses as readonly string[]).includes(status);
}
