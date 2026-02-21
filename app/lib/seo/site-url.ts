const SITE_URL_ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SITE_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
] as const;

function toHttpsUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    url.protocol = 'https:';
    url.hash = '';
    url.pathname = '/';
    return url;
  } catch {
    return null;
  }
}

export function getSiteUrl(): URL {
  for (const key of SITE_URL_ENV_KEYS) {
    const value = process.env[key];
    if (!value) continue;
    const parsed = toHttpsUrl(value);
    if (parsed) return parsed;
  }

  return new URL('https://lateless.org');
}

export function getAbsoluteUrl(pathname: string): string {
  return new URL(pathname, getSiteUrl()).toString();
}
