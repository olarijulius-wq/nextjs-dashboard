function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function getEmailBaseUrl(): string {
  const fromNextPublicAppUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL ?? '');
  if (fromNextPublicAppUrl) {
    return fromNextPublicAppUrl;
  }

  const fromAuthUrl = normalizeBaseUrl(process.env.AUTH_URL ?? '');
  if (fromAuthUrl) {
    return fromAuthUrl;
  }

  const vercelUrl = (process.env.VERCEL_URL ?? '').trim();
  if (vercelUrl) {
    const fromVercel = normalizeBaseUrl(`https://${vercelUrl}`);
    if (fromVercel) {
      return fromVercel;
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  throw new Error(
    'Email base URL is not configured. Set NEXT_PUBLIC_APP_URL (preferred), AUTH_URL, or VERCEL_URL.',
  );
}
