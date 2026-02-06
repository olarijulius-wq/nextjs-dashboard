import Image from 'next/image';
import Link from 'next/link';
import { FormattedCustomersTable } from '@/app/lib/definitions';
import { DeleteCustomer, UpdateCustomer } from '@/app/ui/customers/buttons';

function InitialAvatar({ name }: { name: string }) {
  const initial = (name?.trim()?.charAt(0) || '?').toUpperCase();
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/20 text-xs font-semibold text-sky-300">
      {initial}
    </div>
  );
}

export default async function CustomersTable({
  customers,
}: {
  customers: FormattedCustomersTable[];
}) {
  return (
    <div className="mt-6 flow-root">
      <div className="overflow-x-auto overflow-y-visible">
          <div className="inline-block min-w-full align-middle">
            <div className="overflow-visible rounded-2xl border border-slate-800 bg-slate-900/80 p-2 shadow-[0_18px_35px_rgba(0,0,0,0.45)] md:pt-0">
              <div className="md:hidden">
                {customers?.map((customer) => (
                  <div
                    key={customer.id}
                    className="mb-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                  >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <div className="mb-2 flex items-center">
                        <div className="flex items-center gap-3">
                          {customer.image_url ? (
                            <Image
                              src={customer.image_url}
                              className="rounded-full"
                              alt={`${customer.name}'s profile picture`}
                              width={28}
                              height={28}
                            />
                          ) : (
                            <InitialAvatar name={customer.name} />
                          )}
                          <Link
                            href={`/dashboard/customers/${customer.id}`}
                            className="text-slate-100 hover:text-sky-200"
                          >
                            {customer.name}
                          </Link>
                        </div>
                      </div>
                      <p className="text-sm text-slate-400">{customer.email}</p>
                    </div>
                  </div>

                  <div className="flex w-full items-center justify-between border-b border-slate-800 py-5">
                    <div className="flex w-1/2 flex-col">
                      <p className="text-xs text-slate-400">Pending</p>
                      <p className="font-medium text-sky-200">
                        {customer.total_pending}
                      </p>
                    </div>
                    <div className="flex w-1/2 flex-col">
                      <p className="text-xs text-slate-400">Paid</p>
                      <p className="font-medium text-emerald-200">
                        {customer.total_paid}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 text-sm text-slate-300">
                    <p>{customer.total_invoices} invoices</p>
                    <div className="flex justify-end gap-2">
                      <UpdateCustomer id={customer.id} />
                      <DeleteCustomer id={customer.id} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <table className="hidden min-w-full rounded-md text-slate-100 md:table">
              <thead className="rounded-md bg-slate-950/40 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-5 font-medium sm:pl-6">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Email
                  </th>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Total Invoices
                  </th>
                  <th scope="col" className="px-3 py-5 font-medium">
                    Total Pending
                  </th>
                  <th scope="col" className="px-4 py-5 font-medium">
                    Total Paid
                  </th>
                  <th scope="col" className="px-4 py-5 font-medium text-center">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800 text-slate-200">
                {customers.map((customer) => (
                  <tr key={customer.id} className="group transition hover:bg-slate-900/60">
                    <td className="whitespace-nowrap py-5 pl-4 pr-3 text-sm text-slate-100 group-first-of-type:rounded-xl group-last-of-type:rounded-xl sm:pl-6">
                      <div className="flex items-center gap-3">
                        {customer.image_url ? (
                          <Image
                            src={customer.image_url}
                            className="rounded-full"
                            alt={`${customer.name}'s profile picture`}
                            width={28}
                            height={28}
                          />
                        ) : (
                          <InitialAvatar name={customer.name} />
                        )}
                        <Link
                          href={`/dashboard/customers/${customer.id}`}
                          className="hover:text-sky-200"
                        >
                          {customer.name}
                        </Link>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-sm text-slate-300">
                      {customer.email}
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-sm text-slate-300">
                      {customer.total_invoices}
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-sm text-sky-200">
                      {customer.total_pending}
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-sm text-emerald-200 group-first-of-type:rounded-xl group-last-of-type:rounded-xl">
                      {customer.total_paid}
                    </td>
                    <td className="whitespace-nowrap px-4 py-5 text-center text-sm ...">
                      <div className="flex justify-center gap-3">
                        <UpdateCustomer id={customer.id} />
                        <DeleteCustomer id={customer.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Optional: kui list tühi */}
            {customers.length === 0 && (
              <div className="p-6 text-sm text-slate-300">
                No customers yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
