# Perf Notes (Next.js App Router)

## UI Unification Audit Checklist (Phase A)

Main list pages (already good, keep stable):
- `/dashboard/invoices`: Keep current list controls + URL state + table rhythm.
- `/dashboard/customers`: Keep current list controls + URL state + table rhythm.
- `/dashboard/late-payers`: Keep current list controls + URL state + table rhythm.

Secondary pages (polish/unify):
- `/dashboard/invoices/[id]`: Problem: dense mixed sections, weak scan hierarchy, empty/right-side dead space.
  Fix plan: move to shared `PageShell` + `TwoColumnDetail`, compact key fields grid, scoped activity/reminder/payment cards.
- `/dashboard/customers/[id]`: Problem: loads all invoices without scoped search/filter/paging.
  Fix plan: add server-side paged customer invoice query + namespaced URL params (`ci*`) + compact stats and section cards.
- `/dashboard/settings/*`: Problem: headings/card rhythm differ per page, spacing and max-width vary.
  Fix plan: keep existing logic, normalize top-level wrappers with shared section surfaces and consistent action placement.
- `/dashboard/profile`, `/dashboard/feedback`, `/dashboard/reminders`: Problem: uneven heading/section rhythm vs list pages.
  Fix plan: align with `PageShell` and shared card spacing where safe.
- `/dashboard/onboarding` and `/onboarding`: Problem: duplicated onboarding entry points and mixed UI patterns.
  Fix plan: canonicalize on `/dashboard/onboarding`, redirect legacy route, unify steps + persistent hide/reopen behavior.
- Dashboard setup card (`/dashboard`): Problem: always visible and heavy after setup completion.
  Fix plan: support hide/dismiss and completion collapse with a small floating reopen entry point.
- Secondary auth/invite/verify/pay pages: Problem: inconsistent empty/help states and action placement.
  Fix plan: apply `EmptyState`/section-card pattern opportunistically without changing core flow logic.

Top likely causes of slow dev navigation in this repo and what to check next:

1. Repeated server auth/database reads on settings/dashboard routes
- Check for sequential fetches that can be parallelized with `Promise.all`.
- Reuse already loaded user/workspace context in the same request when possible.

2. Client-side `router.refresh()` bursts after mutations
- Check panels that call `router.refresh()` after every action.
- Prefer optimistic local state updates first, then a single refresh when needed.

3. Dynamic rendering where static/cached output would work
- Current forced-dynamic routes are invoice detail/payment and PDF routes.
- Keep dynamic only for pages that must reflect near-real-time payment state.

4. Broad cache revalidation after writes
- Check `revalidatePath` usage in server actions.
- Revalidate the narrowest path set needed (avoid wide dashboard invalidations).

5. Large settings/dashboard trees with many client components
- Check if interactive-only parts can stay client-side while data-heavy sections remain server-rendered.
- Move non-interactive wrappers and copy blocks to server components to reduce client JS in dev.

## Invoice Reminders Throttle Smoke Test

Local trigger:
- `curl -i -H "Authorization: Bearer $REMINDER_CRON_TOKEN" "http://localhost:3000/api/reminders/run?triggeredBy=cron"`
- `curl -i -H "x-reminder-cron-token: $REMINDER_CRON_TOKEN" "http://localhost:3000/api/reminders/run?triggeredBy=cron"`

Recommended local env for quick verification:
- `EMAIL_BATCH_SIZE=3`
- `EMAIL_THROTTLE_MS=2000`
- `EMAIL_MAX_RUN_MS=30000`

How to confirm throttling:
- Tail server logs and check reminder send timestamps are spaced by about `EMAIL_THROTTLE_MS`.
- Confirm API response includes `attempted`, `sent`, `failed`, `skipped`, `hasMore`.
- Set `EMAIL_BATCH_SIZE` below eligible reminders and verify `hasMore=true` in the JSON response.

## Reminder Run Scope Smoke Test

- Trigger a manual run from `/dashboard/reminders` and confirm the new `public.reminder_runs` row has `workspace_id` and `user_email` populated.
- Open `/dashboard/settings/reminders` for that workspace and confirm the run is visible in the workspace-scoped list.
- Trigger a cron run and confirm `workspace_id` is populated when candidates are found, while actor displays as `—`.

