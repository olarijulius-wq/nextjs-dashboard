## Wave 3.1 – Final Security Coverage

Generated from repo root `/Users/olari/lateless`.

---

### 1. Inventory & command outputs

#### 1.1 Routes

```bash
rg --files app/api | rg 'route\.ts$' | sort
```

```bash
app/api/account/auth-connections/route.ts
app/api/account/change-password/route.ts
app/api/account/delete/route.ts
app/api/account/link-provider/route.ts
app/api/account/resend-verification/route.ts
app/api/auth/[...nextauth]/route.ts
app/api/billing/dismiss-banner/route.ts
app/api/billing/recovery-email/route.ts
app/api/customers/export/route.ts
app/api/dashboard/refund-requests/[id]/approve/route.ts
app/api/dashboard/refund-requests/[id]/decline/route.ts
app/api/dashboard/refund-requests/route.ts
app/api/feedback/route.ts
app/api/health/route.ts
app/api/invoices/[id]/pay/route.ts
app/api/invoices/[id]/pdf/route.ts
app/api/invoices/[id]/send/route.ts
app/api/invoices/export/route.ts
app/api/public/invoices/[token]/pay/route.ts
app/api/public/invoices/[token]/pdf/route.ts
app/api/public/invoices/[token]/refund-request/route.ts
app/api/reminders/fix-logs/route.ts
app/api/reminders/pause/route.ts
app/api/reminders/resume/route.ts
app/api/reminders/run-manual/route.ts
app/api/reminders/run/route.ts
app/api/seo/verify/route.ts
app/api/settings/billing/self-check/route.ts
app/api/settings/company-profile/route.ts
app/api/settings/documents/logo/route.ts
app/api/settings/documents/route.ts
app/api/settings/documents/sample-pdf/route.ts
app/api/settings/launch-check/ping/route.ts
app/api/settings/launch-check/run/route.ts
app/api/settings/reminders/runs/route.ts
app/api/settings/smoke-check/ping/route.ts
app/api/settings/smoke-check/run/route.ts
app/api/settings/smoke-check/test-email/route.ts
app/api/settings/smtp/route.ts
app/api/settings/smtp/test/route.ts
app/api/settings/team/active/route.ts
app/api/settings/team/invite/[token]/accept/route.ts
app/api/settings/team/invite/route.ts
app/api/settings/team/members/[userId]/route.ts
app/api/settings/unsubscribe/list/route.ts
app/api/settings/unsubscribe/resubscribe/route.ts
app/api/settings/unsubscribe/route.ts
app/api/settings/usage/route.ts
app/api/settings/usage/verify/route.ts
app/api/stripe/checkout/route.ts
app/api/stripe/connect-login/route.ts
app/api/stripe/connect-resync/route.ts
app/api/stripe/connect/onboard/route.ts
app/api/stripe/portal/route.ts
app/api/stripe/reconcile/route.ts
app/api/stripe/webhook/route.ts
```

#### 1.2 Rate limit usage

```bash
rg -n "enforceRateLimit|bucket:" app/api -S
```

