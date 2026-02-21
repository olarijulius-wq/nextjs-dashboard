import Form from '@/app/ui/customers/create-form';
import Breadcrumbs from '@/app/ui/invoices/breadcrumbs';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Customer',
};

export default async function Page(props: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const searchParams = await props.searchParams;
  return (
    <main>
      <Breadcrumbs
        breadcrumbs={[
          { label: 'Customers', href: '/dashboard/customers' },
          { label: 'Create Customer', href: '/dashboard/customers/create', active: true },
        ]}
      />
      <Form returnTo={searchParams?.returnTo} />
    </main>
  );
}
