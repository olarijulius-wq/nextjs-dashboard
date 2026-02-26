import { sql } from '@/app/lib/db';

export type PublicInvoiceBranding = {
  companyName: string;
  billingEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  logoUrl: string | null;
};

type CompanyProfileRow = {
  company_name: string | null;
  billing_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  country: string | null;
  logo_url: string | null;
};

export class MissingInvoiceWorkspaceError extends Error {
  readonly invoiceId: string;
  readonly userEmail: string | null;

  constructor(input: { invoiceId: string; userEmail?: string | null }) {
    super('INVOICE_WORKSPACE_ID_MISSING');
    this.name = 'MissingInvoiceWorkspaceError';
    this.invoiceId = input.invoiceId;
    this.userEmail = input.userEmail?.trim() || null;
  }
}

function toBranding(row?: CompanyProfileRow): PublicInvoiceBranding {
  return {
    companyName: row?.company_name?.trim() || '',
    billingEmail: row?.billing_email?.trim() || '',
    addressLine1: row?.address_line1?.trim() || '',
    addressLine2: row?.address_line2?.trim() || '',
    city: row?.city?.trim() || '',
    country: row?.country?.trim() || '',
    logoUrl: row?.logo_url?.trim() || null,
  };
}

export async function getCompanyProfileForInvoiceWorkspace(input: {
  invoiceId: string;
  workspaceId: string | null;
  userEmail?: string | null;
}): Promise<PublicInvoiceBranding> {
  const workspaceId = input.workspaceId?.trim() || null;

  if (!workspaceId) {
    console.warn(
      '[public-branding] workspace_id missing; run migration/backfill required',
      {
        invoiceId: input.invoiceId,
        userEmail: input.userEmail?.trim() || null,
      },
    );

    if (process.env.NODE_ENV !== 'production' && input.userEmail?.trim()) {
      const [fallback] = await sql<CompanyProfileRow[]>`
        select
          company_name,
          billing_email,
          address_line1,
          address_line2,
          city,
          country,
          logo_url
        from public.company_profiles
        where lower(user_email) = lower(${input.userEmail})
        order by updated_at desc
        limit 1
      `;
      return toBranding(fallback);
    }

    throw new MissingInvoiceWorkspaceError({
      invoiceId: input.invoiceId,
      userEmail: input.userEmail,
    });
  }

  const [profile] = await sql<CompanyProfileRow[]>`
    select
      company_name,
      billing_email,
      address_line1,
      address_line2,
      city,
      country,
      logo_url
    from public.company_profiles
    where workspace_id = ${workspaceId}
    limit 1
  `;

  return toBranding(profile);
}
