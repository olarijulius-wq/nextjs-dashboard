import assert from 'node:assert/strict';

process.env.POSTGRES_URL = process.env.POSTGRES_URL || 'postgres://x:y@localhost:5432/z';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'x';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'x';
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
process.env.PAY_LINK_SECRET = process.env.PAY_LINK_SECRET || 'x';
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function main() {
  const dataModule = await import('@/app/lib/data');
  const invoiceExportRoute = await import('@/app/api/invoices/export/route');
  const customerExportRoute = await import('@/app/api/customers/export/route');
  const sendInvoiceRoute = await import('@/app/api/invoices/[id]/send/route');

  assert.equal(dataModule.__testHooksEnabled, false);
  assert.equal(invoiceExportRoute.__testHooksEnabled, false);
  assert.equal(customerExportRoute.__testHooksEnabled, false);
  assert.equal(sendInvoiceRoute.__testHooksEnabled, false);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
