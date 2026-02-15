#!/usr/bin/env bash
set -euo pipefail

node --experimental-strip-types <<'NODE'
import assert from 'node:assert/strict';
import { allowedPayStatuses, canPayInvoiceStatus } from './app/lib/invoice-status.ts';

assert.deepEqual(allowedPayStatuses, ['pending', 'overdue', 'failed']);
assert.equal(canPayInvoiceStatus('pending'), true);
assert.equal(canPayInvoiceStatus('overdue'), true);
assert.equal(canPayInvoiceStatus('failed'), true);
assert.equal(canPayInvoiceStatus('paid'), false);
assert.equal(canPayInvoiceStatus('refunded'), false);
assert.equal(canPayInvoiceStatus('disputed'), false);
assert.equal(canPayInvoiceStatus('lost'), false);
assert.equal(canPayInvoiceStatus('void'), false);
assert.equal(canPayInvoiceStatus('cancelled'), false);
assert.equal(canPayInvoiceStatus('canceled'), false);
NODE

echo "[invoice-status] all checks passed"
