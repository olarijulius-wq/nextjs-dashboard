## Wave 3 Security Hardening

### 1. Summary

- **Rate limiting** extended to additional Stripe/billing helpers and sensitive account operations using Postgres-backed `enforceRateLimit`.
- **Strict input validation** strengthened for account password/change/delete and existing invite/test-email flows via Zod `.strict()` and centralized helpers.
- **Security headers** added in `middleware.ts` for a safer default baseline (HSTS in production only, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options).
- All changes stay within API/security plumbing only; no UI/UX files were touched.

---

### 2. Endpoint coverage (selected high-risk endpoints)

| Endpoint | Rate limited | Bucket / window / limits | failClosed | Strict schema usage |
| --- | --- | --- | --- | --- |
| `GET /api/health` | ✅ | `health`, 60s, ip 60 | ✅ | N/A (no body/query) |
| `GET /api/seo/verify` | ✅ | `seo_verify`, 60s, ip 30 | ✅ | N/A (no body/query) |
| `POST /api/account/resend-verification` | ✅ | `resend_verification`, 60s, ip 5 | ✅ | `parseJsonBody` + `.strict()` email |
| `POST /api/account/change-password` | ✅ | `account_change_password`, 300s, ip 20, user 10 | ❌ | `parseJsonBody` + `.strict()` (currentPassword/newPassword/confirmNewPassword) |
| `POST /api/account/delete` | ✅ | `account_delete`, 600s, ip 10, user 5 | ❌ | `parseJsonBody` + `.strict()` (confirmText/currentPassword) |
| `POST /api/invoices/[id]/pay` | ✅ | `invoice_pay`, 60s, ip 20, user 15 | ❌ | `parseRouteParams(routeUuidParamsSchema)` |
| `GET /api/invoices/[id]/pdf` | ✅ | `invoice_pdf`, 60s, ip 30 | ❌ | `parseRouteParams(routeUuidParamsSchema)` |
| `POST /api/invoices/[id]/send` | ✅ | `invoice_send`, 300s, ip 20, user 10 | ❌ | `parseRouteParams(routeUuidParamsSchema)` |
| `GET /api/invoices/export` | ✅ | `invoice_export`, 300s, ip 10, user 5 | ❌ | Auth + plan checks only (no body/query) |
| `GET /api/customers/export` | ✅ | `customers_export`, 300s, ip 10, user 5 | ❌ | Auth + plan checks only (no body/query) |
| `POST /api/settings/smtp/test` | ✅ | `smtp_test`, 300s, ip 5, user 3 | ✅ | `parseJsonBody` + `.strict()` (optional toEmail) |
| `POST /api/settings/team/invite` | ✅ | `team_invite`, 300s, ip 10, user 5 | ❌ | `parseJsonBody` + `.strict()` (email+role) |
| `POST /api/dashboard/refund-requests/[id]/approve` | ✅ | `refund_approve`, 300s, ip 20, user 10 | ✅ | `parseRouteParams(routeUuidParamsSchema)` |
| `POST /api/stripe/portal` | ✅ | `stripe_portal`, 300s, ip 10, user 5 | ✅ | N/A (no body/query) |
| `POST /api/stripe/connect/onboard` | ✅ | `stripe_connect_onboard`, 300s, ip 10, user 3 | ✅ | Query parsed inline, no JSON body |
| `POST /api/stripe/connect-resync` | ✅ | `stripe_connect_resync`, 300s, ip 10, user 5 | ✅ | N/A (no body/query) |
| `GET /api/stripe/connect-login` | ✅ | `stripe_connect_login`, 300s, ip 20, user 10 | ✅ | N/A (no body/query) |
| `POST /api/billing/recovery-email` | ✅ | `billing_recovery_email`, 600s, ip 10, user 5 | ✅ | N/A (no body/query) |

All rate limits are enforced via Postgres-backed `public.api_rate_limits` through `enforceRateLimit`. For authenticated routes, the user’s email is passed as `userKey` when available.

---

### 3. Security headers

In `middleware.ts`, the following headers are now set on every response:

- **X-Content-Type-Options**: `nosniff`
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Permissions-Policy**: `geolocation=(), microphone=(), camera=()`
- **X-Frame-Options**: `SAMEORIGIN`
- **Strict-Transport-Security** (production only): `max-age=63072000; includeSubDomains; preload`

These are chosen to be broadly safe and compatible with existing Stripe and NextAuth integrations (no CSP added yet).

---

### 4. Verification commands

Replace `BASE` with your deployment origin and plug in real IDs/tokens where needed.

#### 4.1 429 rate limit on a public endpoint

`GET /api/health` (bucket `health`, ipLimit 60 per 60s, failClosed):

```bash
for i in $(seq 1 80); do
  curl -s -o /dev/null -w "%{http_code}\n" "$BASE/api/health"
done

curl -i "$BASE/api/health"
```

Expected body (shape):

```json
{
  "ok": false,
  "code": "RATE_LIMITED",
  "error": "Too many requests",
  "bucket": "health",
  "retryAfterSec": 60
}
```

#### 4.2 400 invalid body (unknown keys)

`POST /api/settings/team/invite`:

```bash
curl -i -X POST "$BASE/api/settings/team/invite" \
  -H "Content-Type: application/json" \
  -b "cookie=YOUR_SESSION_COOKIE" \
  --data '{"email":"invitee@example.com","role":"admin","extra":"nope"}'
```

Expected:

- HTTP 400
- JSON with `{ ok:false, code:"INVALID_REQUEST_BODY", message:"Invalid request body.", issues:[...] }` (Zod `unrecognized_keys`).

#### 4.3 CSRF origin mismatch 403

For any cookie-auth mutation not under `/api/public/` or `/api/auth/` (e.g. `POST /api/account/change-password`), send a cross-origin request with cookies but a mismatched `Origin`:

```bash
curl -i -X POST "$BASE/api/account/change-password" \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.example.com" \
  -b "cookie=YOUR_SESSION_COOKIE" \
  --data '{"currentPassword":"oldpw","newPassword":"newpassword1","confirmNewPassword":"newpassword1"}'
```

Expected:

- HTTP 403
- Body: `{ ok:false, code:"CSRF_ORIGIN_MISMATCH", error:"Cross-site request blocked." }`

#### 4.4 Reminders run GET returns 405

```bash
curl -i "$BASE/api/reminders/run"
```

Expected:

- HTTP 405
- No state change.

#### 4.5 Valid authenticated mutation still works

Example: `POST /api/account/change-password`:

```bash
curl -i -X POST "$BASE/api/account/change-password" \
  -H "Content-Type: application/json" \
  -b "cookie=YOUR_SESSION_COOKIE" \
  --data '{"currentPassword":"oldpw","newPassword":"newpassword1","confirmNewPassword":"newpassword1"}'
```

Expected:

- HTTP 200
- `{ ok:true }`

---

### 5. Files changed in Wave 3

- `app/lib/security/api-guard.ts`
- `app/api/account/change-password/route.ts`
- `app/api/account/delete/route.ts`
- `app/api/stripe/connect-resync/route.ts`
- `app/api/stripe/connect-login/route.ts`
- `app/api/billing/recovery-email/route.ts`
- `middleware.ts`

