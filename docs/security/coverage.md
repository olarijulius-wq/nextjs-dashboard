## API Security Coverage Report – P1 Wave (BEFORE changes)

Generated on: 2026-02-23

This report reflects the **current** state of all `app/api/**/route.ts` handlers before applying any new hardening for the P1 wave.

---

### Raw command outputs

**Route inventory**

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

**Rate limiting usage**

```bash
rg -n "enforceRateLimit|bucket:" app/api -S
```

```bash
app/api/stripe/connect/onboard/route.ts:6:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/stripe/connect/onboard/route.ts:136:  const rl = await enforceRateLimit(req, {
app/api/stripe/connect/onboard/route.ts:137:    bucket: 'stripe_connect_onboard',
app/api/stripe/checkout/route.ts:22:  enforceRateLimit,
app/api/stripe/checkout/route.ts:60:  const rateLimitResponse = await enforceRateLimit(
app/api/stripe/checkout/route.ts:63:      bucket: 'stripe_checkout',
app/api/stripe/portal/route.ts:12:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/stripe/portal/route.ts:24:  const rl = await enforceRateLimit(req, {
app/api/stripe/portal/route.ts:25:    bucket: 'stripe_portal',
app/api/stripe/reconcile/route.ts:10:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/stripe/reconcile/route.ts:149:    const rateLimitResponse = await enforceRateLimit(
app/api/stripe/reconcile/route.ts:152:        bucket: 'stripe_reconcile',
app/api/stripe/webhook/route.ts:32:import { enforceRateLimit } from "@/app/lib/security/api-guard";
app/api/stripe/webhook/route.ts:2409:  const rateLimitResponse = await enforceRateLimit(
app/api/stripe/webhook/route.ts:2412:      bucket: "stripe_webhook",
app/api/health/route.ts:3:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/health/route.ts:8:  const rateLimitResponse = await enforceRateLimit(req, {
app/api/health/route.ts:9:    bucket: 'health',
app/api/seo/verify/route.ts:3:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/seo/verify/route.ts:6:  const rateLimitResponse = await enforceRateLimit(req, {
app/api/seo/verify/route.ts:7:    bucket: 'seo_verify',
app/api/account/resend-verification/route.ts:6:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/account/resend-verification/route.ts:31:  const rateLimitResponse = await enforceRateLimit(request, {
app/api/account/resend-verification/route.ts:32:    bucket: 'resend_verification',
app/api/invoices/[id]/send/route.ts:13:  enforceRateLimit,
app/api/invoices/[id]/send/route.ts:46:  const rl = await enforceRateLimit(req, {
app/api/invoices/[id]/send/route.ts:47:    bucket: 'invoice_send',
app/api/customers/export/route.ts:6:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/customers/export/route.ts:25:  const rl = await enforceRateLimit(req, {
app/api/customers/export/route.ts:26:    bucket: 'customers_export',
app/api/reminders/run/route.ts:35:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/reminders/run/route.ts:472:  const rateLimitResponse = await enforceRateLimit(
app/api/reminders/run/route.ts:476:        bucket: 'reminders_run_cron',
app/api/reminders/run/route.ts:481:        bucket: 'reminders_run_manual',
app/api/invoices/[id]/pdf/route.ts:8:  enforceRateLimit,
app/api/invoices/[id]/pdf/route.ts:126:  const rl = await enforceRateLimit(req, {
app/api/invoices/[id]/pdf/route.ts:127:    bucket: 'invoice_pdf',
app/api/public/invoices/[token]/refund-request/route.ts:14:  enforceRateLimit,
app/api/public/invoices/[token]/refund-request/route.ts:51:  const rateLimitResponse = await enforceRateLimit(
app/api/public/invoices/[token]/refund-request/route.ts:54:      bucket: 'public_refund_request',
app/api/invoices/[id]/pay/route.ts:5:  enforceRateLimit,
app/api/invoices/[id]/pay/route.ts:44:  const rl = await enforceRateLimit(req, {
app/api/invoices/[id]/pay/route.ts:45:    bucket: 'invoice_pay',
app/api/public/invoices/[token]/pdf/route.ts:10:  enforceRateLimit,
app/api/public/invoices/[token]/pdf/route.ts:81:  const rateLimitResponse = await enforceRateLimit(
app/api/public/invoices/[token]/pdf/route.ts:84:      bucket: 'public_invoice_pdf',
app/api/invoices/export/route.ts:6:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/invoices/export/route.ts:34:  const rl = await enforceRateLimit(req, {
app/api/invoices/export/route.ts:35:    bucket: 'invoice_export',
app/api/settings/smtp/test/route.ts:17:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/settings/smtp/test/route.ts:42:    const rl = await enforceRateLimit(request, {
app/api/settings/smtp/test/route.ts:43:      bucket: 'smtp_test',
app/api/dashboard/refund-requests/[id]/approve/route.ts:17:  enforceRateLimit,
app/api/dashboard/refund-requests/[id]/approve/route.ts:129:    const rl = await enforceRateLimit(_request, {
app/api/dashboard/refund-requests/[id]/approve/route.ts:130:      bucket: 'refund_approve',
app/api/settings/team/invite/route.ts:10:import { enforceRateLimit } from '@/app/lib/security/api-guard';
app/api/settings/team/invite/route.ts:58:    const rl = await enforceRateLimit(request, {
app/api/settings/team/invite/route.ts:59:      bucket: 'team_invite',
app/api/public/invoices/[token]/pay/route.ts:22:  enforceRateLimit,
app/api/public/invoices/[token]/pay/route.ts:37:  const rateLimitResponse = await enforceRateLimit(
app/api/public/invoices/[token]/pay/route.ts:40:      bucket: 'public_invoice_pay',
```

