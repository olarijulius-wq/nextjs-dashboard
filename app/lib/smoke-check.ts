import 'server-only';

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import Stripe from 'stripe';
import {
  ensureWorkspaceContextForCurrentUser,
  type WorkspaceContext,
} from '@/app/lib/workspaces';
import {
  getDiagnosticsEnabledState,
  getSmokeCheckAdminEmailDecision,
} from '@/app/lib/admin-gates';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';
import {
  SMTP_MIGRATION_REQUIRED_CODE,
  fetchWorkspaceEmailSettings,
  sendWorkspaceEmail,
} from '@/app/lib/smtp-settings';
import {
  buildResendFromHeader,
  getEffectiveMailConfig,
  isValidMailFromHeader,
} from '@/app/lib/email';
import { getMigrationReport } from '@/app/lib/migration-tracker';
import { resolveSiteUrlDebug } from '@/app/lib/seo/site-url';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });
const TEST_EMAIL_WINDOW_MS = 10 * 60 * 1000;

type CheckStatus = 'pass' | 'warn' | 'fail' | 'manual';

export type SmokeCheckResult = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fixHint: string;
  actionLabel?: string;
  actionUrl?: string;
};

export type SmokeCheckPayload = {
  kind: 'smoke_run';
  ok: boolean;
  env: {
    nodeEnv: string | null;
    vercelEnv: string | null;
    siteUrl: string;
  };
  checks: SmokeCheckResult[];
  raw: Record<string, unknown>;
};

export type SmokeCheckEmailPreview = {
  provider: 'resend' | 'smtp';
  effectiveFromHeader: string;
  fromHeaderValid: boolean;
  retryAfterSec: number | null;
};

type SmokeCheckRunRow = {
  ran_at: Date;
  actor_email: string;
  workspace_id: string | null;
  env: {
    node_env: string | null;
    vercel_env: string | null;
    site_url: string;
  };
  payload: SmokeCheckPayload;
  ok: boolean;
};

export type SmokeCheckRunRecord = {
  ranAt: string;
  actorEmail: string;
  workspaceId: string | null;
  env: {
    node_env: string | null;
    vercel_env: string | null;
    site_url: string;
  };
  payload: SmokeCheckPayload;
  ok: boolean;
};

type TestEmailActionPayload = {
  kind: 'test_email';
  workspaceId: string;
  actorEmail: string;
  recipient: string;
  sentAt: string;
  success: boolean;
  rateLimited: boolean;
  retryAfterSec?: number | null;
  provider: 'resend' | 'smtp' | null;
  messageId: string | null;
  error: string | null;
};

type StripeErrorClassification =
  | 'invalid_api_key'
  | 'revoked'
  | 'network'
  | 'permissions'
  | 'unknown';

type StripeConnectMode = 'oauth' | 'account_links' | 'unknown';

type StripeConnectDetection = {
  mode: StripeConnectMode;
  source: 'env' | 'code_scan';
  oauthIndicators: string[];
  accountLinksIndicators: string[];
  scannedFilesCount: number;
};

function normalizeEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase();
}

function resolveExpectedStripeMode(nodeEnv: string | null, vercelEnv: string | null): 'live' | 'test' {
  return nodeEnv === 'production' || vercelEnv === 'production' ? 'live' : 'test';
}

function suffixLast4(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(-4);
}

function checkPrefix(value: string | null | undefined, prefix: string) {
  if (!value) return false;
  return value.trim().startsWith(prefix);
}

function normalizeStripeConnectMode(value: string | null | undefined): StripeConnectMode | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'oauth') return 'oauth';
  if (normalized === 'account_links' || normalized === 'account-links') return 'account_links';
  return null;
}

