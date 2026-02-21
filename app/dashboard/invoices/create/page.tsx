import Form from '@/app/ui/invoices/create-form';
import Breadcrumbs from '@/app/ui/invoices/breadcrumbs';
import { fetchCustomers, fetchUserInvoiceUsageProgress } from '@/app/lib/data';
import { Metadata } from 'next';
import UpgradeNudge from '@/app/ui/upgrade-nudge';

export const metadata: Metadata = {
  title: 'Create',
};
 
 
export default async function Page(props: {
  searchParams?: Promise<{ customerId?: string; interval?: string; returnTo?: string }>;
}) {
  const searchParams = await props.searchParams;
  const [customers, usage] = await Promise.all([
    fetchCustomers(),
    fetchUserInvoiceUsageProgress(),
  ]);
  const initialCustomerId = searchParams?.customerId ?? null;
  const interval = searchParams?.interval;
  const returnTo = searchParams?.returnTo;
  const isBlocked = usage.maxPerMonth !== null && usage.percentUsed >= 1;
 
  return (
    <main>
      <Breadcrumbs
        breadcrumbs={[
          { label: 'Invoices', href: '/dashboard/invoices' },
          {
            label: 'Create Invoice',
            href: '/dashboard/invoices/create',
            active: true,
          },
        ]}
      />
      <div className="mb-4">
        <UpgradeNudge
          planId={usage.planId}
          usedThisMonth={usage.usedThisMonth}
          cap={usage.maxPerMonth}
          percentUsed={usage.percentUsed}
          interval={interval}
        />
      </div>
      {!isBlocked && (
        <Form
          customers={customers}
          initialCustomerId={initialCustomerId}
          returnTo={returnTo}
          usage={usage}
          interval={interval}
        />
      )}
    </main>
  );
}
