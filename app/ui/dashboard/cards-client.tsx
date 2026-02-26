'use client';

import {
  BanknotesIcon,
  ClockIcon,
  UserGroupIcon,
  InboxIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType } from 'react';
import { lusitana } from '@/app/ui/fonts';
import { StaggeredList } from '@/app/ui/motion/reveal';

type CardType = 'invoices' | 'customers' | 'pending' | 'collected';

type CardProps = {
  title: string;
  value: number | string;
  type: CardType;
};

type CardsClientProps = {
  numberOfInvoices: number;
  numberOfCustomers: number;
  totalPaidInvoices: number | string;
  totalPendingInvoices: number | string;
};

const iconMap: Record<CardType, ComponentType<{ className?: string }>> = {
  collected: BanknotesIcon,
  customers: UserGroupIcon,
  pending: ClockIcon,
  invoices: InboxIcon,
};

function Card({ title, value, type }: CardProps) {
  const Icon = iconMap[type];

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-neutral-800 dark:bg-black dark:shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
      <div className="flex items-center p-3">
        {Icon ? <Icon className="h-5 w-5 text-neutral-700 dark:text-slate-200" /> : null}
        <h3 className="ml-2 text-sm font-medium text-neutral-700 dark:text-slate-200">{title}</h3>
      </div>
      <p
        className={`${lusitana.className} truncate rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-2xl text-neutral-900 dark:border-neutral-800 dark:bg-black dark:text-slate-50`}
      >
        {value}
      </p>
    </div>
  );
}

export default function CardsClient({
  numberOfInvoices,
  numberOfCustomers,
  totalPaidInvoices,
  totalPendingInvoices,
}: CardsClientProps) {
  return (
    <StaggeredList
      mode="mount"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2"
      itemClassName="h-full"
      stagger={0.08}
    >
      <Card title="Collected" value={totalPaidInvoices} type="collected" />
      <Card title="Pending" value={totalPendingInvoices} type="pending" />
      <Card title="Total Invoices" value={numberOfInvoices} type="invoices" />
      <Card title="Total Customers" value={numberOfCustomers} type="customers" />
    </StaggeredList>
  );
}
