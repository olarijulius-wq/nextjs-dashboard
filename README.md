# Lateless – get paid faster, automatically

Lateless is a single-user invoicing SaaS for freelancers and small businesses. It helps you send invoices that can be paid in one click via Stripe Checkout, automates overdue reminders, and surfaces late-payer analytics so you can follow up with confidence.

Key features:
- Create customers and invoices scoped to your account
- Stripe Checkout “Pay now” links on each invoice
- Automatic overdue reminders via Resend (day 1, 7, 21)
- Late payer insights (average delay per customer)
- Plan limits (Free, Solo, Pro, Studio)
- Invoice CSV export and PDF download (on paid plans)
- Stripe subscriptions + Billing Portal
- Stripe Connect for payouts to the owner
- Scheduled reminder job via Vercel Cron

## Tech stack

- Next.js 15 App Router (React Server Components)
- TypeScript
- Tailwind CSS
- PostgreSQL via the `postgres` node client
- NextAuth Credentials provider (+ bcrypt)
- Stripe (Checkout, Billing Portal, Webhooks, Connect)
- Resend for transactional emails
- Deployed on Vercel (including cron job for reminders)

## Local development

Prereqs:
- Node.js 20+
- pnpm or npm
- PostgreSQL or Supabase
- Stripe test account
- Resend test key

Steps:
1. Clone the repo
2. Install dependencies: `pnpm install` or `npm install`
3. Create `.env.local` from `.env.example`
4. Run database migrations:

```bash
pnpm db:migrate
```

5. Start the dev server: `pnpm dev` or `npm run dev`
6. Open http://localhost:3000

## Running tests

Integration isolation tests run against a dedicated Postgres database.

1. Set `POSTGRES_URL_TEST` to your test DB connection string.
2. Run `pnpm test`.

`pnpm test` automatically maps `POSTGRES_URL_TEST` to `POSTGRES_URL`, runs DB migrations, and executes `tests/isolation.test.ts`.

Set `POSTGRES_URL_TEST` secret in GitHub repo settings.

## Environment variables

- `POSTGRES_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_SOLO`
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_STUDIO`
- `RESEND_API_KEY`
- `EMAIL_PROVIDER` (`resend` or `smtp`)
- `MAIL_FROM_EMAIL`
- `MAIL_FROM_NAME`
- `SUPPORT_EMAIL`
- `REMINDER_FROM_EMAIL`
- `SMTP_ENCRYPTION_KEY_BASE64` (base64-encoded 32-byte key for SMTP password encryption)
- `SENTRY_DSN` (optional in production; recommended)
- `REMINDER_CRON_TOKEN`
- `PAY_LINK_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `VERCEL_URL`

## Plans & limits

| Plan | Monthly invoice cap | CSV/PDF export | Reminders | Late-payer analytics |
| --- | --- | --- | --- | --- |
| Free | 3 | No | No | No |
| Solo | 50 | Yes | Yes | Yes |
| Pro | 250 | Yes | Yes | Yes |
| Studio | Unlimited | Yes | Yes | Yes |

## Implementation notes

- Tenant model is currently “user email = tenant”.
- Plan limits are enforced on the server (not only hidden in the UI).
- Login attempts are rate-limited.
- Reminder job is protected by `REMINDER_CRON_TOKEN`.
- Stripe webhooks sync subscription state and Stripe Connect status.
  