# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Next.js + Turbopack)
pnpm build        # Production build
pnpm lint         # ESLint
pnpm test         # Integration tests (requires POSTGRES_URL_TEST env var)
pnpm db:migrate   # Apply SQL migrations
DRY_RUN=1 pnpm db:migrate  # Dry-run migrations
```

Tests use **jiti** to run TypeScript directly without compilation. Set `POSTGRES_URL_TEST` to a dedicated test database before running `pnpm test`. The test runner automatically maps it to `POSTGRES_URL`, runs migrations, and executes `tests/isolation.test.ts`. There is no per-test filter flag; comment out test blocks in the file to run a subset.

## Architecture

**Lateless** is a multi-tenant invoicing SaaS (Next.js 15, TypeScript, PostgreSQL). Users create workspaces, invite team members, create customers and invoices, and collect payment via Stripe Checkout links. Overdue reminders run on a Vercel Cron schedule.

### Key directories

- `app/lib/` — All business logic (53 files). The most important:
  - `db.ts` — Singleton `postgres` client (connection pool, SSL)
  - `data.ts` — All data-fetching queries; workspace-scoped by default
  - `actions.ts` — Server actions wiring forms to mutations
  - `definitions.ts` — Shared TypeScript types
  - `config.ts` — Plan limits (Free / Solo / Pro / Studio)
  - `email.ts` — Sends via Resend or SMTP (controlled by `EMAIL_PROVIDER`)
  - `stripe-*.ts` — Stripe Checkout, webhooks, Connect, dunning
  - `reminder-*.ts` — Cron-triggered reminder logic
  - `usage.ts` — Monthly invoice cap enforcement
  - `workspaces.ts` — Multi-workspace / team membership helpers
- `app/(auth)/` — Login, signup, verify routes (public)
- `app/dashboard/` — All protected pages (invoices, customers, settings, etc.)
- `app/api/` — API routes: Stripe webhooks, reminder cron, settings helpers
- `migrations/` — 45 sequential SQL files managed by `scripts/migrate.mjs`
- `tests/` — Integration test suite (`isolation.test.ts`)

### Data model

All data is scoped to a **workspace**. Users belong to one or more workspaces via `workspace_members`. The core tables are `users`, `workspaces`, `workspace_members`, `customers`, `invoices`, `invoice_email_logs`. Plan usage is tracked in `usage_events`. Stripe subscription state lives in `dunning_state` and `billing_events`. Webhook idempotency is enforced via `stripe_webhook_events`.

### Rendering patterns

- Data pages use **React Server Components** with direct DB calls (no separate API layer).
- Mutations use **`'use server'` actions** (not REST endpoints).
- After mutations, prefer revalidating narrow paths with `revalidatePath`; avoid broad dashboard-wide invalidations.
- Force-dynamic rendering only for pages that must reflect real-time payment state (invoice detail, PDF).

### Auth

NextAuth 5 (beta) with a Credentials provider. Session validation happens in `auth.ts`; route protection in `middleware.ts`. Login attempts are rate-limited (15-minute window). CSRF protection validates `Origin`/`Referer` headers for all mutating requests.

### Email

Controlled by `EMAIL_PROVIDER=resend|smtp`. Reminder emails can use a separate sender via `REMINDER_FROM_EMAIL`. Throttle behaviour during cron runs is controlled by `EMAIL_BATCH_SIZE`, `EMAIL_THROTTLE_MS`, and `EMAIL_MAX_RUN_MS`.

### Diagnostics & smoke checks

- `/dashboard/settings/smoke-check` — Run a manual smoke check as owner/admin.
- `/dashboard/settings/all-checks` — Full pre-launch checklist.
- `DIAGNOSTICS_ENABLED` env var: defaults ON in development, OFF in production. Enable temporarily for diagnostics runs.

### Testing reminder cron locally

```bash
curl -i -H "Authorization: Bearer $REMINDER_CRON_TOKEN" \
  "http://localhost:3000/api/reminders/run?triggeredBy=cron"
```