```bash
app/api/stripe/reconcile/route.ts:10:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/stripe/reconcile/route.ts:149:    const rateLimitResponse = await enforceRateLimit(
app/api/stripe/reconcile/route.ts:152:        bucket: 'stripe_reconcile',
app/api/account/link-provider/route.ts:5:import { enforceRateLimit, parseQuery } from '@/app/lib/security/api-guard';
app/api/account/link-provider/route.ts:50:  const rl = await enforceRateLimit(
app/api/account/link-provider/route.ts:53:      bucket: 'account_link_provider',
app/api/account/change-password/route.ts:6:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/account/change-password/route.ts:37:    const rl = await enforceRateLimit(
app/api/account/change-password/route.ts:40:        bucket: 'account_change_password',
app/api/account/auth-connections/route.ts:10:import { enforceRateLimit, parseQuery } from '@/app/lib/security/api-guard';
app/api/account/auth-connections/route.ts:70:  const rl = await enforceRateLimit(
app/api/account/auth-connections/route.ts:73:      bucket: 'account_auth_connections_delete',
app/api/account/resend-verification/route.ts:6:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/account/resend-verification/route.ts:31:  const rateLimitResponse = await enforceRateLimit(
app/api/account/resend-verification/route.ts:34:      bucket: 'resend_verification',
app/api/stripe/portal/route.ts:12:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/stripe/portal/route.ts:24:  const rl = await enforceRateLimit(
app/api/stripe/portal/route.ts:27:      bucket: 'stripe_portal',
app/api/stripe/connect/onboard/route.ts:6:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/stripe/connect/onboard/route.ts:136:  const rl = await enforceRateLimit(
app/api/stripe/connect/onboard/route.ts:139:      bucket: 'stripe_connect_onboard',
app/api/stripe/connect-login/route.ts:9:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/stripe/connect-login/route.ts:23:  const rl = await enforceRateLimit(
app/api/stripe/connect-login/route.ts:26:      bucket: 'stripe_connect_login',
app/api/account/delete/route.ts:6:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/account/delete/route.ts:36:    const rl = await enforceRateLimit(
app/api/account/delete/route.ts:39:        bucket: 'account_delete',
app/api/stripe/connect-resync/route.ts:14:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/stripe/connect-resync/route.ts:28:  const rl = await enforceRateLimit(
app/api/stripe/connect-resync/route.ts:31:      bucket: 'stripe_connect_resync',
app/api/stripe/checkout/route.ts:22:  enforceRateLimit,
app/api/stripe/checkout/route.ts:60:  const rateLimitResponse = await enforceRateLimit(
app/api/stripe/checkout/route.ts:63:      bucket: 'stripe_checkout',
app/api/health/route.ts:3:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/health/route.ts:8:  const rateLimitResponse = await enforceRateLimit(
app/api/health/route.ts:11:      bucket: 'health',
app/api/public/invoices/[token]/refund-request/route.ts:14:  enforceRateLimit,
app/api/public/invoices/[token]/refund-request/route.ts:51:  const rateLimitResponse = await enforceRateLimit(
app/api/public/invoices/[token]/refund-request/route.ts:54:      bucket: 'public_refund_request',
app/api/invoices/[id]/send/route.ts:13:  enforceRateLimit,
app/api/invoices/[id]/send/route.ts:46:  const rl = await enforceRateLimit(req, {
app/api/invoices/[id]/send/route.ts:47:    bucket: 'invoice_send',
app/api/public/invoices/[token]/pay/route.ts:22:  enforceRateLimit,
app/api/public/invoices/[token]/pay/route.ts:37:  const rateLimitResponse = await enforceRateLimit(
app/api/public/invoices/[token]/pay/route.ts:40:      bucket: 'public_invoice_pay',
app/api/public/invoices/[token]/pdf/route.ts:10:  enforceRateLimit,
app/api/public/invoices/[token]/pdf/route.ts:81:  const rateLimitResponse = await enforceRateLimit(
app/api/public/invoices/[token]/pdf/route.ts:84:      bucket: 'public_invoice_pdf',
app/api/reminders/resume/route.ts:17:  enforceRateLimit,
app/api/reminders/resume/route.ts:71:    const rl = await enforceRateLimit(
app/api/reminders/resume/route.ts:74:        bucket: 'reminders_resume',
app/api/seo/verify/route.ts:3:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/seo/verify/route.ts:6:  const rateLimitResponse = await enforceRateLimit(
app/api/seo/verify/route.ts:9:      bucket: 'seo_verify',
app/api/reminders/fix-logs/route.ts:13:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/reminders/fix-logs/route.ts:31:    const rl = await enforceRateLimit(
app/api/reminders/fix-logs/route.ts:34:        bucket: 'reminders_fix_logs',
app/api/dashboard/refund-requests/[id]/approve/route.ts:17:  enforceRateLimit,
app/api/dashboard/refund-requests/[id]/approve/route.ts:129:    const rl = await enforceRateLimit(
app/api/dashboard/refund-requests/[id]/approve/route.ts:132:        bucket: 'refund_approve',
app/api/reminders/pause/route.ts:17:  enforceRateLimit,
app/api/reminders/pause/route.ts:73:    const rl = await enforceRateLimit(
app/api/reminders/pause/route.ts:76:        bucket: 'reminders_pause',
app/api/reminders/run/route.ts:35:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/reminders/run/route.ts:472:  const rateLimitResponse = await enforceRateLimit(
app/api/reminders/run/route.ts:476:        bucket: 'reminders_run_cron',
app/api/reminders/run/route.ts:481:        bucket: 'reminders_run_manual',
app/api/stripe/webhook/route.ts:32:import { enforceRateLimit } from "@/app/lib/security/api-guard";
app/api/stripe/webhook/route.ts:2409:  const rateLimitResponse = await enforceRateLimit(
app/api/stripe/webhook/route.ts:2412:      bucket: "stripe_webhook",
app/api/invoices/[id]/pdf/route.ts:8:  enforceRateLimit,
app/api/invoices/[id]/pdf/route.ts:126:  const rl = await enforceRateLimit(req, {
app/api/invoices/[id]/pdf/route.ts:127:    bucket: 'invoice_pdf',
app/api/customers/export/route.ts:6:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/customers/export/route.ts:25:  const rl = await enforceRateLimit(req, {
app/api/customers/export/route.ts:26:    bucket: 'customers_export',
app/api/reminders/run-manual/route.ts:7:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/reminders/run-manual/route.ts:44:    const rl = await enforceRateLimit(
app/api/reminders/run-manual/route.ts:47:        bucket: 'reminders_run_manual',
app/api/invoices/export/route.ts:6:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/invoices/export/route.ts:34:  const rl = await enforceRateLimit(req, {
app/api/invoices/export/route.ts:35:    bucket: 'invoice_export',
app/api/settings/company-profile/route.ts:15:  enforceRateLimit,
app/api/settings/company-profile/route.ts:75:    const rl = await enforceRateLimit(
app/api/settings/company-profile/route.ts:78:        bucket: 'settings_company_profile',
app/api/settings/smtp/test/route.ts:17:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/settings/smtp/test/route.ts:42:    const rl = await enforceRateLimit(
app/api/settings/smtp/test/route.ts:45:        bucket: 'smtp_test',
app/api/billing/recovery-email/route.ts:8:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/billing/recovery-email/route.ts:23:    const rl = await enforceRateLimit(
app/api/billing/recovery-email/route.ts:26:        bucket: 'billing_recovery_email',
app/api/invoices/[id]/pay/route.ts:5:  enforceRateLimit,
app/api/invoices/[id]/pay/route.ts:44:  const rl = await enforceRateLimit(req, {
app/api/invoices/[id]/pay/route.ts:45:    bucket: 'invoice_pay',
app/api/settings/team/invite/route.ts:10:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/settings/team/invite/route.ts:42:    const rl = await enforceRateLimit(
app/api/settings/team/invite/route.ts:45:        bucket: 'team_invite',
```

