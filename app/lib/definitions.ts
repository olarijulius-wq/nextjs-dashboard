// This file contains type definitions for your data.
// It describes the shape of the data, and what data type each property should accept.
// For simplicity of teaching, we're manually defining these types.
// However, these types are generated automatically if you're using an ORM such as Prisma.
export type User = {
  id: string;
  name: string;
  email: string;
  password: string;
  plan?: 'free' | 'solo' | 'pro' | 'studio';
  is_pro?: boolean;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  cancel_at_period_end?: boolean | null;
  current_period_end?: string | Date | null;
  is_verified?: boolean;
  verification_token?: string | null;
  verification_sent_at?: string | null;
  two_factor_enabled?: boolean | null;
  two_factor_code_hash?: string | null;
  two_factor_expires_at?: string | Date | null;
  two_factor_attempts?: number | null;
  password_reset_token?: string | null;
  password_reset_sent_at?: string | Date | null;
  stripe_connect_account_id?: string | null;
  stripe_connect_payouts_enabled?: boolean;
  stripe_connect_details_submitted?: boolean;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  image_url: string;
};

export type InvoiceStatus =
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed'
  | 'failed';

export type Invoice = {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
  invoice_number: string | null;
  status: InvoiceStatus;
};

export type Revenue = {
  month: string;
  revenue: number;
};

export type LatestInvoice = {
  id: string;
  name: string;
  image_url: string;
  email: string;
  amount: string;
  invoice_number: string | null;
  status: InvoiceStatus;
  due_date: string | null;
};

// The database returns a number for amount, but we later format it to a string with the formatCurrency function
export type LatestInvoiceRaw = Omit<LatestInvoice, 'amount'> & {
  amount: number;
};

export type InvoicesTable = {
  id: string;
  customer_id: string;
  name: string;
  email: string;
  image_url: string;
  date: string;
  due_date: string | null;
  days_overdue: number;
  amount: number;
  invoice_number: string | null;
  status: InvoiceStatus;
};

export type InvoiceDetail = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  amount: number;
  invoice_number: string | null;
  status: InvoiceStatus;
  date: string;
  due_date: string | null;
};

export type CustomersTableType = {
  id: string;
  name: string;
  email: string;
  image_url: string;
  total_invoices: number;
  total_pending: number;
  total_paid: number;
};

export type FormattedCustomersTable = {
  id: string;
  name: string;
  email: string;
  image_url: string;
  total_invoices: number;
  total_pending: string;
  total_paid: string;
};

export type CustomerField = {
  id: string;
  name: string;
};

export type CustomerForm = {
  id: string;
  name: string;
  email: string;
  image_url: string | null;
};

export type InvoiceForm = {
  id: string;
  customer_id: string;
  amount: number;
  status: 'pending' | 'paid';
  due_date: string | null;
};

export type CustomerInvoice = {
  id: string;
  amount: number;
  status: InvoiceStatus;
  date: string;
};

export type CompanyProfile = {
  id: string;
  user_email: string;
  company_name: string;
  reg_code: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  billing_email: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type LatePayerStat = {
  customer_id: string;
  name: string;
  email: string;
  paid_invoices: number;
  avg_delay_days: number;
};
