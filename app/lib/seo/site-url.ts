const SITE_URL_ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SITE_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
] as const;
type SiteUrlEnvKey = (typeof SITE_URL_ENV_KEYS)[number];

export type SiteUrlResolutionDebug = {
  url: URL;
  source: SiteUrlEnvKey | 'hardcoded_production' | 'hardcoded_default';
  usedEnvKey: SiteUrlEnvKey | null;
  envValues: Record<SiteUrlEnvKey, string | null>;
};

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
  return resolveSiteUrlDebug().url;
}

export function resolveSiteUrlDebug(): SiteUrlResolutionDebug {
  const envValues = SITE_URL_ENV_KEYS.reduce(
    (acc, key) => {
      acc[key] = process.env[key] ?? null;
      return acc;
    },
    {} as Record<SiteUrlEnvKey, string | null>,
  );

  if (process.env.NODE_ENV === 'production') {
    return {
      url: new URL('https://lateless.org'),
      source: 'hardcoded_production',
      usedEnvKey: null,
      envValues,
    };
  }

  for (const key of SITE_URL_ENV_KEYS) {
    const value = process.env[key];
    if (!value) continue;
    const parsed = toHttpsUrl(value);
    if (parsed) {
      return {
        url: parsed,
        source: key,
        usedEnvKey: key,
        envValues,
      };
    }
  }

  return {
    url: new URL('https://lateless.org'),
    source: 'hardcoded_default',
    usedEnvKey: null,
    envValues,
  };
}

export function getAbsoluteUrl(pathname: string): string {
  return new URL(pathname, getSiteUrl()).toString();
}
