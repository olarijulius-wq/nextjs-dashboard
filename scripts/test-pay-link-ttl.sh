#!/usr/bin/env bash
set -euo pipefail

echo "[pay-link] test: dev default TTL includes exp and verifies"
NODE_ENV=development PAY_LINK_SECRET=test-secret PAY_LINK_TTL_SECONDS= node --experimental-strip-types <<'NODE'
import assert from 'node:assert/strict';
import { generatePayToken, verifyPayToken } from './app/lib/pay-link.ts';

const token = generatePayToken('inv_dev');
const result = verifyPayToken(token);
assert.equal(result.ok, true);
if (result.ok) {
  assert.equal(typeof result.payload.iat, 'number');
  assert.equal(typeof result.payload.exp, 'number');
  assert.ok((result.payload.exp ?? 0) > (result.payload.iat ?? 0));
}
NODE

echo "[pay-link] test: production requires PAY_LINK_TTL_SECONDS"
if NODE_ENV=production PAY_LINK_SECRET=test-secret PAY_LINK_TTL_SECONDS= node --experimental-strip-types <<'NODE'
import './app/lib/pay-link.ts';
NODE
then
  echo "expected production import to fail when PAY_LINK_TTL_SECONDS is missing"
  exit 1
fi

echo "[pay-link] test: production rejects invalid PAY_LINK_TTL_SECONDS"
if NODE_ENV=production PAY_LINK_SECRET=test-secret PAY_LINK_TTL_SECONDS=invalid node --experimental-strip-types <<'NODE'
import './app/lib/pay-link.ts';
NODE
then
  echo "expected production import to fail when PAY_LINK_TTL_SECONDS is invalid"
  exit 1
fi

echo "[pay-link] all checks passed"