function listSourceFiles(root: string): string[] {
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      const fullPath = resolve(root, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        out.push(...listSourceFiles(fullPath));
        continue;
      }
      if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        out.push(fullPath);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function detectStripeConnectModeDetails(): StripeConnectDetection {
  const explicitMode = normalizeStripeConnectMode(process.env.STRIPE_CONNECT_MODE);
  if (explicitMode) {
    return {
      mode: explicitMode,
      source: 'env',
      oauthIndicators: [],
      accountLinksIndicators: [],
      scannedFilesCount: 0,
    };
  }

  const scanRoots = [resolve(process.cwd(), 'app/api/stripe'), resolve(process.cwd(), 'app/lib')];
  const files = scanRoots.flatMap((root) => listSourceFiles(root));

  const oauthPatterns: Array<{ id: string; regex: RegExp }> = [
    { id: 'connect.stripe.com/oauth/authorize', regex: /connect\.stripe\.com\/oauth\/authorize/ },
    { id: 'stripe.oauth.token', regex: /stripe\.oauth\.token\s*\(/ },
    { id: 'oauth.token', regex: /\.oauth\.token\s*\(/ },
    { id: 'oauth callback code', regex: /searchParams\.get\(['"]code['"]\)/ },
    { id: 'authorization_code exchange', regex: /authorization_code/ },
  ];
  const accountLinksPatterns: Array<{ id: string; regex: RegExp }> = [
    { id: 'stripe.accountLinks.create', regex: /\.accountLinks\.create\s*\(/ },
    { id: 'stripe.accounts.create', regex: /\.accounts\.create\s*\(/ },
    { id: 'account_onboarding', regex: /account_onboarding/ },
    { id: 'stripe.accounts.createLoginLink', regex: /\.accounts\.createLoginLink\s*\(/ },
  ];

  const oauthIndicators = new Set<string>();
  const accountLinksIndicators = new Set<string>();

  for (const filePath of files) {
    if (/[/\\]smoke-check\.(ts|tsx|js|jsx)$/.test(filePath)) {
      continue;
    }
    let content = '';
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const pattern of oauthPatterns) {
      if (pattern.regex.test(content)) oauthIndicators.add(pattern.id);
    }
    for (const pattern of accountLinksPatterns) {
      if (pattern.regex.test(content)) accountLinksIndicators.add(pattern.id);
    }
  }

  const oauthHits = Array.from(oauthIndicators);
  const accountLinksHits = Array.from(accountLinksIndicators);
  const mode: StripeConnectMode =
    oauthHits.length > 0 ? 'oauth' : accountLinksHits.length > 0 ? 'account_links' : 'unknown';

  return {
    mode,
    source: 'code_scan',
    oauthIndicators: oauthHits,
    accountLinksIndicators: accountLinksHits,
    scannedFilesCount: files.length,
  };
}

export function detectStripeConnectMode(): StripeConnectMode {
  return detectStripeConnectModeDetails().mode;
}

function classifyStripeError(error: unknown): StripeErrorClassification {
  const stripeError = error as {
    code?: string;
    type?: string;
    statusCode?: number;
    message?: string;
  };
  const code = (stripeError?.code ?? '').toLowerCase();
  const message = (stripeError?.message ?? '').toLowerCase();

  if (
    code === 'api_key_expired' ||
    code === 'invalid_api_key' ||
    message.includes('invalid api key') ||
    message.includes('no api key provided')
  ) {
    return 'invalid_api_key';
  }
  if (message.includes('revoked') || message.includes('expired key')) {
    return 'revoked';
  }
  if (
    stripeError?.type === 'StripePermissionError' ||
    stripeError?.statusCode === 403 ||
    message.includes('does not have access')
  ) {
    return 'permissions';
  }
  if (
    code === 'ecconnreset' ||
    code === 'etimedout' ||
    code === 'enotfound' ||
    message.includes('network') ||
    message.includes('timed out') ||
    message.includes('failed to fetch')
  ) {
    return 'network';
  }
  return 'unknown';
}

function summarizeOk(checks: SmokeCheckResult[]) {
  return checks.every((check) => check.status !== 'fail');
}

async function safeFetch(url: string) {
  try {
    return await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
    });
  } catch {
    return null;
  }
}

function resolveHealthUrlForChecks(input: {
  nodeEnv: string | null;
  resolvedSiteUrl: URL;
}): { healthUrlResolved: string; healthUrlReason: 'dev_http_override' | 'resolver' } {
  const healthUrl = new URL('/api/health', input.resolvedSiteUrl);
  const devLocalHost =
    input.nodeEnv === 'development' &&
    (healthUrl.hostname === 'localhost' || healthUrl.hostname === '127.0.0.1');
  if (devLocalHost) {
    healthUrl.protocol = 'http:';
    return {
      healthUrlResolved: healthUrl.toString(),
      healthUrlReason: 'dev_http_override',
    };
  }
  return {
    healthUrlResolved: healthUrl.toString(),
    healthUrlReason: 'resolver',
  };
}

function resolveSiteUrlForSmokeChecks(input: {
  nodeEnv: string | null;
  resolvedSiteUrl: URL;
}): URL {
  const siteUrl = new URL(input.resolvedSiteUrl.toString());
  const devLocalHost =
    input.nodeEnv === 'development' &&
    (siteUrl.hostname === 'localhost' || siteUrl.hostname === '127.0.0.1');
  if (devLocalHost) {
    siteUrl.protocol = 'http:';
  }
  return siteUrl;
}

function getRetryAfterSecondsFromTestEmail(testEmail: TestEmailActionPayload | undefined): number | null {
  if (!testEmail) return null;
  if (typeof testEmail.retryAfterSec === 'number' && Number.isFinite(testEmail.retryAfterSec)) {
    return Math.max(1, Math.ceil(testEmail.retryAfterSec));
  }
  const match = (testEmail.error ?? '').match(/(\d+)s/);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export type DiagnosticsAccessDecision = {
  allowed: boolean;
  reason: string;
  context: WorkspaceContext | null;
};

function isWorkspaceOwnerOrAdmin(role: WorkspaceContext['userRole']) {
  return role === 'owner' || role === 'admin';
}

export async function getSmokeCheckAccessDecision(): Promise<DiagnosticsAccessDecision> {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    if (!isInternalAdmin(context.userEmail)) {
      return {
        allowed: false,
        reason: `smoke-check: ${context.userEmail} is not internal admin`,
        context: null,
      };
    }
    if (!isWorkspaceOwnerOrAdmin(context.userRole)) {
      return {
        allowed: false,
        reason: `smoke-check: workspace role ${context.userRole} is not owner/admin`,
        context: null,
      };
    }
    const allowlistDecision = getSmokeCheckAdminEmailDecision(context.userEmail);
    if (!allowlistDecision.allowed) {
      return {
        allowed: false,
        reason: allowlistDecision.reason,
        context: null,
      };
    }
    return {
      allowed: true,
      reason: 'smoke-check: allowed',
      context,
    };
  } catch {
    return {
      allowed: false,
      reason: 'smoke-check: no session or workspace context unavailable',
      context: null,
    };
  }
}

export async function getSmokeCheckAccessContext(): Promise<WorkspaceContext | null> {
  const decision = await getSmokeCheckAccessDecision();
  return decision.allowed ? decision.context : null;
}

async function persistSmokeCheckRow(input: {
  actorEmail: string;
  workspaceId: string | null;
  env: {
    node_env: string | null;
    vercel_env: string | null;
    site_url: string;
  };
  payload: Record<string, unknown>;
  ok: boolean;
}) {
  try {
    await sql`
      insert into public.smoke_checks (actor_email, workspace_id, env, payload, ok)
      values (
        ${normalizeEmail(input.actorEmail)},
        ${input.workspaceId},
        ${sql.json(input.env as unknown as postgres.JSONValue)},
        ${sql.json(input.payload as unknown as postgres.JSONValue)},
        ${input.ok}
      )
    `;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '42P01'
    ) {
      return;
    }
    throw error;
  }
}

export async function getLatestSmokeCheckRun(): Promise<SmokeCheckRunRecord | null> {
  try {
    const [row] = await sql<SmokeCheckRunRow[]>`
      select ran_at, actor_email, workspace_id, env, payload, ok
      from public.smoke_checks
      where payload->>'kind' = 'smoke_run'
      order by ran_at desc
      limit 1
    `;
    if (!row) return null;

    return {
      ranAt: row.ran_at.toISOString(),
      actorEmail: row.actor_email,
      workspaceId: row.workspace_id,
      env: row.env,
      payload: row.payload,
      ok: row.ok,
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '42P01'
    ) {
      return null;
    }
    throw error;
  }
}

async function getLatestTestEmailAction(input: {
  workspaceId: string;
  actorEmail: string;
}): Promise<{ ranAt: string; payload: TestEmailActionPayload } | null> {
  try {
    const [row] = await sql<{
      ran_at: Date;
      payload: TestEmailActionPayload;
    }[]>`
      select ran_at, payload
      from public.smoke_checks
      where workspace_id = ${input.workspaceId}
        and actor_email = ${normalizeEmail(input.actorEmail)}
        and payload->>'kind' = 'test_email'
      order by ran_at desc
      limit 1
    `;
    if (!row) return null;
    return {
      ranAt: row.ran_at.toISOString(),
      payload: row.payload,
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '42P01'
    ) {
      return null;
    }
    throw error;
  }
}

async function checkStripeConfiguration(nodeEnv: string | null, vercelEnv: string | null): Promise<{
  check: SmokeCheckResult;
  raw: Record<string, unknown>;
  expectedMode: 'live' | 'test';
}> {
  const expectedMode = resolveExpectedStripeMode(nodeEnv, vercelEnv);
  const secretKey = process.env.STRIPE_SECRET_KEY ?? null;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? null;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? null;
  const connectClientId = process.env.STRIPE_CONNECT_CLIENT_ID ?? null;
  const connectDetection = detectStripeConnectModeDetails();
  const connectClientIdRequired = connectDetection.mode === 'oauth';
  const requiredSecretPrefix = expectedMode === 'live' ? 'sk_live_' : 'sk_test_';
  const requiredPublicPrefix = expectedMode === 'live' ? 'pk_live_' : 'pk_test_';

  const failures: string[] = [];
  const warnings: string[] = [];

  if (!checkPrefix(secretKey, requiredSecretPrefix)) {
    failures.push(
      `STRIPE_SECRET_KEY must start with ${requiredSecretPrefix} for ${expectedMode} mode.`,
    );
  }
  if (!checkPrefix(webhookSecret, 'whsec_')) {
    failures.push('STRIPE_WEBHOOK_SECRET must start with whsec_.');
  }
  if (connectClientIdRequired && !connectClientId?.trim()) {
    failures.push('STRIPE_CONNECT_CLIENT_ID is required when Stripe Connect is enabled.');
  }
  if (connectDetection.mode === 'unknown') {
    warnings.push(
      'Stripe Connect mode could not be detected. Set STRIPE_CONNECT_MODE=oauth|account_links for deterministic checks.',
    );
  }
  if (publishableKey) {
    if (!checkPrefix(publishableKey, requiredPublicPrefix)) {
      failures.push(
        `STRIPE_PUBLISHABLE_KEY must start with ${requiredPublicPrefix} for ${expectedMode} mode.`,
      );
    }
  } else {
    warnings.push('STRIPE_PUBLISHABLE_KEY is not set.');
  }

  const status: CheckStatus =
    failures.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';

  const detail =
    failures.length > 0
      ? failures.join(' ')
      : warnings.length > 0
        ? `Config warnings: ${warnings.join(' ')}`
        : connectDetection.mode === 'account_links'
          ? `OAuth not used; Client ID not required. Stripe env prefixes look correct for ${expectedMode} mode.`
          : connectDetection.mode === 'oauth'
            ? `OAuth mode detected; Stripe env prefixes look correct for ${expectedMode} mode.`
        : `Stripe env prefixes look correct for ${expectedMode} mode.`;

  return {
    check: {
      id: 'stripe-config-sanity',
      title: 'Stripe live/test configuration sanity',
      status,
      detail,
      fixHint:
        failures[0] ??
        'Set Stripe keys in Vercel Project Settings -> Environment Variables and redeploy.',
    },
    raw: {
      modeDetected: expectedMode,
      connectModeDetected: connectDetection.mode,
      connectClientIdRequired,
      connectModeSource: connectDetection.source,
      connectModeIndicators: {
        oauth: connectDetection.oauthIndicators,
        accountLinks: connectDetection.accountLinksIndicators,
      },
      connectModeScan: {
        scannedFilesCount: connectDetection.scannedFilesCount,
      },
      keysPresent: {
        stripeSecretKey: Boolean(secretKey),
        stripeWebhookSecret: Boolean(webhookSecret),
        stripePublishableKey: Boolean(publishableKey),
        stripeConnectClientId: Boolean(connectClientId),
      },
      suffixesLast4: {
        stripeSecretKey: suffixLast4(secretKey),
        stripeWebhookSecret: suffixLast4(webhookSecret),
        stripePublishableKey: suffixLast4(publishableKey),
        stripeConnectClientId: suffixLast4(connectClientId),
      },
      warnings,
      requiredSecretPrefix,
      requiredPublicPrefix,
    },
    expectedMode,
  };
}

async function checkStripeApiReachability(expectedMode: 'live' | 'test'): Promise<{
  check: SmokeCheckResult;
  raw: Record<string, unknown>;
}> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!secretKey) {
    return {
      check: {
        id: 'stripe-api-read',
        title: 'Stripe API reachability + account mode',
        status: 'fail',
        detail: 'Stripe API read check failed: STRIPE_SECRET_KEY is missing.',
        fixHint: 'Set STRIPE_SECRET_KEY and redeploy.',
      },
      raw: {
        classification: 'invalid_api_key',
        message: 'STRIPE_SECRET_KEY missing',
      },
    };
  }

  try {
    const stripe = new Stripe(secretKey);
    const balance = await stripe.balance.retrieve();
    const livemode = Boolean(balance.livemode);
    const expectedLivemode = expectedMode === 'live';
    const mismatch = livemode !== expectedLivemode;

    return {
      check: {
        id: 'stripe-api-read',
        title: 'Stripe API reachability + account mode',
        status: mismatch ? 'fail' : 'pass',
        detail: mismatch
          ? `Stripe account livemode=${livemode} does not match expected ${expectedLivemode}.`
          : `Stripe API read succeeded; account livemode=${livemode}.`,
        fixHint: mismatch
          ? 'Use matching Stripe key mode for this environment and redeploy.'
          : 'None.',
      },
      raw: {
        object: balance.object,
        livemode,
        expectedLivemode,
      },
    };
  } catch (error) {
    const classification = classifyStripeError(error);
    const message = error instanceof Error ? error.message : 'Unknown Stripe API failure.';

    return {
      check: {
        id: 'stripe-api-read',
        title: 'Stripe API reachability + account mode',
        status: 'fail',
        detail: `Stripe API read failed (${classification}): ${message}`,
        fixHint:
          classification === 'invalid_api_key'
            ? 'Set a valid STRIPE_SECRET_KEY.'
            : classification === 'revoked'
              ? 'Rotate and redeploy STRIPE_SECRET_KEY (old key revoked/expired).'
              : classification === 'permissions'
                ? 'Check Stripe key permissions and account access.'
                : classification === 'network'
                  ? 'Check outbound network connectivity from runtime to api.stripe.com.'
                  : 'Inspect Stripe logs and runtime logs for the failure.',
      },
      raw: {
        classification,
        message,
      },
    };
  }
}

async function checkWebhookDedupeSafety(expectedMode: 'live' | 'test'): Promise<{
  check: SmokeCheckResult;
  manual: SmokeCheckResult;
  raw: Record<string, unknown>;
}> {
  const [exists] = await sql<{
    has_billing_events: boolean;
    has_webhook_events: boolean;
  }[]>`
    select
      to_regclass('public.billing_events') is not null as has_billing_events,
      to_regclass('public.stripe_webhook_events') is not null as has_webhook_events
  `;

  const table = exists?.has_billing_events
    ? 'billing_events'
    : exists?.has_webhook_events
      ? 'stripe_webhook_events'
      : null;
  const eventIdColumn = table === 'billing_events' ? 'stripe_event_id' : 'event_id';
  const timeColumn = table === 'billing_events' ? 'created_at' : 'received_at';

  const manualDetail =
    expectedMode === 'test'
      ? [
          'You are in test mode. Use Stripe CLI local workflow.',
          'A) Stripe CLI local test workflow:',
          '1) stripe listen --forward-to http://localhost:3000/api/stripe/webhook',
          '2) stripe trigger checkout.session.completed (or invoice.payment_succeeded)',
          '3) Expected: webhook endpoint returns HTTP 200, and replaying same event stays deduped.',
          'B) Stripe Dashboard workflow:',
          'Go to Webhook endpoints -> select endpoint -> Recent deliveries.',
          'Or Developers -> Events -> open event -> Deliveries -> Resend (only appears when deliveries exist).',
        ].join(' ')
      : [
          'You are in livemode. Dashboard deliveries appear only after real live events or after webhook endpoint setup.',
          'A) Stripe CLI local test workflow (for local validation):',
          '1) stripe listen --forward-to http://localhost:3000/api/stripe/webhook',
          '2) stripe trigger checkout.session.completed (or invoice.payment_succeeded)',
          '3) Expected: webhook endpoint returns HTTP 200.',
          'B) Stripe Dashboard workflow (live):',
          'Developers -> Webhooks -> select endpoint -> Recent deliveries.',
          'Resend appears only when at least one delivery exists for that endpoint.',
        ].join(' ');

  const manual: SmokeCheckResult = {
    id: 'stripe-webhook-replay-manual',
    title: 'Stripe webhook replay idempotency (manual)',
    status: 'manual',
    detail: manualDetail,
    fixHint:
      'Use the workflow that matches your mode; verify only one DB row exists per Stripe event id.',
    actionLabel: expectedMode === 'test' ? 'Open Stripe CLI docs' : 'Open Stripe events',
    actionUrl:
      expectedMode === 'test'
        ? 'https://docs.stripe.com/stripe-cli'
        : 'https://dashboard.stripe.com/events',
  };

  if (!table) {
    return {
      check: {
        id: 'webhook-dedupe',
        title: 'Webhook ledger + unique dedupe safety',
        status: 'fail',
        detail: 'No webhook ledger table found (expected billing_events or stripe_webhook_events).',
        fixHint: 'Create a webhook ledger table with unique event id index for idempotency.',
      },
      manual,
      raw: {
        hasBillingEvents: Boolean(exists?.has_billing_events),
        hasStripeWebhookEvents: Boolean(exists?.has_webhook_events),
      },
    };
  }

  const indexes = await sql<{ indexname: string; indexdef: string }[]>`
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename = ${table}
  `;

  const uniqueIndex = indexes.find((idx) => {
    const def = idx.indexdef.toLowerCase();
    if (!def.includes('unique')) return false;
    if (table === 'billing_events') {
      return def.includes('(stripe_event_id)');
    }
    return def.includes('(event_id)');
  });

  const duplicateRows = await sql.unsafe<{ event_id: string; count: number }[]>(
    `
      select event_id, count(*)::int as count
      from (
        select ${eventIdColumn} as event_id
        from public.${table}
        where ${eventIdColumn} is not null
        order by ${timeColumn} desc
        limit 50
      ) recent
      group by event_id
      having count(*) > 1
      order by count(*) desc, event_id asc
    `,
  );

  const duplicatesCount = duplicateRows.length;
  const failures: string[] = [];
  if (!uniqueIndex) failures.push(`Unique dedupe index missing on ${table}.${eventIdColumn}.`);
  if (duplicatesCount > 0) failures.push(`Found ${duplicatesCount} duplicate event ids in last 50 rows.`);

  return {
    check: {
      id: 'webhook-dedupe',
      title: 'Webhook ledger + unique dedupe safety',
      status: failures.length > 0 ? 'fail' : 'pass',
      detail:
        failures.length > 0
          ? failures.join(' ')
          : `${table} has unique event id dedupe and no duplicates in last 50 rows.`,
      fixHint:
        failures[0] ??
        `Keep unique index on ${table}.${eventIdColumn} and guard replays with idempotent handling.`,
    },
    manual,
    raw: {
      table,
      eventIdColumn,
      uniqueIndex: uniqueIndex?.indexname ?? null,
      indexes: indexes.map((idx) => idx.indexname),
      duplicatesCount,
      duplicateEventIds: duplicateRows.map((row) => row.event_id),
    },
  };
}

async function checkEmailPrimitives(input: {
  workspaceId: string;
  actorEmail: string;
  nodeEnv: string | null;
  vercelEnv: string | null;
}): Promise<{
  check: SmokeCheckResult;
  manualChecks: SmokeCheckResult[];
  raw: Record<string, unknown>;
}> {
  const defaultManualChecks: SmokeCheckResult[] = [
    {
      id: 'email-spf-manual',
      title: 'SPF record check (manual)',
      status: 'manual',
      detail: 'Confirm your sender domain has a valid SPF TXT record authorizing your mail provider.',
      fixHint: 'Publish SPF TXT in your DNS host.',
      actionLabel: 'Resend DNS docs',
      actionUrl: 'https://resend.com/docs/knowledge-base/what-records-do-i-need-in-my-dns',
    },
    {
      id: 'email-dkim-manual',
      title: 'DKIM record check (manual)',
      status: 'manual',
      detail: 'Confirm DKIM selector records are published and signing is enabled in your email provider.',
      fixHint: 'Publish provider DKIM records exactly as given in dashboard.',
      actionLabel: 'SMTP settings',
      actionUrl: '/dashboard/settings/smtp',
    },
    {
      id: 'email-dmarc-manual',
      title: 'DMARC policy check (manual)',
      status: 'manual',
      detail: 'Confirm _dmarc TXT record exists with policy and reporting addresses.',
      fixHint: 'Publish DMARC TXT (start with p=none, tighten later).',
      actionLabel: 'Open help',
      actionUrl: '/help',
    },
  ];
  const inProduction = input.nodeEnv === 'production' || input.vercelEnv === 'production';

  try {
    const settings = await fetchWorkspaceEmailSettings(input.workspaceId);
    const latestTest = await getLatestTestEmailAction({
      workspaceId: input.workspaceId,
      actorEmail: input.actorEmail,
    });
    const latestRateLimited = latestTest?.payload?.rateLimited === true;
    const latestRetryAfterSec = getRetryAfterSecondsFromTestEmail(latestTest?.payload);
    const latestResendMessageId =
      latestTest?.payload?.success === true &&
      latestTest.payload.provider === 'resend' &&
      latestTest.payload.messageId
        ? latestTest.payload.messageId
        : null;
    const resendVerificationNote = latestResendMessageId
      ? ` Verified by last successful Resend test email + messageId (${latestResendMessageId}).`
      : '';
    const manualChecks = defaultManualChecks.map((check) => ({
      ...check,
      detail: `${check.detail}${resendVerificationNote}`,
    }));
    const config = getEffectiveMailConfig({
      workspaceSettings: {
        provider: settings.provider,
        fromName: settings.fromName,
        fromEmail: settings.fromEmail,
        replyTo: settings.replyTo,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpUsername: settings.smtpUsername,
        smtpPasswordPresent: settings.smtpPasswordPresent,
      },
    });
    const mailFromMissing = config.problems.includes('MAIL_FROM_EMAIL missing');
    const smtpProblem = config.problems.find((problem) => problem.startsWith('smtp'));
    const resendProblem = config.problems.includes('RESEND_API_KEY missing');
    const effectiveFromHeader = buildResendFromHeader(config.fromEmail);
    const fromHeaderValid = isValidMailFromHeader(effectiveFromHeader);
    if (!fromHeaderValid) {
      config.problems.push('MAIL_FROM header invalid');
    }
    const failInProd = inProduction && (mailFromMissing || smtpProblem || resendProblem);
    const warn = !failInProd && (config.problems.length > 0 || latestRateLimited || !fromHeaderValid);

    const detailParts = [
      `Provider: ${config.provider}.`,
      `Effective from header: ${effectiveFromHeader}.`,
      fromHeaderValid ? 'From header format is valid.' : 'From header format is invalid.',
      config.problems.length > 0 ? `Missing: ${config.problems.join(', ')}.` : 'Provider settings look sane.',
      'Verify domain in Resend dashboard; publish SPF/DKIM/DMARC in DNS; then run test email.',
    ];

    if (latestTest?.payload?.sentAt) {
      detailParts.push(`Last test email attempt: ${latestTest.payload.sentAt}.`);
    }
    if (latestRateLimited) {
      detailParts.push(
        `Rate limited — retry in ${latestRetryAfterSec ?? 1}s.`,
      );
    }

    return {
      check: {
        id: 'email-primitives',
        title: 'Email deliverability primitives + safe test path',
        status: failInProd ? 'fail' : warn ? 'warn' : 'pass',
        detail: detailParts.join(' '),
        fixHint: config.problems[0]
          ? `Fix ${config.problems[0]} in Settings -> SMTP.`
          : 'Use "Send test email" to validate mailbox delivery safely.',
      },
      manualChecks,
      raw: {
        provider: config.provider,
        smtpHost: config.smtpHost ? 'set' : 'missing',
        smtpPort: config.smtpPort,
        smtpUsername: settings.smtpUsername ? 'set' : 'missing',
        smtpPasswordPresent: settings.smtpPasswordPresent,
        fromEmail: config.fromEmail ? 'set' : 'missing',
        resendApiKeyPresent: config.resendKeyPresent,
        effectiveFromHeader,
        fromHeaderValid,
        reminderFromEmailPresent: Boolean(process.env.REMINDER_FROM_EMAIL?.trim()),
        mailFromEmailPresent: Boolean(process.env.MAIL_FROM_EMAIL?.trim()),
        problems: config.problems,
        latestTestEmail: latestTest,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read email settings.';
    const missingMigration = message === SMTP_MIGRATION_REQUIRED_CODE;

    return {
      check: {
        id: 'email-primitives',
        title: 'Email deliverability primitives + safe test path',
        status: inProduction ? 'fail' : 'warn',
        detail: missingMigration
          ? 'SMTP schema migration is required before this check can validate settings.'
          : `Could not verify email settings: ${message}`,
        fixHint: missingMigration
          ? 'Run SMTP migrations (008 and 021) and retry.'
          : 'Open Settings -> SMTP and verify provider configuration.',
      },
      manualChecks: defaultManualChecks,
      raw: {
        error: message,
      },
    };
  }
}

function checkDevEnvSanity(input: {
  nodeEnv: string | null;
  siteUrl: URL;
}): { check: SmokeCheckResult; raw: Record<string, unknown> } {
  const isDevLocalHost =
    input.nodeEnv === 'development' &&
    (input.siteUrl.hostname === 'localhost' || input.siteUrl.hostname === '127.0.0.1');
  const expected = 'http://localhost:3000';
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  const matches = configured === expected;

  if (!isDevLocalHost) {
    return {
      check: {
        id: 'dev-env-sanity',
        title: 'Dev env sanity (localhost checkout URL)',
        status: 'pass',
        detail: 'Not applicable (non-development or non-localhost host).',
        fixHint: 'None.',
      },
      raw: {
        applicable: false,
        nodeEnv: input.nodeEnv,
        host: input.siteUrl.hostname,
        nextPublicAppUrl: configured || null,
      },
    };
  }

  return {
    check: {
      id: 'dev-env-sanity',
      title: 'Dev env sanity (localhost checkout URL)',
      status: matches ? 'pass' : 'warn',
      detail: matches
        ? 'NEXT_PUBLIC_APP_URL is correctly set to http://localhost:3000.'
        : `NEXT_PUBLIC_APP_URL is ${configured || '(empty)'}, expected http://localhost:3000.`,
      fixHint: matches
        ? 'None.'
        : 'Set NEXT_PUBLIC_APP_URL=http://localhost:3000 in local env, restart dev server, rerun smoke check.',
    },
    raw: {
      applicable: true,
      expected,
      configured: configured || null,
      host: input.siteUrl.hostname,
      protocol: input.siteUrl.protocol,
    },
  };
}

function checkProdEnvSanity(input: {
  nodeEnv: string | null;
  vercelEnv: string | null;
}): { check: SmokeCheckResult; raw: Record<string, unknown> } {
  const inProduction = input.nodeEnv === 'production';
  const appUrlRaw = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  const connectModeRaw = (process.env.STRIPE_CONNECT_MODE ?? '').trim();
  const sentryDsnPresent = Boolean((process.env.SENTRY_DSN ?? '').trim());
  const mailFromPresent = Boolean((process.env.MAIL_FROM_EMAIL ?? '').trim());

  if (!inProduction) {
    return {
      check: {
        id: 'prod-env-sanity',
        title: 'Prod env sanity (host/connect/sentry/mail)',
        status: 'pass',
        detail: 'Not applicable (NODE_ENV is not production).',
        fixHint: 'None.',
      },
      raw: {
        applicable: false,
        nodeEnv: input.nodeEnv,
        vercelEnv: input.vercelEnv,
      },
    };
  }

  let appUrlHost: string | null = null;
  try {
    if (appUrlRaw) {
      appUrlHost = new URL(appUrlRaw).hostname.toLowerCase();
    }
  } catch {
    appUrlHost = null;
  }

  const failures: string[] = [];
  const warnings: string[] = [];

  if (!appUrlRaw) {
    failures.push('NEXT_PUBLIC_APP_URL missing.');
  } else if (appUrlHost !== 'lateless.org') {
    failures.push(`NEXT_PUBLIC_APP_URL must resolve to lateless.org (current: ${appUrlRaw}).`);
  }

  if (!connectModeRaw) {
    failures.push('STRIPE_CONNECT_MODE must be set to account_links or oauth.');
  }

  if (!mailFromPresent) {
    failures.push('MAIL_FROM_EMAIL is required in production.');
  }

  if (!sentryDsnPresent) {
    warnings.push('SENTRY_DSN is not set.');
  }

  return {
    check: {
      id: 'prod-env-sanity',
      title: 'Prod env sanity (host/connect/sentry/mail)',
      status: failures.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass',
      detail:
        failures.length > 0
          ? failures.join(' ')
          : warnings.length > 0
            ? warnings.join(' ')
            : 'Production env sanity checks passed.',
      fixHint:
        failures.length > 0
          ? 'Set NEXT_PUBLIC_APP_URL=https://lateless.org, STRIPE_CONNECT_MODE=account_links|oauth, and MAIL_FROM_EMAIL in production env, then redeploy.'
          : warnings.length > 0
            ? 'Set SENTRY_DSN in production env for observability.'
            : 'None.',
    },
    raw: {
      applicable: true,
      appUrl: appUrlRaw || null,
      appUrlHost,
      stripeConnectMode: connectModeRaw || null,
      sentryDsnPresent,
      mailFromEmailPresent: mailFromPresent,
      nodeEnv: input.nodeEnv,
      vercelEnv: input.vercelEnv,
    },
  };
}

async function checkDbSchemaSanity(nodeEnv: string | null, vercelEnv: string | null): Promise<{
  check: SmokeCheckResult;
  manual: SmokeCheckResult;
  raw: Record<string, unknown>;
}> {
  const [row] = await sql<{
    has_invoices_created_at: boolean;
    has_invoice_email_logs: boolean;
    has_reminder_runs: boolean;
    has_job_locks: boolean;
    has_dunning_state: boolean;
    has_billing_events: boolean;
  }[]>`
    select
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'invoices'
          and column_name = 'created_at'
      ) as has_invoices_created_at,
      to_regclass('public.invoice_email_logs') is not null as has_invoice_email_logs,
      to_regclass('public.reminder_runs') is not null as has_reminder_runs,
      to_regclass('public.job_locks') is not null as has_job_locks,
      to_regclass('public.dunning_state') is not null as has_dunning_state,
      to_regclass('public.billing_events') is not null as has_billing_events
  `;

  const mustHaveMissing: string[] = [];
  if (!row?.has_invoices_created_at) mustHaveMissing.push('invoices.created_at');
  if (!row?.has_invoice_email_logs) mustHaveMissing.push('invoice_email_logs');
  if (!row?.has_reminder_runs) mustHaveMissing.push('reminder_runs');
  if (!row?.has_job_locks) mustHaveMissing.push('job_locks');

  const recoveryTablesPresent = Boolean(row?.has_dunning_state || row?.has_billing_events);

  const detailParts = [];
  if (mustHaveMissing.length > 0) {
    detailParts.push(`Missing required schema: ${mustHaveMissing.join(', ')}.`);
  } else {
    detailParts.push('Required launch schema objects are present.');
  }
  if (!recoveryTablesPresent) {
    detailParts.push('Recovery tables (dunning_state/billing_events) not found.');
  }

  const migrationReport = await getMigrationReport();
  const migrationTableDetected = migrationReport.migrationTableDetected;
  const hasPendingMigrations = migrationReport.pending > 0;
  const inProduction = nodeEnv === 'production' || vercelEnv === 'production';
  const isLocalDev = nodeEnv === 'development';
  if (hasPendingMigrations) {
    if (isLocalDev) {
      detailParts.push('Local DB not migrated yet.');
    }
    detailParts.push(
      `Pending migrations: ${migrationReport.pending}.`,
    );
  }
  if (migrationTableDetected && !migrationReport.lastApplied) {
    detailParts.push('No migrations applied yet.');
  }

  return {
    check: {
      id: 'db-schema-sanity',
      title: 'DB migrations/schema sanity',
      status:
        mustHaveMissing.length > 0
          ? 'fail'
          : inProduction && hasPendingMigrations
            ? 'fail'
            : isLocalDev && hasPendingMigrations
              ? 'warn'
            : hasPendingMigrations || !recoveryTablesPresent
              ? 'warn'
              : 'pass',
      detail: detailParts.join(' '),
      fixHint:
        mustHaveMissing[0] ??
        (hasPendingMigrations && isLocalDev
          ? 'Local DB not migrated yet.\npnpm db:migrate\nDRY_RUN=1 pnpm db:migrate'
          : hasPendingMigrations
          ? 'Run db:migrate and redeploy.'
          :
        (recoveryTablesPresent
          ? 'Keep migrations applied in all production environments.'
          : 'If failed-payment recovery is enabled, apply billing/dunning migrations.')),
    },
    manual: {
      id: 'db-pending-migrations-manual',
      title: 'Pending migrations check (manual)',
      status: 'manual',
      detail: migrationTableDetected
        ? `Migration table detected. Pending migrations: ${migrationReport.pending}.`
        : 'No migration tracking table detected. Verify deployment migration logs manually.',
      fixHint: 'Confirm all migration files were applied in production before launch.',
    },
    raw: {
      hasInvoicesCreatedAt: Boolean(row?.has_invoices_created_at),
      hasInvoiceEmailLogs: Boolean(row?.has_invoice_email_logs),
      hasReminderRuns: Boolean(row?.has_reminder_runs),
      hasJobLocks: Boolean(row?.has_job_locks),
      hasDunningState: Boolean(row?.has_dunning_state),
      hasBillingEvents: Boolean(row?.has_billing_events),
      migrationTableDetected,
      pendingMigrations: migrationReport.pending,
      pendingFilenames: migrationReport.pendingFilenames,
      lastAppliedMigration: migrationReport.lastApplied,
    },
  };
}

async function checkObservability(nodeEnv: string | null, vercelEnv: string | null): Promise<{
  checks: SmokeCheckResult[];
  raw: Record<string, unknown>;
}> {
  const inProduction = nodeEnv === 'production' || vercelEnv === 'production';
  const sentryDsn = process.env.SENTRY_DSN?.trim() ?? '';
  const sentryProjectUrl = process.env.SENTRY_PROJECT_URL?.trim() ?? '';
  const sentryCheck: SmokeCheckResult = {
    id: 'observability-sentry-dsn',
    title: 'Sentry DSN configured',
    status: inProduction && !sentryDsn ? 'warn' : 'pass',
    detail:
      inProduction && !sentryDsn
        ? 'SENTRY_DSN is not set in production.'
        : sentryDsn
          ? 'SENTRY_DSN is configured.'
          : 'SENTRY_DSN not set (non-production).',
    fixHint:
      inProduction && !sentryDsn
        ? 'Set SENTRY_DSN in production environment variables.'
        : 'None.',
    actionLabel: sentryProjectUrl ? 'Open Sentry project' : undefined,
    actionUrl: sentryProjectUrl || undefined,
  };

  const resolved = resolveSiteUrlDebug();
  const { healthUrlResolved, healthUrlReason } = resolveHealthUrlForChecks({
    nodeEnv,
    resolvedSiteUrl: resolved.url,
  });
  const response = await safeFetch(healthUrlResolved);

  const healthCheck: SmokeCheckResult = {
    id: 'observability-health-endpoint',
    title: '/api/health reachable',
    status: !response
      ? 'fail'
      : response.status === 200
        ? 'pass'
        : 'fail',
    detail: !response
      ? `Could not reach ${healthUrlResolved}.`
      : response.status === 200
        ? '/api/health returned HTTP 200.'
        : `/api/health returned HTTP ${response.status}.`,
    fixHint: !response || response.status !== 200 ? 'Ensure /api/health route is deployed and publicly reachable.' : 'None.',
    actionLabel: 'Open health',
    actionUrl: healthUrlResolved,
  };

  return {
    checks: [sentryCheck, healthCheck],
    raw: {
      inProduction,
      sentryDsnPresent: Boolean(sentryDsn),
      sentryProjectUrlPresent: Boolean(sentryProjectUrl),
      healthUrl: healthUrlResolved,
      healthUrlResolved,
      healthUrlReason,
      healthStatus: response?.status ?? null,
    },
  };
}

export async function runProductionSmokeChecks(context: WorkspaceContext): Promise<SmokeCheckPayload> {
  const diagnosticsState = getDiagnosticsEnabledState();
  const nodeEnv = process.env.NODE_ENV ?? null;
  const vercelEnv = process.env.VERCEL_ENV ?? null;
  const resolved = resolveSiteUrlDebug();
  const siteUrlForChecks = resolveSiteUrlForSmokeChecks({
    nodeEnv,
    resolvedSiteUrl: resolved.url,
  });

  const stripeConfig = await checkStripeConfiguration(nodeEnv, vercelEnv);
  const stripeApi = await checkStripeApiReachability(stripeConfig.expectedMode);
  const webhook = await checkWebhookDedupeSafety(stripeConfig.expectedMode);
  const email = await checkEmailPrimitives({
    workspaceId: context.workspaceId,
    actorEmail: context.userEmail,
    nodeEnv,
    vercelEnv,
  });
  const dbSchema = await checkDbSchemaSanity(nodeEnv, vercelEnv);
  const observability = await checkObservability(nodeEnv, vercelEnv);
  const devEnvSanity = checkDevEnvSanity({ nodeEnv, siteUrl: siteUrlForChecks });
  const prodEnvSanity = checkProdEnvSanity({ nodeEnv, vercelEnv });

  const checks = [
    stripeConfig.check,
    stripeApi.check,
    webhook.check,
    webhook.manual,
    email.check,
    ...email.manualChecks,
    dbSchema.check,
    dbSchema.manual,
    devEnvSanity.check,
    prodEnvSanity.check,
    ...observability.checks,
  ];

  const payload: SmokeCheckPayload = {
    kind: 'smoke_run',
    ok: summarizeOk(checks),
    env: {
      nodeEnv,
      vercelEnv,
      siteUrl: siteUrlForChecks.toString(),
    },
    checks,
    raw: {
      stripeConfig: stripeConfig.raw,
      stripeApi: stripeApi.raw,
      webhook: webhook.raw,
      email: email.raw,
      dbSchema: dbSchema.raw,
      devEnvSanity: devEnvSanity.raw,
      prodEnvSanity: prodEnvSanity.raw,
      observability: observability.raw,
      resolver: {
        source: resolved.source,
        usedEnvKey: resolved.usedEnvKey,
        envValues: resolved.envValues,
      },
      safety: {
        stripeWrites: false,
        paymentChargesAttempted: false,
        webhookWritesAttempted: false,
        redirectMode: 'manual',
        diagnosticsEnabled: diagnosticsState.enabled,
        diagnosticsEnabledSource: diagnosticsState.source,
      },
    },
  };

  await persistSmokeCheckRow({
    actorEmail: context.userEmail,
    workspaceId: context.workspaceId,
    env: {
      node_env: nodeEnv,
      vercel_env: vercelEnv,
      site_url: siteUrlForChecks.toString(),
    },
    payload: payload as unknown as Record<string, unknown>,
    ok: payload.ok,
  });

  return payload;
}

export async function getSmokeCheckPingPayload(context: WorkspaceContext) {
  const diagnosticsState = getDiagnosticsEnabledState();
  const resolved = resolveSiteUrlDebug();
  const nodeEnv = process.env.NODE_ENV ?? null;
  const siteUrlForChecks = resolveSiteUrlForSmokeChecks({
    nodeEnv,
    resolvedSiteUrl: resolved.url,
  });
  const settings = await fetchWorkspaceEmailSettings(context.workspaceId).catch(() => null);
  const config = getEffectiveMailConfig({
    workspaceSettings: settings
      ? {
          provider: settings.provider,
          fromName: settings.fromName,
          fromEmail: settings.fromEmail,
          replyTo: settings.replyTo,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          smtpUsername: settings.smtpUsername,
          smtpPasswordPresent: settings.smtpPasswordPresent,
        }
      : null,
  });
  const effectiveFromHeader = buildResendFromHeader(config.fromEmail);
  const fromHeaderValid = isValidMailFromHeader(effectiveFromHeader);
  const latestTest = await getLatestTestEmailAction({
    workspaceId: context.workspaceId,
    actorEmail: context.userEmail,
  });
  const retryAfterMs = latestTest?.payload?.sentAt
    ? new Date(latestTest.payload.sentAt).getTime() + TEST_EMAIL_WINDOW_MS - Date.now()
    : null;
  const retryAfterSec =
    retryAfterMs !== null && Number.isFinite(retryAfterMs)
      ? Math.max(0, Math.ceil(retryAfterMs / 1000))
      : null;

  return {
    env: {
      nodeEnv,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      siteUrl: siteUrlForChecks.toString(),
    },
    lastRun: await getLatestSmokeCheckRun(),
    emailPreview: {
      provider: config.provider,
      effectiveFromHeader,
      fromHeaderValid,
      retryAfterSec: retryAfterSec && retryAfterSec > 0 ? retryAfterSec : null,
    } as SmokeCheckEmailPreview,
    raw: {
      safety: {
        diagnosticsEnabled: diagnosticsState.enabled,
        diagnosticsEnabledSource: diagnosticsState.source,
      },
    },
  };
}

export async function sendSmokeCheckTestEmail(context: WorkspaceContext): Promise<{
  ok: boolean;
  rateLimited: boolean;
  retryAfterSec: number | null;
  message: string;
  sentAt: string | null;
}> {
  const now = new Date();
  const recipient = normalizeEmail(context.userEmail);
  const actorEmail = normalizeEmail(context.userEmail);
  const workspaceId = context.workspaceId;
  const resolved = resolveSiteUrlDebug();
  const nodeEnv = process.env.NODE_ENV ?? null;
  const siteUrlForChecks = resolveSiteUrlForSmokeChecks({
    nodeEnv,
    resolvedSiteUrl: resolved.url,
  });
  const earliestAllowed = new Date(now.getTime() - TEST_EMAIL_WINDOW_MS);
  const settings = await fetchWorkspaceEmailSettings(context.workspaceId).catch(() => null);
  const config = getEffectiveMailConfig({
    workspaceSettings: settings
      ? {
          provider: settings.provider,
          fromName: settings.fromName,
          fromEmail: settings.fromEmail,
          replyTo: settings.replyTo,
          smtpHost: settings.smtpHost,
          smtpPort: settings.smtpPort,
          smtpUsername: settings.smtpUsername,
          smtpPasswordPresent: settings.smtpPasswordPresent,
        }
      : null,
  });
  const effectiveFromHeader = buildResendFromHeader(config.fromEmail);
  const fromHeaderValid = isValidMailFromHeader(effectiveFromHeader);
  if (!fromHeaderValid) {
    const payload: TestEmailActionPayload = {
      kind: 'test_email',
      workspaceId,
      actorEmail,
      recipient,
      sentAt: now.toISOString(),
      success: false,
      rateLimited: false,
      retryAfterSec: null,
      provider: null,
      messageId: null,
      error: `Invalid from header format: ${effectiveFromHeader}`,
    };
    await persistSmokeCheckRow({
      actorEmail,
      workspaceId,
      env: {
        node_env: nodeEnv,
        vercel_env: process.env.VERCEL_ENV ?? null,
        site_url: siteUrlForChecks.toString(),
      },
      payload: payload as unknown as Record<string, unknown>,
      ok: false,
    });
    return {
      ok: false,
      rateLimited: false,
      retryAfterSec: null,
      message: `Invalid from header format: ${effectiveFromHeader}`,
      sentAt: null,
    };
  }

  let recent: { ran_at: Date } | undefined;
  try {
    [recent] = await sql<{ ran_at: Date }[]>`
      select ran_at
      from public.smoke_checks
      where workspace_id = ${workspaceId}
        and actor_email = ${actorEmail}
        and payload->>'kind' = 'test_email'
        and ran_at > ${earliestAllowed.toISOString()}
      order by ran_at desc
      limit 1
    `;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code !== '42P01'
    ) {
      throw error;
    }
  }

  if (recent?.ran_at) {
    const retryAfterMs = TEST_EMAIL_WINDOW_MS - (now.getTime() - recent.ran_at.getTime());
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    const payload: TestEmailActionPayload = {
      kind: 'test_email',
      workspaceId,
      actorEmail,
      recipient,
      sentAt: now.toISOString(),
      success: false,
      rateLimited: true,
      retryAfterSec,
      provider: null,
      messageId: null,
      error: `Rate limited — retry in ${retryAfterSec}s.`,
    };

    await persistSmokeCheckRow({
      actorEmail,
      workspaceId,
      env: {
        node_env: nodeEnv,
        vercel_env: process.env.VERCEL_ENV ?? null,
        site_url: siteUrlForChecks.toString(),
      },
      payload: payload as unknown as Record<string, unknown>,
      ok: false,
    });

    return {
      ok: false,
      rateLimited: true,
      retryAfterSec,
      message: `Rate limited — retry in ${retryAfterSec}s.`,
      sentAt: null,
    };
  }

  const subject = `[Lateless Test] Smoke check email (${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown'})`;
  const bodyText = [
    'Lateless smoke check test email.',
    `Timestamp: ${now.toISOString()}`,
    `Environment: ${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown'}`,
    `Workspace ID: ${workspaceId}`,
    `Actor: ${actorEmail}`,
  ].join('\n');
  const bodyHtml = `
    <p><strong>Lateless smoke check test email.</strong></p>
    <p>Timestamp: ${now.toISOString()}</p>
    <p>Environment: ${process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown'}</p>
    <p>Workspace ID: ${workspaceId}</p>
    <p>Actor: ${actorEmail}</p>
  `;

  let success = false;
  let errorMessage: string | null = null;
  let provider: 'resend' | 'smtp' | null = null;
  let messageId: string | null = null;

  try {
    const sendResult = await sendWorkspaceEmail({
      workspaceId,
      toEmail: recipient,
      subject,
      bodyHtml,
      bodyText,
    });
    success = true;
    provider = sendResult.provider;
    messageId = sendResult.messageId;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Failed to send test email.';
  }

  const actionPayload: TestEmailActionPayload = {
    kind: 'test_email',
    workspaceId,
    actorEmail,
    recipient,
    sentAt: now.toISOString(),
    success,
    rateLimited: false,
    provider,
    messageId,
    error: errorMessage,
  };

  await persistSmokeCheckRow({
    actorEmail,
    workspaceId,
    env: {
      node_env: nodeEnv,
      vercel_env: process.env.VERCEL_ENV ?? null,
      site_url: siteUrlForChecks.toString(),
    },
    payload: actionPayload as unknown as Record<string, unknown>,
    ok: success,
  });

  if (!success) {
    return {
      ok: false,
      rateLimited: false,
      retryAfterSec: null,
      message: errorMessage ?? 'Failed to send test email.',
      sentAt: null,
    };
  }

  return {
    ok: true,
    rateLimited: false,
    retryAfterSec: null,
    message: `Test email sent to ${recipient}.`,
    sentAt: now.toISOString(),
  };
}
