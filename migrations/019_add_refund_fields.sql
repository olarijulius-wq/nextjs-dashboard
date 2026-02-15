ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;