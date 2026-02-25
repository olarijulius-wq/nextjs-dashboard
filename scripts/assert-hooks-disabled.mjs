#!/usr/bin/env node

import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const jitiBin = path.join(cwd, 'node_modules', '.bin', 'jiti');
const alias = JSON.stringify({
  '@': cwd,
  'server-only': path.join(cwd, 'tests', 'shims', 'server-only.ts'),
});

const result = spawnSync(jitiBin, ['tests/assert-hooks-disabled.ts'], {
  stdio: 'inherit',
  cwd,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    LATELLESS_TEST_MODE: '1',
    JITI_ALIAS: alias,
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