#### 1.3 Unguarded parsing (post-hardening scan)

```bash
rg -n "req\\.json\\(|new URL\\(req\\.url\\)|searchParams|get\\(" app/api -S
```

_(Truncated to the highest-signal lines after hardening):_

```bash
app/api/stripe/connect/onboard/route.ts:158:    new URL(req.url).searchParams.get('reconnect') === '1';
app/api/stripe/checkout/route.ts:74:  const url = new URL(req.url);
app/api/stripe/checkout/route.ts:81:  if ((req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
app/api/stripe/reconcile/route.ts:165:      body = await req.json();
app/api/stripe/webhook/route.ts:2421:  const sig = req.headers.get("stripe-signature");
app/api/feedback/route.ts:70:      userAgent: request.headers.get('user-agent'),
app/api/reminders/run/route.ts:130:  const url = new URL(req.url);
app/api/reminders/run/route.ts:268:  const dryRunFromQuery = url.searchParams.get('dryRun');
app/api/reminders/run-manual/route.ts:16:      : new URL(req.url).origin)
app/api/reminders/run-manual/route.ts:57:    if ((req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
app/api/invoices/[id]/send/route.ts:59:  const returnTo = sanitizeReturnTo(new URL(req.url).searchParams.get('returnTo'));
app/api/settings/usage/route.ts:28:    const params = new URL(request.url).searchParams;
app/api/settings/usage/verify/route.ts:11:      new URL(request.url).searchParams.get('metric'),
app/api/public/invoices/[token]/refund-request/route.ts:43:      : new URL(req.url).origin)
app/api/settings/team/invite/route.ts:27:      : new URL(req.url).origin)
```

