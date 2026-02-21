'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/app/ui/button';
import { saveCompanyProfile, type CompanyProfileState } from '@/app/lib/actions';
import type { CompanyProfile } from '@/app/lib/definitions';
import { useRouter } from 'next/navigation';

type CompanyProfileFormProps = {
  initialProfile: CompanyProfile | null;
  invoiceNumberPreview: string;
};

export default function CompanyProfileForm({
  initialProfile,
  invoiceNumberPreview,
}: CompanyProfileFormProps) {
  const router = useRouter();
  const initialState: CompanyProfileState = { ok: true, message: null };
  const [state, formAction] = useActionState(saveCompanyProfile, initialState);

  const [companyName, setCompanyName] = useState(
    initialProfile?.company_name ?? '',
  );
  const [regCode, setRegCode] = useState(initialProfile?.reg_code ?? '');
  const [vatNumber, setVatNumber] = useState(initialProfile?.vat_number ?? '');
  const [addressLine1, setAddressLine1] = useState(
    initialProfile?.address_line1 ?? '',
  );
  const [addressLine2, setAddressLine2] = useState(
    initialProfile?.address_line2 ?? '',
  );
  const [city, setCity] = useState(initialProfile?.city ?? '');
  const [country, setCountry] = useState(initialProfile?.country ?? '');
  const [phone, setPhone] = useState(initialProfile?.phone ?? '');
  const [billingEmail, setBillingEmail] = useState(
    initialProfile?.billing_email ?? '',
  );

  useEffect(() => {
    if (state.ok && state.message === 'Company profile saved.') {
      router.refresh();
    }
  }, [router, state.message, state.ok]);

  return (
    <form action={formAction} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-[0_18px_35px_rgba(0,0,0,0.35)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Company profile</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Add your business details for invoices and PDFs.
          </p>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400">
          <p>Invoice numbering format: INV-YYYY-0001</p>
          <p>Next invoice number will look like: {invoiceNumberPreview}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label htmlFor="companyName" className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200">
            Company name
          </label>
          <input
            id="companyName"
            name="companyName"
            type="text"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-600/50"
            required
            aria-describedby="companyName-error"
          />
          <div id="companyName-error" aria-live="polite" aria-atomic="true">
            {state.errors?.companyName?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="regCode" className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200">
            Registration code
          </label>
          <input
            id="regCode"
            name="regCode"
            type="text"
            value={regCode}
            onChange={(event) => setRegCode(event.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-600/50"
            aria-describedby="regCode-error"
          />
          <div id="regCode-error" aria-live="polite" aria-atomic="true">
            {state.errors?.regCode?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="vatNumber" className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200">
            VAT number
          </label>
          <input
            id="vatNumber"
            name="vatNumber"
            type="text"
            value={vatNumber}
            onChange={(event) => setVatNumber(event.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-600/50"
            aria-describedby="vatNumber-error"
          />
          <div id="vatNumber-error" aria-live="polite" aria-atomic="true">
            {state.errors?.vatNumber?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="addressLine1" className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200">
            Address line 1
          </label>
          <input
            id="addressLine1"
            name="addressLine1"
            type="text"
            value={addressLine1}
            onChange={(event) => setAddressLine1(event.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-600/50"
            aria-describedby="addressLine1-error"
          />
          <div id="addressLine1-error" aria-live="polite" aria-atomic="true">
            {state.errors?.addressLine1?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <label htmlFor="addressLine2" className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200">
            Address line 2
          </label>
          <input
            id="addressLine2"
            name="addressLine2"
            type="text"
            value={addressLine2}
            onChange={(event) => setAddressLine2(event.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-600/50"
            aria-describedby="addressLine2-error"
          />
          <div id="addressLine2-error" aria-live="polite" aria-atomic="true">
            {state.errors?.addressLine2?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="city" className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200">
            City
          </label>
          <input
            id="city"
            name="city"
            type="text"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-600/50"
            aria-describedby="city-error"
          />
          <div id="city-error" aria-live="polite" aria-atomic="true">
            {state.errors?.city?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="country" className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200">
            Country
          </label>
          <input
            id="country"
            name="country"
            type="text"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-600/50"
            aria-describedby="country-error"
          />
          <div id="country-error" aria-live="polite" aria-atomic="true">
            {state.errors?.country?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200">
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="text"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-600/50"
            aria-describedby="phone-error"
          />
          <div id="phone-error" aria-live="polite" aria-atomic="true">
            {state.errors?.phone?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="billingEmail" className="mb-2 block text-sm font-medium text-slate-900 dark:text-slate-200">
            Billing email
          </label>
          <input
            id="billingEmail"
            name="billingEmail"
            type="email"
            value={billingEmail}
            onChange={(event) => setBillingEmail(event.target.value)}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 transition focus:border-slate-500 focus:ring-2 focus:ring-slate-500/40 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-600/50"
            aria-describedby="billingEmail-error"
          />
          <div id="billingEmail-error" aria-live="polite" aria-atomic="true">
            {state.errors?.billingEmail?.map((error) => (
              <p className="mt-2 text-sm text-red-500" key={error}>
                {error}
              </p>
            ))}
          </div>
        </div>

      </div>

      {state.message && (
        <p
          className={`mt-4 text-sm ${
            state.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-500'
          }`}
          aria-live="polite"
        >
          {state.message}
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button type="submit">Save company profile</Button>
      </div>
    </form>
  );
}
