import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { deleteCustomer } from '@/app/lib/actions';
import { secondaryButtonClasses } from '@/app/ui/button';

export function UpdateCustomer({ id, returnTo }: { id: string; returnTo?: string }) {
  const href = returnTo
    ? `/dashboard/customers/${id}/edit?returnTo=${encodeURIComponent(returnTo)}`
    : `/dashboard/customers/${id}/edit`;

  return (
    <Link
      href={href}
      className={`${secondaryButtonClasses} h-9 px-2`}
    >
      <PencilIcon className="w-5" />
    </Link>
  );
}

export function DeleteCustomer({ id }: { id: string }) {
  const deleteCustomerWithId = deleteCustomer.bind(null, id);
  return (
    <form action={deleteCustomerWithId}>
      <button
        type="submit"
        className={`${secondaryButtonClasses} h-9 px-2`}
      >
        <span className="sr-only">Delete</span>
        <TrashIcon className="w-5" />
      </button>
    </form>
  );
}