**Strict Zod schemas in app/api**

```bash
rg -n "\.strict\(" app/api -S
```

```bash
app/api/stripe/checkout/route.ts:33:  .strict();
app/api/stripe/checkout/route.ts:41:  .strict();
app/api/stripe/checkout/route.ts:49:  .strict();
app/api/stripe/reconcile/route.ts:17:  .strict()
app/api/public/invoices/[token]/refund-request/route.ts:29:  .strict();
app/api/account/resend-verification/route.ts:28:  .strict();
app/api/settings/smtp/test/route.ts:29:  .strict();
app/api/settings/team/invite/route.ts:17:}).strict();
```

**CSRF / origin handling in middleware**

```bash
rg -n "CSRF_EXEMPT|Origin|Referer|same-origin" middleware.ts -S
```

```bash
25:const CSRF_EXEMPT_API_EXACT_PATHS = new Set([
34:const CSRF_EXEMPT_API_PREFIXES = [
62:  if (CSRF_EXEMPT_API_EXACT_PATHS.has(pathname)) {
66:  return CSRF_EXEMPT_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
69:function isSameOrigin(value: string, expectedOrigin: string) {
71:    return new URL(value).origin === expectedOrigin;
104:    // the same-origin check like any other cookie-bearing request.
114:        const expectedOrigin = `${proto}://${host}`;
115:        const originMatches = origin ? isSameOrigin(origin, expectedOrigin) : false;
116:        const refererMatches = referer ? isSameOrigin(referer, expectedOrigin) : false;
```

**Schema / parse helper usage in app/api**

```bash
rg -n "export async function (GET|POST|PUT|PATCH|DELETE)" app/api -S
```

```bash
app/api/dashboard/refund-requests/[id]/decline/route.ts:18:export async function POST(
app/api/stripe/connect-login/route.ts:14:export async function GET() {
app/api/account/link-provider/route.ts:35:export async function POST(request: NextRequest) {
app/api/account/resend-verification/route.ts:30:export async function POST(request: Request) {
app/api/customers/export/route.ts:16:export async function GET(req: Request) {
app/api/stripe/reconcile/route.ts:134:export async function POST(req: Request) {
app/api/stripe/connect/onboard/route.ts:127:export async function POST(req: Request) {
app/api/settings/billing/self-check/route.ts:66:export async function GET() {
app/api/settings/billing/self-check/route.ts:93:export async function POST() {
app/api/dashboard/refund-requests/[id]/approve/route.ts:109:export async function POST(
app/api/stripe/portal/route.ts:16:export async function POST(req: Request) {
app/api/account/delete/route.ts:14:export async function POST(request: NextRequest) {
app/api/account/change-password/route.ts:14:export async function POST(request: NextRequest) {
app/api/settings/reminders/runs/route.ts:17:export async function GET() {
app/api/stripe/checkout/route.ts:51:export async function POST(req: Request) {
app/api/settings/team/active/route.ts:11:export async function POST(request: NextRequest) {
app/api/stripe/webhook/route.ts:2408:export async function POST(req: Request) {
app/api/settings/documents/route.ts:18:export async function GET() {
app/api/settings/documents/route.ts:49:export async function POST(request: NextRequest) {
app/api/account/auth-connections/route.ts:38:export async function GET() {
app/api/account/auth-connections/route.ts:53:export async function DELETE(request: Request) {
app/api/stripe/connect-resync/route.ts:19:export async function POST() {
app/api/billing/dismiss-banner/route.ts:5:export async function POST() {
app/api/dashboard/refund-requests/route.ts:18:export async function GET() {
app/api/settings/documents/logo/route.ts:18:export async function POST(request: NextRequest) {
app/api/settings/documents/logo/route.ts:83:export async function DELETE() {
app/api/billing/recovery-email/route.ts:9:export async function POST() {
app/api/public/invoices/[token]/refund-request/route.ts:47:export async function POST(
app/api/feedback/route.ts:34:export async function POST(request: NextRequest) {
app/api/feedback/route.ts:94:export async function GET() {
app/api/settings/launch-check/run/route.ts:15:export async function POST() {
app/api/settings/team/members/[userId]/route.ts:17:export async function DELETE(_: Request, props: RouteProps) {
app/api/settings/team/members/[userId]/route.ts:99:export async function PATCH(request: Request, props: RouteProps) {
app/api/settings/unsubscribe/list/route.ts:17:export async function GET() {
app/api/reminders/run/route.ts:983:export async function POST(req: Request) {
app/api/reminders/run/route.ts:990:export async function GET() {
app/api/health/route.ts:7:export async function GET(req: Request) {
app/api/settings/team/invite/route.ts:29:export async function POST(request: NextRequest) {
app/api/settings/documents/sample-pdf/route.ts:113:export async function GET() {
app/api/settings/unsubscribe/route.ts:18:export async function GET() {
app/api/settings/unsubscribe/route.ts:51:export async function POST(request: NextRequest) {
app/api/public/invoices/[token]/pdf/route.ts:77:export async function GET(
app/api/settings/launch-check/ping/route.ts:15:export async function GET() {
app/api/settings/usage/route.ts:23:export async function GET(request: Request) {
app/api/settings/team/invite/[token]/accept/route.ts:14:export async function POST(_: Request, props: RouteProps) {
app/api/reminders/run-manual/route.ts:18:export async function POST(req: Request) {
app/api/public/invoices/[token]/pay/route.ts:33:export async function POST(
app/api/settings/smoke-check/run/route.ts:19:export async function POST() {
app/api/settings/unsubscribe/resubscribe/route.ts:18:export async function POST(request: NextRequest) {
app/api/settings/smoke-check/test-email/route.ts:19:export async function POST() {
app/api/reminders/fix-logs/route.ts:18:export async function POST() {
app/api/settings/smoke-check/ping/route.ts:19:export async function GET() {
app/api/settings/usage/verify/route.ts:7:export async function GET(request: Request) {
app/api/invoices/export/route.ts:25:export async function GET(req: Request) {
app/api/reminders/pause/route.ts:67:export async function POST(request: NextRequest) {
app/api/invoices/[id]/pay/route.ts:33:export async function POST(
app/api/seo/verify/route.ts:5:export async function GET(req: Request) {
app/api/reminders/resume/route.ts:64:export async function POST(request: NextRequest) {
app/api/settings/company-profile/route.ts:15:export async function GET() {
app/api/settings/company-profile/route.ts:47:export async function POST(request: NextRequest) {
app/api/settings/smtp/route.ts:16:export async function GET() {
app/api/settings/smtp/route.ts:60:export async function POST(request: NextRequest) {
app/api/invoices/[id]/send/route.ts:35:export async function POST(
app/api/settings/smtp/test/route.ts:31:export async function POST(request: Request) {
app/api/invoices/[id]/pdf/route.ts:115:export async function GET(
```

```bash
rg -n "parse(JsonBody|Query|RouteParams)" app/api -S
```

```bash
app/api/stripe/checkout/route.ts:23:  parseJsonBody,
app/api/stripe/checkout/route.ts:24:  parseQuery,
app/api/stripe/checkout/route.ts:75:  const parsedQuery = parseQuery(checkoutQuerySchema, url);
app/api/stripe/checkout/route.ts:82:    const parsedBody = await parseJsonBody(req, checkoutBodySchema);
app/api/invoices/[id]/send/route.ts:14:  parseRouteParams,
app/api/invoices/[id]/send/route.ts:55:  const parsedParams = parseRouteParams(routeUuidParamsSchema, rawParams);
app/api/invoices/[id]/pdf/route.ts:9:  parseRouteParams,
app/api/invoices/[id]/pdf/route.ts:135:  const parsedParams = parseRouteParams(routeUuidParamsSchema, rawParams);
app/api/invoices/[id]/pay/route.ts:6:  parseRouteParams,
app/api/invoices/[id]/pay/route.ts:53:  const parsedParams = parseRouteParams(routeUuidParamsSchema, rawParams);
app/api/account/resend-verification/route.ts:6:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/account/resend-verification/route.ts:41:    const parsedBody = await parseJsonBody(request, resendVerificationSchema);
app/api/settings/smtp/test/route.ts:17:import { enforceRateLimit, parseJsonBody } from '@/app/lib/security/api-guard';
app/api/settings/smtp/test/route.ts:50:    const parsedBody = await parseJsonBody(request, smtpTestBodySchema);
app/api/dashboard/refund-requests/[id]/approve/route.ts:18:  parseRouteParams,
app/api/dashboard/refund-requests/[id]/approve/route.ts:114:  const parsedParams = parseRouteParams(routeUuidParamsSchema, rawParams);
app/api/public/invoices/[token]/refund-request/route.ts:15:  parseJsonBody,
app/api/public/invoices/[token]/refund-request/route.ts:16:  parseRouteParams,
app/api/public/invoices/[token]/refund-request/route.ts:64:  const parsedParams = parseRouteParams(routeTokenParamsSchema, rawParams);
app/api/public/invoices/[token]/refund-request/route.ts:82:  const parsedBody = await parseJsonBody(request, refundRequestBodySchema);
app/api/public/invoices/[token]/pdf/route.ts:11:  parseRouteParams,
app/api/public/invoices/[token]/pdf/route.ts:94:  const parsedParams = parseRouteParams(routeTokenParamsSchema, rawParams);
app/api/public/invoices/[token]/pay/route.ts:23:  parseRouteParams,
app/api/public/invoices/[token]/pay/route.ts:50:  const parsedParams = parseRouteParams(routeTokenParamsSchema, rawParams);
```

---

### Per-route coverage (BEFORE)

Legend:

- **Rate limit**: uses `enforceRateLimit` with a named bucket (Postgres-backed).
- **Strict schemas**: uses Zod `.strict()` on at least one route-specific schema in this file.
- **Parse helpers**: uses `parseRouteParams`, `parseQuery`, or `parseJsonBody` from `app/lib/security/api-guard.ts`.
- **Error shape**:
  - **standardized**: for validation / RL errors, returns `{ ok: false, code, message, issues? }` from shared helpers.
  - **ad-hoc**: hand-built `NextResponse.json` or default error without consistent `code` / `ok` contract.

| Route file | Methods (from scan) | Rate limit | Strict schemas | Parse helpers | Error shape (high level) |
| --- | --- | --- | --- | --- | --- |
| `app/api/account/auth-connections/route.ts` | GET, DELETE | no | no | no | ad-hoc |
| `app/api/account/change-password/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/account/delete/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/account/link-provider/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/account/resend-verification/route.ts` | POST | **yes** (`resend_verification`) | **yes** | **yes** (`parseJsonBody`) | RL + body validation use standardized helper errors; other errors ad-hoc |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth handler | no (handled by NextAuth) | no | no | NextAuth default error handling |
| `app/api/billing/dismiss-banner/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/billing/recovery-email/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/customers/export/route.ts` | GET | **yes** (`customers_export`) | no | no | RL has standardized error; others ad-hoc |
| `app/api/dashboard/refund-requests/[id]/approve/route.ts` | POST | **yes** (`refund_approve`) | no | **yes** (`parseRouteParams`) | Route param validation standardized; other errors ad-hoc |
| `app/api/dashboard/refund-requests/[id]/decline/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/dashboard/refund-requests/route.ts` | GET | no | no | no | ad-hoc |
| `app/api/feedback/route.ts` | GET, POST | no | no | no | ad-hoc |
| `app/api/health/route.ts` | GET | **yes** (`health`) | no | no | RL has standardized error; others ad-hoc |
| `app/api/invoices/[id]/pay/route.ts` | POST | **yes** (`invoice_pay`) | no | **yes** (`parseRouteParams`) | RL + route param validation standardized; others ad-hoc |
| `app/api/invoices/[id]/pdf/route.ts` | GET | **yes** (`invoice_pdf`) | no | **yes** (`parseRouteParams`) | RL + route param validation standardized; others ad-hoc |
| `app/api/invoices/[id]/send/route.ts` | POST | **yes** (`invoice_send`) | no | **yes** (`parseRouteParams`) | RL + route param validation standardized; others ad-hoc |
| `app/api/invoices/export/route.ts` | GET | **yes** (`invoice_export`) | no | no | RL has standardized error; others ad-hoc |
| `app/api/public/invoices/[token]/pay/route.ts` | POST | **yes** (`public_invoice_pay`) | no | **yes** (`parseRouteParams`) | RL + token param validation standardized; others ad-hoc |
| `app/api/public/invoices/[token]/pdf/route.ts` | GET | **yes** (`public_invoice_pdf`) | no | **yes** (`parseRouteParams`) | RL + token param validation standardized; others ad-hoc |
| `app/api/public/invoices/[token]/refund-request/route.ts` | POST | **yes** (`public_refund_request`) | **yes** | **yes** (`parseRouteParams`, `parseJsonBody`) | RL + params/query/body validation standardized for validation/RL errors |
| `app/api/reminders/fix-logs/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/reminders/pause/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/reminders/resume/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/reminders/run-manual/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/reminders/run/route.ts` | POST, GET | **yes** (`reminders_run_cron`, `reminders_run_manual`) | no | no | RL has standardized error; other logic mixed/ad-hoc |
| `app/api/seo/verify/route.ts` | GET | **yes** (`seo_verify`) | no | no | RL has standardized error; others ad-hoc |
| `app/api/settings/billing/self-check/route.ts` | GET, POST | no | no | no | ad-hoc |
| `app/api/settings/company-profile/route.ts` | GET, POST | no | no | no | ad-hoc |
| `app/api/settings/documents/logo/route.ts` | POST, DELETE | no | no | no | ad-hoc |
| `app/api/settings/documents/route.ts` | GET, POST | no | no | no | ad-hoc |
| `app/api/settings/documents/sample-pdf/route.ts` | GET | no | no | no | ad-hoc |
| `app/api/settings/launch-check/ping/route.ts` | GET | no | no | no | ad-hoc |
| `app/api/settings/launch-check/run/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/settings/reminders/runs/route.ts` | GET | no | no | no | ad-hoc |
| `app/api/settings/smoke-check/ping/route.ts` | GET | no | no | no | ad-hoc |
| `app/api/settings/smoke-check/run/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/settings/smoke-check/test-email/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/settings/smtp/route.ts` | GET, POST | no | no | no | ad-hoc |
| `app/api/settings/smtp/test/route.ts` | POST | **yes** (`smtp_test`) | **yes** | **yes** (`parseJsonBody`) | RL + body validation standardized; others ad-hoc |
| `app/api/settings/team/active/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/settings/team/invite/[token]/accept/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/settings/team/invite/route.ts` | POST | **yes** (`team_invite`) | **yes** | no explicit parse helpers (schema likely inline) | RL has standardized error; validation errors ad-hoc / inline |
| `app/api/settings/team/members/[userId]/route.ts` | DELETE, PATCH | no | no | no | ad-hoc |
| `app/api/settings/unsubscribe/list/route.ts` | GET | no | no | no | ad-hoc |
| `app/api/settings/unsubscribe/resubscribe/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/settings/unsubscribe/route.ts` | GET, POST | no | no | no | ad-hoc |
| `app/api/settings/usage/route.ts` | GET | no | no | no | ad-hoc |
| `app/api/settings/usage/verify/route.ts` | GET | no | no | no | ad-hoc |
| `app/api/stripe/checkout/route.ts` | POST | **yes** (`stripe_checkout`) | **yes** | **yes** (`parseQuery`, `parseJsonBody`) | RL + query/body validation standardized; others ad-hoc |
| `app/api/stripe/connect-login/route.ts` | GET | no | no | no | ad-hoc |
| `app/api/stripe/connect-resync/route.ts` | POST | no | no | no | ad-hoc |
| `app/api/stripe/connect/onboard/route.ts` | POST | **yes** (`stripe_connect_onboard`) | no | no | RL has standardized error; others ad-hoc |
| `app/api/stripe/portal/route.ts` | POST | **yes** (`stripe_portal`) | no | no | RL has standardized error; others ad-hoc |
| `app/api/stripe/reconcile/route.ts` | POST | **yes** (`stripe_reconcile`) | **yes** | no parse helpers (schema inline) | RL + some body validation standardized; others ad-hoc |
| `app/api/stripe/webhook/route.ts` | POST | **yes** (`stripe_webhook`) | no | no | RL has standardized error; webhook signature/logic errors ad-hoc |

---

### Gaps vs P1 requirements (summary BEFORE)

- **Rate limiting coverage**
  - Present on a subset of routes (Stripe flows, invoices export/pay/pdf/send, refund approval, some public invoice flows, `account/resend-verification`, `settings/smtp/test`, `customers/export`, `health`, `seo/verify`, `reminders/run`).
  - **Missing** on many public/exposed or expensive/mutation endpoints, including: most account mutations, billing mutations, reminders helpers (`fix-logs`, `pause`, `resume`, `run-manual`), unsubscribe endpoints, feedback, team membership mutations, smoke/launch checks, document upload endpoints, and most settings endpoints.

- **Strict schema validation & sanitization**
  - Only a **small set** of routes use Zod `.strict()` in `app/api` today:
    - `stripe/checkout`, `stripe/reconcile`, `public/invoices/[token]/refund-request`, `account/resend-verification`, `settings/smtp/test`, `settings/team/invite`.
  - Only a subset of routes use centralized parse helpers: route params for invoices/dashboard/public invoice flows, plus JSON body on a few routes.
  - Most routes still:
    - Parse `req.json()` or `req.url` manually (or not at all).
    - Do **not** enforce `.strict()` on body/query/params.
    - Allow unknown keys by default and lack consistent normalization (email, free text, ids).

- **CSRF / origin**
  - `middleware.ts` enforces same-origin for **all `/api/**` mutation methods** when:
    - Method ∈ {POST, PUT, PATCH, DELETE},
    - Path is **not** in `CSRF_EXEMPT_API_EXACT_PATHS` and does **not** start with `/api/public/` or `/api/auth/`,
    - Request has cookies, and either Origin or Referer does not match expected origin.
  - Current **exact / prefix exemptions**:
    - Exact path: `/api/stripe/webhook`.
    - Prefixes: `/api/public/`, `/api/auth/`.
  - Cron/token-based requests without cookies are exempted via `hasCronTokenHeader`, but only when **no cookie header is present**.
  - `/api/reminders/run` is **not** globally exempted by prefix; any exemption must be exact-path based and is currently not in the exact-set.

- **Error contract**
  - Central helpers (`enforceRateLimit`, `parseRouteParams`, `parseQuery`, `parseJsonBody`) already emit standardized error shapes:
    - `{ ok: false, code: 'RATE_LIMITED' | 'INVALID_ROUTE_PARAMS' | 'INVALID_QUERY' | 'INVALID_REQUEST_BODY' | 'INVALID_JSON', message, issues? }`.
  - However, many routes:
    - Return ad-hoc JSON without `ok` / `code`, or with varied naming (`error`, `message`, etc.).
    - Rely on thrown errors or Next.js defaults for some failure paths.
  - Result: **non-uniform error contract** across the majority of API surface today.

This document captures the **baseline** before implementing the P1 security wave. A corresponding **AFTER** section will be appended once the hardening work (rate limiting, strict schemas, CSRF/origin refinements, and error normalization) has been applied.