## Reminder Log Backfill

- Open `Settings -> Reminders -> Diagnostics`.
- Click `Fix historical rows`.
- Expected result: older cron rows with recoverable scope metadata are backfilled and now appear in the Recent runs table for the active workspace scope.

## Launch Hardening Checks

### 1) Stripe sanity (dev/prod)

- Open `/dashboard/settings/billing` as owner/admin and review the **Billing self-check** panel.
- Verify:
  - Environment and Stripe key mode are correct.
  - Key suffix is masked (`****1234` style).
  - Connected account ID matches expected `acct_...`.
  - Last webhook status is recent and `processed` for normal traffic.
- Click **Run self-check**.
- Expected result: `PASS`.
- If it fails with access/config guidance, fix `STRIPE_SECRET_KEY` and/or reconnect Stripe in `/dashboard/settings/payouts`.

### 2) Reminders locking

- Kick one run:
  - `curl -s -H "Authorization: Bearer $REMINDER_CRON_TOKEN" "http://localhost:3000/api/reminders/run?triggeredBy=cron" | jq`
- Immediately kick a second run with same scope/token.
- Expected result:
  - One request processes normally.
  - The other returns `{"skipped":true,"reason":"lock_not_acquired"}` (HTTP 200).
- Manual runs (`/api/reminders/run-manual`) and cron runs share the same lock behavior.

### 3) Webhook idempotency

- Replay one Stripe event ID twice (via Stripe CLI or dashboard replay).
- Expected result:
  - First request outcome: `processed`.
  - Second request outcome: `duplicate` with no repeated side effects.
- Verify ledger:
  - `select event_id, status, processed_at from public.stripe_webhook_events where event_id = '<evt_id>';`
  - Only one row for that `event_id`.

### 4) Invoice send UX end-to-end

- From `/dashboard/invoices`, click **Send invoice** on a row.
- Expected result:
  - Button shows `Sending…` then `Sent`.
  - List stays in place and shows a send confirmation banner.
  - Row retains latest send state.
- Open `/dashboard/invoices/:id` for that invoice:
  - Last invoice email status is shown.
  - **Send invoice** supports retry with actionable error text.
- Guardrail checks:
  - Missing customer email returns clear inline error and **Fix customer** link.
  - Missing provider config returns clear admin hint to fix SMTP/Resend settings.

## Failed Payment Recovery & Dunning

### 1) Simulate payment failure (Stripe test mode)

- Use Stripe test mode and create/update a subscription for a test customer.
- In Stripe Dashboard, force a failed invoice payment (`invoice.payment_failed`) by attaching a failing test payment method, then retry with a valid one to emit `invoice.payment_succeeded`.
- Confirm in Lateless:
  - Dashboard shows the payment recovery banner.
  - `/dashboard/settings/billing` shows `recovery_required = yes` and latest billing event.

### 2) Replay webhook events safely

- Replay the same Stripe event from Stripe Dashboard or Stripe CLI.
- Expected behavior:
  - `public.stripe_webhook_events` remains idempotent by `event_id`.
  - `public.billing_events` does not duplicate rows for the same `stripe_event_id`.
  - `public.dunning_state` keeps stable end state (no incorrect status flaps from replay).

### 3) Verification SQL

- Check current workspace dunning state:
  - `select workspace_id, subscription_status, recovery_required, last_payment_failure_at, last_recovery_email_at, last_banner_dismissed_at, updated_at from public.dunning_state where workspace_id = '<workspace_id>';`
- Check recent billing events:
  - `select created_at, event_type, status, stripe_event_id, stripe_object_id from public.billing_events where workspace_id = '<workspace_id>' order by created_at desc limit 50;`
- Validate event dedupe:
  - `select stripe_event_id, count(*) from public.billing_events where stripe_event_id is not null group by stripe_event_id having count(*) > 1;`

## Usage Invoices Verification (30d, Europe/Tallinn)

