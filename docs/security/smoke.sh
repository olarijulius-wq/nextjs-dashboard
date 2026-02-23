#!/usr/bin/env sh
set -eu

BASE="${BASE:-http://localhost:3000}"
SESSION="${SESSION:-next-auth.session-token=REPLACE_ME}"

cat <<'TXT'
Security smoke checks (requires an authenticated session cookie).

Usage:
  BASE=http://localhost:3000 SESSION='next-auth.session-token=...' sh docs/security/smoke.sh

Notes:
- SESSION must be a valid cookie pair: <cookie_name>=<cookie_value>
- These checks hit authenticated API routes.
TXT

run_check() {
  name="$1"
  cmd="$2"
  expected_status="$3"
  expect_body="$4"
  printf '\n[%s]\n' "$name"
  printf 'cmd: %s\n' "$cmd"
  out="$(sh -c "$cmd")"
  printf '%s\n' "$out"
  if ! printf '%s\n' "$out" | grep -Eq "^HTTP/[0-9.]+ $expected_status"; then
    printf 'result: FAIL (expected HTTP %s)\n' "$expected_status"
    return 1
  fi
  if ! printf '%s' "$out" | grep -q "$expect_body"; then
    printf 'result: FAIL (missing %s)\n' "$expect_body"
    return 1
  fi
  printf 'result: PASS (HTTP %s + %s)\n' "$expected_status" "$expect_body"
}

run_check \
  "400 INVALID_REQUEST_BODY on strict JSON" \
  "curl -sS -i -X POST \"$BASE/api/stripe/reconcile\" -H \"Cookie: $SESSION\" -H \"Origin: $BASE\" -H 'Content-Type: application/json' --data '{\"unknown\":true}'" \
  "400" \
  "INVALID_REQUEST_BODY"

run_check \
  "400 INVALID_QUERY on strict query" \
  "curl -sS -i -X POST \"$BASE/api/stripe/connect/onboard?reconnect=1&unknown=1\" -H \"Cookie: $SESSION\" -H \"Origin: $BASE\"" \
  "400" \
  "INVALID_QUERY"

run_check \
  "403 CSRF_ORIGIN_MISMATCH" \
  "curl -sS -i -X POST \"$BASE/api/stripe/portal\" -H \"Cookie: $SESSION\" -H 'Origin: https://evil.example'" \
  "403" \
  "CSRF_ORIGIN_MISMATCH"

run_check \
  "405 GET /api/reminders/run" \
  "curl -sS -i \"$BASE/api/reminders/run\"" \
  "405" \
  "Method Not Allowed"

printf '\n[429 RATE_LIMITED]\n'
printf 'Looping /api/stripe/connect/onboard to trigger rate limit...\n'
i=1
while [ "$i" -le 6 ]; do
  status_and_body="$(curl -sS -i -X POST "$BASE/api/stripe/connect/onboard?reconnect=1" -H "Cookie: $SESSION" -H "Origin: $BASE")"
  printf 'attempt %s\n' "$i"
  printf '%s\n' "$status_and_body"
  if printf '%s\n' "$status_and_body" | grep -Eq '^HTTP/[0-9.]+ 429' && printf '%s' "$status_and_body" | grep -q 'RATE_LIMITED'; then
    printf 'result: PASS (RATE_LIMITED)\n'
    exit 0
  fi
  i=$((i + 1))
done

printf 'result: FAIL (RATE_LIMITED not observed in 6 attempts)\n'
exit 1
