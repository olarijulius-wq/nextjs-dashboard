import 'server-only';

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function getInternalAdminEmails(): Set<string> {
  const raw = process.env.INTERNAL_ADMIN_EMAILS;
  if (!raw) return new Set();

  const emails = raw
    .split(',')
    .map((value) => normalizeEmail(value))
    .filter((value) => value.length > 0);

  return new Set(emails);
}

export function isInternalAdmin(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getInternalAdminEmails().has(normalized);
}