- Raw count (last 30 days, invoices created):
  - Workspace-scoped (if `invoices.workspace_id` exists):
    - `select count(*) as created_count from public.invoices i where i.workspace_id = '<workspace_id>' and i.issued_at >= ((date_trunc('day', now() at time zone 'Europe/Tallinn') - interval '29 days') at time zone 'Europe/Tallinn') and i.issued_at < (((date_trunc('day', now() at time zone 'Europe/Tallinn') + interval '1 day')) at time zone 'Europe/Tallinn');`
  - Email fallback (if `invoices.workspace_id` does not exist):
    - `select count(*) as created_count from public.invoices i where lower(i.user_email) = lower('<user_email>') and i.issued_at >= ((date_trunc('day', now() at time zone 'Europe/Tallinn') - interval '29 days') at time zone 'Europe/Tallinn') and i.issued_at < (((date_trunc('day', now() at time zone 'Europe/Tallinn') + interval '1 day')) at time zone 'Europe/Tallinn');`

- Grouped by day (last 30 days, Europe/Tallinn, zero-filled):
  - Workspace-scoped (if `invoices.workspace_id` exists):
    - `with bounds as (select date_trunc('day', now() at time zone 'Europe/Tallinn') - interval '29 days' as start_day, date_trunc('day', now() at time zone 'Europe/Tallinn') as end_day), days as (select generate_series((select start_day from bounds), (select end_day from bounds), interval '1 day') as day), grouped as (select date_trunc('day', i.issued_at at time zone 'Europe/Tallinn') as day, count(*)::int as count from public.invoices i where i.workspace_id = '<workspace_id>' and i.issued_at is not null and i.issued_at >= ((select start_day from bounds) at time zone 'Europe/Tallinn') and i.issued_at < (((select end_day from bounds) + interval '1 day') at time zone 'Europe/Tallinn') group by 1) select to_char(days.day, 'YYYY-MM-DD') as day, coalesce(grouped.count, 0) as created_count from days left join grouped on grouped.day = days.day order by days.day asc;`
  - Email fallback (if `invoices.workspace_id` does not exist):
    - `with bounds as (select date_trunc('day', now() at time zone 'Europe/Tallinn') - interval '29 days' as start_day, date_trunc('day', now() at time zone 'Europe/Tallinn') as end_day), days as (select generate_series((select start_day from bounds), (select end_day from bounds), interval '1 day') as day), grouped as (select date_trunc('day', i.issued_at at time zone 'Europe/Tallinn') as day, count(*)::int as count from public.invoices i where lower(i.user_email) = lower('<user_email>') and i.issued_at is not null and i.issued_at >= ((select start_day from bounds) at time zone 'Europe/Tallinn') and i.issued_at < (((select end_day from bounds) + interval '1 day') at time zone 'Europe/Tallinn') group by 1) select to_char(days.day, 'YYYY-MM-DD') as day, coalesce(grouped.count, 0) as created_count from days left join grouped on grouped.day = days.day order by days.day asc;`

## Usage Analytics Dev Sanity Checklist (P0)

- Create 3 invoices today in Tallinn-local daytime and confirm `Created` daily count increases by 3 in `/dashboard/settings/usage` (Invoices card, last 30 days).
- Send 1 invoice email and confirm `Sent` daily count increases by 1 (Invoices card, metric `Sent`).
- Mark 1 invoice as paid and confirm `Paid` daily count increases by 1 (Invoices card, metric `Paid`).
- Open `Diagnostics` on usage page and confirm `monthTotal === sumDaily` for the selected metric.
- Confirm month tile `Invoices created` equals plan line `Monthly invoices used` and is sourced from the same created metric query.
- Timezone boundary check: create an invoice at 23:30 Europe/Tallinn and verify it appears on that Tallinn date (not shifted to adjacent day).

## Usage analytics sanity

- Confirm `created_at` exists and is populated:
  - `select count(*) as total, count(created_at) as with_created_at from public.invoices;`
- Quick 7-day created counts (user scope):
  - `select date_trunc('day', created_at at time zone 'Europe/Tallinn')::date as day, count(*) from public.invoices where lower(user_email)=lower('<email>') and created_at >= now() - interval '7 days' group by 1 order by 1 desc;`
- Quick 7-day created counts (workspace scope):
  - `select date_trunc('day', created_at at time zone 'Europe/Tallinn')::date as day, count(*) from public.invoices where workspace_id = '<workspace_id>' and created_at >= now() - interval '7 days' group by 1 order by 1 desc;`

## How To Test In Production (Smoke Check)

