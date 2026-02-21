const PRIMARY_ADMIN_EMAIL = 'olarijulius@gmail.com';

export function isSettingsRemindersAdminEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  return normalized === PRIMARY_ADMIN_EMAIL;
}

export function isLaunchCheckAdminEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  return normalized === PRIMARY_ADMIN_EMAIL;
}
