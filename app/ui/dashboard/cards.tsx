import {
  BanknotesIcon,
  ClockIcon,
  UserGroupIcon,
  InboxIcon,
} from '@heroicons/react/24/outline';
import { lusitana } from '@/app/ui/fonts';
import { fetchCardData } from '@/app/lib/data';

const iconMap = {
  collected: BanknotesIcon,
  customers: UserGroupIcon,
  pending: ClockIcon,
  invoices: InboxIcon,
};

export function Card({
  title,
  value,
  type,
}: {
  title: string;
  value: number | string;
  type: 'invoices' | 'customers' | 'pending' | 'collected';
}) {
  const Icon = iconMap[type];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
      <div className="flex items-center p-3">
        {Icon ? <Icon className="h-5 w-5 text-sky-300" /> : null}
        <h3 className="ml-2 text-sm font-medium text-slate-200">{title}</h3>
      </div>
      <p
        className={`${lusitana.className} truncate rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-8 text-center text-2xl text-slate-50`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function CardWrapper() {
  const {
    numberOfInvoices,
    numberOfCustomers,
    totalPaidInvoices,
    totalPendingInvoices,
  } = await fetchCardData();

  return (
    <>
      <Card title="Collected" value={totalPaidInvoices} type="collected" />
      <Card title="Pending" value={totalPendingInvoices} type="pending" />
      <Card title="Total Invoices" value={numberOfInvoices} type="invoices" />
      <Card title="Total Customers" value={numberOfCustomers} type="customers" />
    </>
  );
}
