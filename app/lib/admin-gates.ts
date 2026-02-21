const PRIMARY_ADMIN_EMAIL = 'olarijulius@gmail.com';

type AdminGateDecision = {
  allowed: boolean;
  reason: string;
};

type DiagnosticsEnabledSource = 'default' | 'env';

export type DiagnosticsEnabledState = {
  enabled: boolean;
  source: DiagnosticsEnabledSource;
  raw: string | null;
};

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function parseEmailList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}

function resolveAllowlistFromEnv(keys: string[]): string[] {
  const allowlist = new Set<string>();
  for (const key of keys) {
    for (const email of parseEmailList(process.env[key])) {
      allowlist.add(email);
    }
  }
  return Array.from(allowlist);
}

function evaluateAdminEmail(input: {
  email: string | null | undefined;
  envKeys: string[];
  fallbackEmails?: string[];
  gateName: string;
}): AdminGateDecision {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail) {
    return { allowed: false, reason: `${input.gateName}: missing actor email` };
  }

  const allowlist = new Set<string>([
    ...resolveAllowlistFromEnv(input.envKeys),
    ...(input.fallbackEmails ?? []).map((value) => normalizeEmail(value)),
  ]);

  if (allowlist.size === 0) {
    return {
      allowed: false,
      reason: `${input.gateName}: allowlist is empty`,
    };
  }

  if (!allowlist.has(normalizedEmail)) {
    return {
      allowed: false,
      reason: `${input.gateName}: ${normalizedEmail} is not allowlisted`,
    };
  }

  return {
    allowed: true,
    reason: `${input.gateName}: allowlisted`,
  };
}

export function getSettingsRemindersAdminEmailDecision(
  email: string | null | undefined,
): AdminGateDecision {
  return evaluateAdminEmail({
    email,
    gateName: 'settings-reminders',
    envKeys: [
      'SETTINGS_REMINDERS_ADMIN_EMAILS',
      'SETTINGS_REMINDERS_ADMIN_EMAIL',
      'DIAGNOSTICS_ADMIN_EMAILS',
      'DIAGNOSTICS_ADMIN_EMAIL',
      'REMINDER_MANUAL_ADMIN_EMAILS',
      'REMINDER_MANUAL_ADMIN_EMAIL',
    ],
    fallbackEmails: [PRIMARY_ADMIN_EMAIL],
  });
}

export function isSettingsRemindersAdminEmail(email: string | null | undefined): boolean {
  return getSettingsRemindersAdminEmailDecision(email).allowed;
}

export function getLaunchCheckAdminEmailDecision(
  email: string | null | undefined,
): AdminGateDecision {
  return evaluateAdminEmail({
    email,
    gateName: 'launch-check',
    envKeys: [
      'LAUNCH_CHECK_ADMIN_EMAILS',
      'LAUNCH_CHECK_ADMIN_EMAIL',
      'DIAGNOSTICS_ADMIN_EMAILS',
      'DIAGNOSTICS_ADMIN_EMAIL',
      'REMINDER_MANUAL_ADMIN_EMAILS',
      'REMINDER_MANUAL_ADMIN_EMAIL',
    ],
    fallbackEmails: [PRIMARY_ADMIN_EMAIL],
  });
}

export function isLaunchCheckAdminEmail(email: string | null | undefined): boolean {
  return getLaunchCheckAdminEmailDecision(email).allowed;
}

export function getSmokeCheckAdminEmailDecision(
  email: string | null | undefined,
): AdminGateDecision {
  return evaluateAdminEmail({
    email,
    gateName: 'smoke-check',
    envKeys: [
      'SMOKE_CHECK_ADMIN_EMAILS',
      'SMOKE_CHECK_ADMIN_EMAIL',
      'DIAGNOSTICS_ADMIN_EMAILS',
      'DIAGNOSTICS_ADMIN_EMAIL',
      'REMINDER_MANUAL_ADMIN_EMAILS',
      'REMINDER_MANUAL_ADMIN_EMAIL',
    ],
    fallbackEmails: [PRIMARY_ADMIN_EMAIL],
  });
}

export function isSmokeCheckAdminEmail(email: string | null | undefined): boolean {
  return getSmokeCheckAdminEmailDecision(email).allowed;
}

function parseBooleanEnv(value: string | undefined): boolean | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }

  return null;
}

export function getDiagnosticsEnabledState(): DiagnosticsEnabledState {
  const parsed = parseBooleanEnv(process.env.DIAGNOSTICS_ENABLED);
  if (parsed !== null) {
    return {
      enabled: parsed,
      source: 'env',
      raw: process.env.DIAGNOSTICS_ENABLED ?? null,
    };
  }

  return {
    enabled: process.env.NODE_ENV === 'development',
    source: 'default',
    raw: process.env.DIAGNOSTICS_ENABLED ?? null,
  };
}

export function diagnosticsEnabled(): boolean {
  return getDiagnosticsEnabledState().enabled;
}
