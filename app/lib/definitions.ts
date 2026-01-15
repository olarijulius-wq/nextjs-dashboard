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
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  image_url: string;
};

export type Invoice = {
  id: string;
  customer_id: string;
  amount: number;
  date: string;
  invoice_number: string | null;
  // In TypeScript, this is called a string union type.
  // It means that the "status" property can only be one of the two strings: 'pending' or 'paid'.
  status: 'pending' | 'paid';
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
  amount: number;
  invoice_number: string | null;
  status: 'pending' | 'paid';
};

export type InvoiceDetail = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  amount: number;
  invoice_number: string | null;
  status: 'pending' | 'paid';
  date: string;
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
};

export type CustomerInvoice = {
  id: string;
  amount: number;
  status: 'pending' | 'paid';
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
