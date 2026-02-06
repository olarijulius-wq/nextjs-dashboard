'use client';

import {
  UserGroupIcon,
  HomeIcon,
  DocumentDuplicateIcon,
  Cog6ToothIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

// Map of links to display in the side navigation.
const links = [
  { name: 'Home', href: '/dashboard', icon: HomeIcon },
  {
    name: 'Invoices',
    href: '/dashboard/invoices',
    icon: DocumentDuplicateIcon,
  },
  { name: 'Customers', href: '/dashboard/customers', icon: UserGroupIcon },
  { name: 'Late payers', href: '/dashboard/late-payers', icon: ClockIcon },
  { name: 'Settings', href: '/dashboard/settings', icon: Cog6ToothIcon },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {links.map((link) => {
        const LinkIcon = link.icon;

        return (
          <Link
            key={link.name}
            href={link.href}
            className={clsx(
              'flex h-[48px] grow items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm font-medium text-slate-300 transition duration-200 ease-out hover:border-slate-600 hover:bg-slate-900/80 hover:text-slate-100 hover:scale-[1.01] md:flex-none md:justify-start md:p-2 md:px-3',
              {
                'border-sky-400/50 bg-slate-900/80 text-white shadow-[0_0_0_1px_rgba(56,189,248,0.25)]':
                  pathname === link.href,
              },
            )}
          >
            <LinkIcon className="w-6" />
            <p className="hidden md:block">{link.name}</p>
          </Link>
        );
      })}
    </>
  );
}
