#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const cwd = process.cwd();
const jitiBin = path.join(cwd, 'node_modules', '.bin', 'jiti');
const alias = JSON.stringify({
  '@': cwd,
  'server-only': path.join(cwd, 'tests', 'shims', 'server-only.ts'),
});

const result = spawnSync(jitiBin, ['tests/isolation.test.ts'], {
  stdio: 'inherit',
  cwd,
  env: {
    ...process.env,
    JITI_ALIAS: alias,
    LATELLESS_TEST_MODE: process.env.LATELLESS_TEST_MODE || '1',
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
