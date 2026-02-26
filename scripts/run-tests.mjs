#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const alias = JSON.stringify({
  '@': cwd,
  'server-only': path.join(cwd, 'tests', 'shims', 'server-only.ts'),
});

const testDbUrl = process.env.POSTGRES_URL_TEST?.trim();
if (!testDbUrl) {
  console.error('Missing POSTGRES_URL_TEST. Set it before running pnpm test.');
  process.exit(1);
}

const result = spawnSync('pnpm', ['exec', 'jiti', 'tests/isolation.test.ts'], {
  stdio: 'inherit',
  cwd,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    JITI_ALIAS: alias,
    LATELLESS_TEST_MODE: '1',
    POSTGRES_URL_TEST: testDbUrl,
    POSTGRES_URL: testDbUrl,
    DATABASE_URL: testDbUrl,
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