The remaining unguarded parsing is:

- Intentional `new URL` usage for **internal redirects/URLs** where only known query keys are read and not directly user-written JSON.
- Stripe webhook and reconcile handlers that already have their own strong verification and are out of scope for this wave.

#### 1.4 Strict schema usage

```bash
rg -n "parseJsonBody\\(|parseQuery\\(|parseRouteParams\\(|\\.strict\\(" app/api -S
```

_(Snippet)_

```bash
app/api/account/link-provider/route.ts:13:  .strict();
app/api/account/link-provider/route.ts:66:  const parsedQuery = parseQuery(linkProviderQuerySchema, url);
app/api/account/auth-connections/route.ts:44:  .strict();
app/api/account/auth-connections/route.ts:86:  const parsedQuery = parseQuery(authConnectionsDeleteQuerySchema, url);
app/api/account/change-password/route.ts:22:  .strict();
app/api/account/change-password/route.ts:49:    const parsedBody = await parseJsonBody(request, changePasswordBodySchema);
app/api/account/delete/route.ts:21:  .strict();
app/api/account/delete/route.ts:48:    const parsedBody = await parseJsonBody(request, deleteAccountBodySchema);
app/api/account/resend-verification/route.ts:28:  .strict();
app/api/account/resend-verification/route.ts:47:    const parsedBody = await parseJsonBody(request, resendVerificationSchema);
app/api/reminders/pause/route.ts:36:    .strict(),
app/api/reminders/pause/route.ts:43:    .strict(),
app/api/reminders/pause/route.ts:85:    const parsedBody = await parseJsonBody(request, remindersPauseBodySchema);
app/api/reminders/resume/route.ts:35:    .strict(),
app/api/reminders/resume/route.ts:41:    .strict(),
app/api/reminders/resume/route.ts:83:    const parsedBody = await parseJsonBody(request, remindersResumeBodySchema);
app/api/reminders/run-manual/route.ts:24:  .strict();
app/api/reminders/run-manual/route.ts:58:      const parsedBody = await parseJsonBody(req, remindersRunManualBodySchema);
app/api/settings/company-profile/route.ts:30:  .strict();
app/api/settings/company-profile/route.ts:87:    const parsedBody = await parseJsonBody(request, companyProfileBodySchema);
app/api/settings/smtp/test/route.ts:29:  .strict();
app/api/settings/smtp/test/route.ts:57:    const parsedBody = await parseJsonBody(request, smtpTestBodySchema);
app/api/settings/team/invite/route.ts:19:  .strict();
app/api/settings/team/invite/route.ts:54:    const parsedBody = await parseJsonBody(request, inviteSchema);
app/api/invoices/[id]/send/route.ts:55:  const parsedParams = parseRouteParams(routeUuidParamsSchema, rawParams);
app/api/invoices/[id]/pay/route.ts:53:  const parsedParams = parseRouteParams(routeUuidParamsSchema, rawParams);
app/api/invoices/[id]/pdf/route.ts:135:  const parsedParams = parseRouteParams(routeUuidParamsSchema, rawParams);
app/api/public/invoices/[token]/pay/route.ts:53:  const parsedParams = parseRouteParams(routeTokenParamsSchema, rawParams);
app/api/public/invoices/[token]/pdf/route.ts:97:  const parsedParams = parseRouteParams(routeTokenParamsSchema, rawParams);
app/api/public/invoices/[token]/refund-request/route.ts:29:  .strict();
app/api/public/invoices/[token]/refund-request/route.ts:67:  const parsedParams = parseRouteParams(routeTokenParamsSchema, rawParams);
app/api/public/invoices/[token]/refund-request/route.ts:85:  const parsedBody = await parseJsonBody(request, refundRequestBodySchema);
app/api/stripe/checkout/route.ts:33:  .strict();
app/api/stripe/checkout/route.ts:41:  .strict();
app/api/stripe/checkout/route.ts:49:  .strict();
app/api/stripe/checkout/route.ts:75:  const parsedQuery = parseQuery(checkoutQuerySchema, url);
app/api/stripe/checkout/route.ts:82:    const parsedBody = await parseJsonBody(req, checkoutBodySchema);
app/api/stripe/reconcile/route.ts:17:  .strict()
```

