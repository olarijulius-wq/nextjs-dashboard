#!/usr/bin/env bash
set -euo pipefail

# Integration smoke test for refund approval idempotency when a charge was
# already refunded directly in Stripe.
#
# Required env vars:
# - APP_BASE_URL (example: http://localhost:3000)
# - COOKIE_HEADER (dashboard auth cookie header, example: "next-auth.session-token=...")
# - WORKSPACE_ID
# - INVOICE_ID (paid invoice)
# - REFUND_REQUEST_ID (pending request for INVOICE_ID)
# - STRIPE_ACCOUNT_ID (connected account id)
# - STRIPE_CHARGE_ID (charge behind the invoice payment intent)
# - POSTGRES_URL
#
# Requires Stripe CLI authenticated locally.

required_vars=(
  APP_BASE_URL
  COOKIE_HEADER
  WORKSPACE_ID
  INVOICE_ID
  REFUND_REQUEST_ID
  STRIPE_ACCOUNT_ID
  STRIPE_CHARGE_ID
  POSTGRES_URL
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "missing env var: $name" >&2
    exit 1
  fi
done

echo "[test] creating direct Stripe refund first (simulates Dashboard refund)"
stripe refunds create \
  --charge "$STRIPE_CHARGE_ID" \
  --stripe-account "$STRIPE_ACCOUNT_ID" \
  >/dev/null

echo "[test] approving refund request through API"
response="$(
  curl -sS \
    -X POST \
    -H "Cookie: $COOKIE_HEADER" \
    "$APP_BASE_URL/api/dashboard/refund-requests/$REFUND_REQUEST_ID/approve"
)"
echo "$response"

if ! grep -q '"ok":true' <<<"$response"; then
  echo "[test] expected ok=true response" >&2
  exit 1
fi

if ! grep -q '"alreadyRefunded":true' <<<"$response"; then
  echo "[test] expected alreadyRefunded=true response" >&2
  exit 1
fi

echo "[test] checking DB state"
req_status="$(
  psql "$POSTGRES_URL" -Atqc \
    "select status from public.refund_requests where id = '$REFUND_REQUEST_ID';"
)"
inv_status="$(
  psql "$POSTGRES_URL" -Atqc \
    "select status from public.invoices where id = '$INVOICE_ID';"
)"

if [[ "$req_status" != "approved" ]]; then
  echo "[test] expected refund request status=approved, got: $req_status" >&2
  exit 1
fi

if [[ "$inv_status" != "refunded" && "$inv_status" != "partially_refunded" ]]; then
  echo "[test] expected invoice status refunded/partially_refunded, got: $inv_status" >&2
  exit 1
fi

echo "[test] pass"
