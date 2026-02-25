-- migrations/001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.users (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                varchar NOT NULL,
  email               text NOT NULL UNIQUE,
  password            text NOT NULL,
  is_pro              boolean NOT NULL DEFAULT false,
  stripe_customer_id  text,
  stripe_subscription_id text,
  subscription_status text,
  cancel_at_period_end boolean DEFAULT false,
  current_period_end  timestamptz,
  plan                text NOT NULL DEFAULT 'free'
);

CREATE TABLE IF NOT EXISTS public.customers (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       varchar NOT NULL,
  email      varchar NOT NULL,
  image_url  varchar,
  user_email text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_user_email
  ON public.customers (lower(user_email));

CREATE TABLE IF NOT EXISTS public.invoice_counters (
  user_email   text PRIMARY KEY,
  current_year integer NOT NULL,
  last_seq     integer NOT NULL,
  updated_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id                uuid NOT NULL,
  amount                     integer NOT NULL,
  status                     varchar NOT NULL,
  date                       date NOT NULL,
  user_email                 text NOT NULL,
  invoice_number             text,
  issued_at                  timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now(),
  stripe_checkout_session_id text,
  stripe_payment_intent_id   text,
  paid_at                    timestamptz,
  due_date                   date,
  currency                   text NOT NULL DEFAULT 'EUR',
  description                text,
  billing_name               text,
  billing_address_line1      text,
  billing_address_line2      text,
  billing_city               text,
  billing_postcode           text,
  billing_country            text,
  billing_vat_number         text,
  notes                      text,
  reminder_level             integer NOT NULL DEFAULT 0,
  last_reminder_sent_at      timestamptz
);

DO $$
BEGIN
  ALTER TABLE public.invoices
    ADD CONSTRAINT fk_invoices_customer
    FOREIGN KEY (customer_id)
    REFERENCES public.customers (id)
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_user_email
  ON public.invoices (lower(user_email));

CREATE INDEX IF NOT EXISTS idx_invoices_customer_id
  ON public.invoices (customer_id);

CREATE INDEX IF NOT EXISTS idx_invoices_due_date_status
  ON public.invoices (status, due_date);

CREATE INDEX IF NOT EXISTS idx_invoices_reminder_level
  ON public.invoices (reminder_level);

CREATE TABLE IF NOT EXISTS public.company_profiles (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_email     text NOT NULL UNIQUE,
  company_name   text NOT NULL,
  reg_code       text,
  vat_number     text,
  address_line1  text,
  address_line2  text,
  city           text,
  country        text,
  phone          text,
  billing_email  text,
  logo_url       text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);