---

### 2. Before/after coverage summary (Wave 3.1 focus)

**Targeted endpoints in this wave and their final state:**

| Endpoint | RL bucket | window / limits | failClosed | Strict validation |
| --- | --- | --- | --- | --- |
| `POST /api/account/link-provider` | `account_link_provider` | 300s, ip 30, user 10 | ✅ | `parseQuery` + `.strict()` for `provider` enum |
| `DELETE /api/account/auth-connections` | `account_auth_connections_delete` | 300s, ip 30, user 10 | ✅ | `parseQuery` + `.strict()` for `provider` enum |
| `POST /api/reminders/pause` | `reminders_pause` | 60s, ip 30, user 20 | ❌ | `parseJsonBody` with discriminated union strict schema on `scope` (`customer`/`invoice`) |
| `POST /api/reminders/resume` | `reminders_resume` | 60s, ip 30, user 20 | ❌ | `parseJsonBody` with discriminated union strict schema on `scope` |
| `POST /api/reminders/run-manual` | `reminders_run_manual` | 300s, ip 10, user 3 | ❌ | Optional JSON body via `parseJsonBody` strict `{ dryRun?: boolean }` |
| `POST /api/reminders/fix-logs` | `reminders_fix_logs` | 300s, ip 10, user 3 | ❌ | No JSON body (diagnostic endpoint); only RL added |
| `POST /api/settings/company-profile` | `settings_company_profile` | 60s, ip 30, user 15 | ❌ | `parseJsonBody` with strict object for `companyName`, `address`, `vatNumber`, `vatOrRegNumber`, `companyEmail`, `invoiceFooter` |

All these now:

- Use **Postgres-backed rate limiting** via `enforceRateLimit` with IP + user key for authenticated flows.
- Validate all JSON payloads via `parseJsonBody` + **Zod `.strict()`** (or avoid JSON entirely for log-diagnostics).
- Use centralized error responses:
  - `INVALID_REQUEST_BODY`, `INVALID_JSON` (from `parseJsonBody`).
  - `INVALID_QUERY` (from `parseQuery`).
  - `RATE_LIMITED` with `Retry-After` and `X-RateLimit-*` headers (from `enforceRateLimit`).

---

### 3. Verification (lint / tsc / build)

#### 3.1 `pnpm lint`

```bash
pnpm lint
```

```bash
> @ lint /Users/olari/lateless
> eslint .
```

Result: **pass**.

#### 3.2 `pnpm -s exec tsc --noEmit`

```bash
pnpm -s exec tsc --noEmit
```

TypeScript reported existing `.next/types` entries missing (TS6053) due to `tsconfig.json` including `.next/types/**/*.ts`. This is a known local tooling issue and **not** caused by the Wave 3.1 API/security changes. No new type errors were introduced in the hardened routes.

#### 3.3 `pnpm build`

```bash
pnpm build
```

Build result:

- Next.js build succeeded.
- Sentry CLI sourcemap upload failed with external `403` (unchanged from previous waves).

Key snippet:

```bash
✓ Compiled successfully in 23.2s
  Linting and checking validity of types ...
  Collecting page data ...
  ...
ƒ Middleware                                     93.8 kB
```

---

### 4. Curl tests (Wave 3.1 endpoints)

Assume:

- `BASE` is your deployment origin (e.g. `https://app.example.com`).
- A **valid authenticated session cookie** is present for authenticated routes (use `-b "cookie=..."`).

#### 4.1 Strict unknown key rejection – `/api/account/link-provider` (INVALID_QUERY)

Query schema: strict `{ provider: "google" | "github" }`.

```bash
curl -i -X POST "$BASE/api/account/link-provider?provider=google&extra=1" \
  -b "cookie=YOUR_SESSION_COOKIE"
```