- Sign in as `olarijulius@gmail.com` with owner/admin role in the target workspace.
- Open `/dashboard/settings/smoke-check` and click **Run checks**.
- Confirm table renders pass/warn/fail/manual items for Stripe config/API, webhook dedupe, email primitives, schema sanity, and observability.
- Click **Send test email**:
  - Recipient must be your own account email.
  - Subject contains `[Lateless Test]`.
  - Re-clicking inside 10 minutes should return a rate-limit message.
- Confirm latest run timestamp updates in Europe/Tallinn and **Copy report** copies JSON payload.
- Verify persistence in DB:
  - `select ran_at, actor_email, workspace_id, ok, payload->>'kind' as kind from public.smoke_checks order by ran_at desc limit 20;`
- Complete manual checklist items:
  - Stripe event replay (replay same event twice and verify dedupe row behavior).
  - SPF/DKIM/DMARC DNS verification.
  - Migration completeness verification from deploy/migration logs.

## Launch + Smoke All Checks (P0)

- Local run:
  - Start app with local env and `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
  - Sign in as allowlisted owner/admin.
  - Open `/dashboard/settings/all-checks` and click **Run all checks**.
- Production run:
  - Set production env (`NODE_ENV=production`, `NEXT_PUBLIC_APP_URL=https://lateless.org`, `STRIPE_CONNECT_MODE=account_links|oauth`, `MAIL_FROM_EMAIL`).
  - Sign in as allowlisted owner/admin on production.
  - Open `/dashboard/settings/all-checks` and click **Run all checks**.
- Status interpretation:
  - `PASS`: check is healthy.
  - `WARN`: non-blocking issue to fix soon (for example missing `SENTRY_DSN`).
  - `FAIL`: release-blocking issue (for example wrong app URL host or missing production mail sender).
  - `MANUAL`: explicit human verification step required (for example DNS records, Stripe delivery replay).

## Stripe Connect Smoke-Check Mode Detection

- `stripe-config-sanity` now determines Connect mode in this order:
  - Explicit env override: `STRIPE_CONNECT_MODE=oauth|account_links`.
  - Code scan fallback: OAuth indicators (`connect.stripe.com/oauth/authorize`, `stripe.oauth.token`, OAuth callback `code`/token exchange) vs Account Links indicators (`stripe.accountLinks.create`, `stripe.accounts.create`, `account_onboarding`, `stripe.accounts.createLoginLink`).
- `STRIPE_CONNECT_CLIENT_ID` is required only when detected mode is `oauth`.
- If mode is `account_links`, check reports pass for that requirement with detail: `OAuth not used; Client ID not required.`
- If mode is `unknown`, check reports `warn` (not fail for client ID) and recommends setting `STRIPE_CONNECT_MODE` for deterministic behavior.

## P0 Migration Tracking

- Apply pending repository SQL migrations and record them in `public.schema_migrations`:
  - `pnpm db:migrate`
- Optional dry run:
  - `DRY_RUN=1 pnpm db:migrate`
- Verify latest tracking rows:
  - `select filename, applied_at, checksum from public.schema_migrations order by applied_at desc limit 20;`
- Open `/dashboard/settings/migrations` (owner/admin + allowlist) and confirm:
  - `Last applied` is populated.
  - `Pending migrations` is `0` for a fully deployed environment.

## P0 Email Deliverability

- Set minimum env:
  - `EMAIL_PROVIDER=resend|smtp`
  - `MAIL_FROM_EMAIL=billing@yourdomain.com`
  - `MAIL_FROM_NAME=Lateless`
  - `RESEND_API_KEY=...` (when provider is `resend`)
- Open `/dashboard/settings/smtp` and confirm **Email setup** status is `PASS`.
- Click **Send test email**:
  - Recipient is always the signed-in actor email.
  - Repeated click inside 10 minutes returns rate-limit response.
- Verify smoke check persistence:
  - `select ran_at, payload->>'kind' as kind, payload->>'success' as success, payload->>'messageId' as message_id from public.smoke_checks order by ran_at desc limit 20;`

## P0 Sentry Quick Verification

- Leave `SENTRY_DSN` unset: app should boot without runtime crashes.
- Set `SENTRY_DSN` and restart.
- Trigger a controlled server error in development (temporary throw in a test route), then hit the route once.
- Confirm event appears in Sentry project and that payloads avoid raw customer/invoice objects.