Expected:

- HTTP **400**
- Body with shape:

```json
{
  "ok": false,
  "code": "INVALID_QUERY",
  "message": "Invalid query parameters.",
  "issues": [
    { "code": "unrecognized_keys", "keys": ["extra"], ... }
  ]
}
```

#### 4.2 Strict unknown key rejection – `/api/reminders/pause` (INVALID_REQUEST_BODY)

Body schema (discriminated union on `scope`):

- `scope:"customer"` → `{ scope, email, reason? }`
- `scope:"invoice"` → `{ scope, invoiceId, reason? }`

```bash
curl -i -X POST "$BASE/api/reminders/pause" \
  -H "Content-Type: application/json" \
  -b "cookie=YOUR_SESSION_COOKIE" \
  --data '{"scope":"customer","email":"user@example.com","reason":"test","extra":"nope"}'
```

Expected:

- HTTP **400**
- Body from `parseJsonBody`:

```json
{
  "ok": false,
  "code": "INVALID_REQUEST_BODY",
  "message": "Invalid request body.",
  "issues": [
    { "code": "unrecognized_keys", "keys": ["extra"], ... }
  ]
}
```

#### 4.3 Strict unknown key rejection – `/api/settings/company-profile`

Body schema is strict with optional fields: `companyName`, `address`, `vatNumber`, `vatOrRegNumber`, `companyEmail`, `invoiceFooter`.

```bash
curl -i -X POST "$BASE/api/settings/company-profile" \
  -H "Content-Type: application/json" \
  -b "cookie=YOUR_SESSION_COOKIE" \
  --data '{"companyName":"ACME","companyEmail":"billing@example.com","unexpected":"x"}'
```

Expected:

- HTTP **400**
- `INVALID_REQUEST_BODY` with an `unrecognized_keys` issue for `unexpected`.

#### 4.4 Rate limit 429 – `/api/account/link-provider`

Bucket: `account_link_provider` (300s, ip 30, user 10, **failClosed: true**).

```bash
for i in $(seq 1 40); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$BASE/api/account/link-provider?provider=google" \
    -b "cookie=YOUR_SESSION_COOKIE"
done

curl -i -X POST "$BASE/api/account/link-provider?provider=google" \
  -b "cookie=YOUR_SESSION_COOKIE"
```

Expected final response:

- HTTP **429**
- Body:

```json
{
  "ok": false,
  "code": "RATE_LIMITED",
  "error": "Too many requests",
  "bucket": "account_link_provider",
  "retryAfterSec": 300
}
```

Headers include `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`.

#### 4.5 Rate limit 429 – `/api/reminders/run-manual`

Bucket: `reminders_run_manual` (300s, ip 10, user 3).

```bash
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$BASE/api/reminders/run-manual" \
    -H "Content-Type: application/json" \
    -b "cookie=YOUR_SESSION_COOKIE" \
    --data '{"dryRun":true}'
done

curl -i -X POST "$BASE/api/reminders/run-manual" \
  -H "Content-Type: application/json" \
  -b "cookie=YOUR_SESSION_COOKIE" \
  --data '{"dryRun":true}'
```

Expected:

- HTTP **429** after the quota is exceeded.
- Body: `{ ok:false, code:"RATE_LIMITED", error:"Too many requests", bucket:"reminders_run_manual", retryAfterSec:300 }`.

---

### 5. Files changed (Wave 3.1 scope)

- `app/lib/security/api-guard.ts` (shared primitives already in place; reused here)
- `app/api/account/link-provider/route.ts`
- `app/api/account/auth-connections/route.ts`
- `app/api/reminders/pause/route.ts`
- `app/api/reminders/resume/route.ts`
- `app/api/reminders/run-manual/route.ts`
- `app/api/reminders/fix-logs/route.ts`
- `app/api/settings/company-profile/route.ts`

All changes are within allowed scope (`app/api/**/route.ts`, `app/lib/security/**`, `middleware.ts`, `docs/security/**`) and preserve existing business logic while adding:

- Postgres-backed rate limiting with appropriate `failClosed` choices.
- Strict Zod schemas on JSON/query surfaces.
- Standardized error responses via shared helpers.

