import postgres from 'postgres';
import { ensureWorkspaceContextForCurrentUser, type WorkspaceContext } from '@/app/lib/workspaces';
import { getLaunchCheckAdminEmailDecision } from '@/app/lib/admin-gates';
import { isInternalAdmin } from '@/app/lib/internal-admin-email';
import { resolveSiteUrlDebug } from '@/app/lib/seo/site-url';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const REQUIRED_SITEMAP_PATHS = ['/', '/pricing', '/faq', '/help', '/privacy', '/terms', '/security'];
const PRIVATE_NOINDEX_PATHS = [
  '/dashboard',
  '/login',
  '/signup',
  '/onboarding',
  '/pay/test-token-placeholder',
  '/pay/placeholder',
];
const PUBLIC_IA_PATHS = ['/pricing', '/faq', '/help', '/privacy', '/terms', '/security'];

type CheckStatus = 'pass' | 'fail' | 'warn';

type CheckResult = {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fixHint: string;
};

type LaunchCheckPayload = {
  ok: boolean;
  env: {
    nodeEnv: string | null;
    vercelEnv: string | null;
    siteUrlResolved: string;
  };
  checks: CheckResult[];
  raw: Record<string, unknown>;
};

type LaunchCheckRunRecord = {
  ranAt: string;
  actorEmail: string;
  env: string;
  payload: LaunchCheckPayload;
};

function normalizeEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase();
}

function hasNoindexTag(value: string | null) {
  return value?.toLowerCase().includes('noindex') ?? false;
}

function hasNofollowTag(value: string | null) {
  return value?.toLowerCase().includes('nofollow') ?? false;
}

function extractFirstMatch(input: string, regex: RegExp): string | null {
  const match = regex.exec(input);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function extractLocUrls(xml: string): string[] {
  const urls: string[] = [];
  const regex = /<loc>([^<]+)<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const value = match[1]?.trim();
    if (value) urls.push(value);
  }
  return urls;
}

function extractHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const value = match[1]?.trim();
    if (value) hrefs.push(value);
  }
  return hrefs;
}

function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const regex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const value = match[1]?.trim();
    if (value) blocks.push(value);
  }
  return blocks;
}

function collectJsonLdTypes(node: unknown, bucket: Set<string>) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) {
      collectJsonLdTypes(item, bucket);
    }
    return;
  }

  const asRecord = node as Record<string, unknown>;
  const typeValue = asRecord['@type'];

  if (typeof typeValue === 'string') {
    bucket.add(typeValue);
  } else if (Array.isArray(typeValue)) {
    for (const typeItem of typeValue) {
      if (typeof typeItem === 'string') bucket.add(typeItem);
    }
  }

  for (const value of Object.values(asRecord)) {
    collectJsonLdTypes(value, bucket);
  }
}

function isForbiddenCanonicalHost(urlValue: string) {
  return (
    /localhost/i.test(urlValue) ||
    /127\.0\.0\.1/.test(urlValue) ||
    /\.vercel\.app/i.test(urlValue)
  );
}

function parseMaybeUrl(input: string) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function normalizePathnameForCompare(pathname: string) {
  if (!pathname) return '/';
  return pathname !== '/' && pathname.endsWith('/') ? pathname.replace(/\/+$/, '') : pathname;
}

function normalizeUrlForCompare(input: string | null | undefined, resolvedSiteUrl: URL): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';

  let parsed: URL;
  try {
    parsed = new URL(trimmed, resolvedSiteUrl);
  } catch {
    return '';
  }

  if (parsed.hostname === 'lateless.org' && parsed.protocol === 'http:') {
    parsed.protocol = 'https:';
    parsed.port = '';
  }

  parsed.hash = '';
  const normalizedPathname = normalizePathnameForCompare(parsed.pathname);
  if (
    (parsed.protocol === 'https:' && parsed.port === '443') ||
    (parsed.protocol === 'http:' && parsed.port === '80')
  ) {
    parsed.port = '';
  }

  const pathnameForCompare = normalizedPathname === '/' ? '' : normalizedPathname;
  return `${parsed.protocol}//${parsed.host}${pathnameForCompare}${parsed.search}`;
}

async function safeFetch(url: string) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
    });
    return response;
  } catch {
    return null;
  }
}

function isDashboardRedirect(locationHeader: string | null, siteUrl: URL) {
  if (!locationHeader) return false;

  if (locationHeader.startsWith('/dashboard')) return true;

  try {
    const parsed = new URL(locationHeader, siteUrl);
    return parsed.pathname.startsWith('/dashboard');
  } catch {
    return false;
  }
}

function summarizeStatuses(checks: CheckResult[]) {
  return checks.every((check) => check.status !== 'fail');
}

function buildEnvSummary(nodeEnv: string | null, vercelEnv: string | null) {
  return vercelEnv || nodeEnv || 'unknown';
}

async function checkRobots(siteUrl: URL): Promise<{ check: CheckResult; raw: Record<string, unknown> }> {
  const url = new URL('/robots.txt', siteUrl).toString();
  const response = await safeFetch(url);

  if (!response) {
    return {
      check: {
        id: 'robots',
        title: 'robots.txt reachable + correct',
        status: 'fail',
        detail: `Could not fetch ${url}.`,
        fixHint:
          'ensure public/robots.txt exists or route works; ensure site-url.ts resolves prod host',
      },
      raw: { url, error: 'fetch_failed' },
    };
  }

  const body = await response.text();
  const hasUserAgentAll = /User-Agent:\s*\*/i.test(body);
  const hasSitemap = /Sitemap:\s*https:\/\/lateless\.org\/sitemap\.xml/i.test(body);
  const hasDashboardDisallow = /Disallow:\s*\/dashboard/i.test(body);
  const hasPayDisallow = /Disallow:\s*\/pay/i.test(body);

  const errors: string[] = [];
  if (response.status !== 200) errors.push(`HTTP ${response.status}`);
  if (!hasUserAgentAll) errors.push('missing User-Agent: *');
  if (!hasSitemap) errors.push('missing or wrong Sitemap host');
  if (!hasDashboardDisallow) errors.push('missing Disallow: /dashboard');
  if (!hasPayDisallow) errors.push('missing Disallow: /pay');

  return {
    check: {
      id: 'robots',
      title: 'robots.txt reachable + correct',
      status: errors.length === 0 ? 'pass' : 'fail',
      detail:
        errors.length === 0
          ? `robots.txt is reachable and includes required directives.`
          : `robots.txt check failed: ${errors.join('; ')}.`,
      fixHint:
        'ensure public/robots.txt exists or route works; ensure site-url.ts resolves prod host',
    },
    raw: {
      url,
      status: response.status,
      hasUserAgentAll,
      hasSitemap,
      hasDashboardDisallow,
      hasPayDisallow,
    },
  };
}

async function checkSitemap(siteUrl: URL): Promise<{ check: CheckResult; raw: Record<string, unknown> }> {
  const url = new URL('/sitemap.xml', siteUrl).toString();
  const response = await safeFetch(url);

  if (!response) {
    return {
      check: {
        id: 'sitemap',
        title: 'sitemap.xml reachable + only public URLs',
        status: 'fail',
        detail: `Could not fetch ${url}.`,
        fixHint: 'update app/sitemap.ts to only include public routes',
      },
      raw: { url, error: 'fetch_failed' },
    };
  }

  const xml = await response.text();
  const locUrls = extractLocUrls(xml);
  const pathnames = locUrls
    .map((loc) => {
      try {
        return new URL(loc).pathname;
      } catch {
        return null;
      }
    })
    .filter((value): value is string => !!value);

  const requiredSet = new Set(REQUIRED_SITEMAP_PATHS);
  const pathSet = new Set(pathnames);
  const missingRequired = REQUIRED_SITEMAP_PATHS.filter((path) => !pathSet.has(path));
  const disallowed = pathnames.filter((pathname) => !requiredSet.has(pathname));
  const hasForbidden = pathnames.some(
    (pathname) =>
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/pay') ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/signup') ||
      pathname.startsWith('/onboarding') ||
      pathname.startsWith('/api') ||
      pathname.includes('/token'),
  );

  const errors: string[] = [];
  if (response.status !== 200) errors.push(`HTTP ${response.status}`);
  if (missingRequired.length > 0) errors.push(`missing required routes (${missingRequired.join(', ')})`);
  if (disallowed.length > 0) errors.push(`contains disallowed routes (${disallowed.join(', ')})`);
  if (hasForbidden) errors.push('contains private/token/api routes');

  return {
    check: {
      id: 'sitemap',
      title: 'sitemap.xml reachable + only public URLs',
      status: errors.length === 0 ? 'pass' : 'fail',
      detail:
        errors.length === 0
          ? 'sitemap.xml includes only expected public routes.'
          : `sitemap.xml check failed: ${errors.join('; ')}.`,
      fixHint: 'update app/sitemap.ts to only include public routes',
    },
    raw: {
      url,
      status: response.status,
      locCount: locUrls.length,
      pathnames,
      missingRequired,
      disallowed,
      hasForbidden,
    },
  };
}

async function checkNoindexHeaders(siteUrl: URL): Promise<{ check: CheckResult; raw: Record<string, unknown> }> {
  const perPath: Array<{
    path: string;
    status: number | null;
    hasNoindexHeader: boolean;
    hasNofollowHeader: boolean;
    hasNoindexMeta: boolean;
    result: CheckStatus;
    location: string | null;
  }> = [];

  for (const path of PRIVATE_NOINDEX_PATHS) {
    const url = new URL(path, siteUrl).toString();
    const response = await safeFetch(url);

    if (!response) {
      perPath.push({
        path,
        status: null,
        hasNoindexHeader: false,
        hasNofollowHeader: false,
        hasNoindexMeta: false,
        result: 'fail',
        location: null,
      });
      continue;
    }

    const xRobotsTag = response.headers.get('x-robots-tag');
    const hasNoindexHeader = hasNoindexTag(xRobotsTag);
    const hasNofollowHeader = hasNofollowTag(xRobotsTag);

    let hasNoindexMeta = false;
    const contentType = response.headers.get('content-type') || '';
    if (!hasNoindexHeader && /text\/html/i.test(contentType)) {
      const html = await response.text();
      const robotsMeta = extractFirstMatch(
        html,
        /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      );
      hasNoindexMeta = hasNoindexTag(robotsMeta);
    }

    const result: CheckStatus = hasNoindexHeader
      ? 'pass'
      : hasNoindexMeta
        ? 'warn'
        : 'fail';

    perPath.push({
      path,
      status: response.status,
      hasNoindexHeader,
      hasNofollowHeader,
      hasNoindexMeta,
      result,
      location: response.headers.get('location'),
    });
  }

  const failing = perPath.filter((item) => item.result === 'fail').map((item) => item.path);
  const warning = perPath.filter((item) => item.result === 'warn').map((item) => item.path);

  let status: CheckStatus = 'pass';
  if (failing.length > 0) {
    status = 'fail';
  } else if (warning.length > 0) {
    status = 'warn';
  }

  const detail =
    status === 'pass'
      ? 'All private routes return X-Robots-Tag with noindex (nofollow preferred).'
      : status === 'warn'
        ? `Noindex found only in meta on: ${warning.join(', ')}.`
        : `No noindex header/meta for: ${failing.join(', ')}.`;

  return {
    check: {
      id: 'noindex-private',
      title: 'Noindex on private pages via headers/meta',
      status,
      detail,
      fixHint:
        'ensure middleware sets X-Robots-Tag on private/token routes; ensure layouts/pages set metadata robots too',
    },
    raw: {
      paths: perPath,
    },
  };
}

async function checkCanonical(
  siteUrl: URL,
  nodeEnv: string | null,
  vercelEnv: string | null,
): Promise<{
  check: CheckResult;
  raw: Record<string, unknown>;
}> {
  const url = new URL('/', siteUrl).toString();
  const response = await safeFetch(url);

  if (!response) {
    return {
      check: {
        id: 'canonical-og-url',
        title: 'Canonical + metadataBase host sanity',
        status: 'fail',
        detail: `Could not fetch ${url}.`,
        fixHint:
          'set NEXT_PUBLIC_SITE_URL/NEXT_PUBLIC_APP_URL and ensure site-url.ts resolves correctly in prod',
      },
      raw: { url, error: 'fetch_failed' },
    };
  }

  const html = await response.text();
  const canonical = extractFirstMatch(
    html,
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i,
  );
  const ogUrl = extractFirstMatch(
    html,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );

  const canonicalHrefNormalized = normalizeUrlForCompare(canonical, siteUrl);
  const ogUrlNormalized = normalizeUrlForCompare(ogUrl, siteUrl);
  const resolvedSiteUrlNormalized = normalizeUrlForCompare(siteUrl.toString(), siteUrl);

  const canonicalIsProd = canonicalHrefNormalized.startsWith(resolvedSiteUrlNormalized);
  const ogIsProd = ogUrl ? ogUrlNormalized.startsWith(resolvedSiteUrlNormalized) : true;
  const inProduction = nodeEnv === 'production' || vercelEnv === 'production';

  const canonicalForbidden =
    (canonical ? isForbiddenCanonicalHost(canonical) : false) ||
    (canonicalHrefNormalized ? isForbiddenCanonicalHost(canonicalHrefNormalized) : false);
  const ogForbidden =
    (ogUrl ? isForbiddenCanonicalHost(ogUrl) : false) ||
    (ogUrlNormalized ? isForbiddenCanonicalHost(ogUrlNormalized) : false);
  const previewAllowed = vercelEnv === 'preview';

  let status: CheckStatus = 'pass';
  const notes: string[] = [];

  if (!canonical) {
    status = 'fail';
    notes.push('canonical tag missing');
  }

  if (canonical && !canonicalIsProd) {
    if (!inProduction && previewAllowed && canonicalForbidden) {
      status = status === 'fail' ? 'fail' : 'warn';
      notes.push('canonical uses preview/dev host in preview env');
    } else {
      status = 'fail';
      notes.push('canonical does not resolve to production site URL');
    }
  }

  if (ogUrl && !ogIsProd) {
    if (!inProduction && previewAllowed && ogForbidden) {
      if (status === 'pass') status = 'warn';
      notes.push('og:url uses preview/dev host in preview env');
    } else {
      status = 'fail';
      notes.push('og:url does not resolve to production site URL');
    }
  }

  if (inProduction && canonicalForbidden) {
    status = 'fail';
    notes.push('canonical uses forbidden host in production');
  }

  if (inProduction && ogForbidden) {
    status = 'fail';
    notes.push('og:url uses forbidden host in production');
  }

  return {
    check: {
      id: 'canonical-og-url',
      title: 'Canonical + metadataBase host sanity',
      status,
      detail:
        notes.length > 0
          ? notes.join('; ')
          : 'canonical and og:url resolve to production site URL.',
      fixHint:
        'set NEXT_PUBLIC_SITE_URL/NEXT_PUBLIC_APP_URL and ensure site-url.ts resolves correctly in prod',
    },
    raw: {
      url,
      status: response.status,
      canonical,
      ogUrl,
      canonicalHrefNormalized,
      ogUrlNormalized,
      resolvedSiteUrlNormalized,
      previewAllowed,
      inProduction,
      notes,
    },
  };
}

async function checkOgImage(siteUrl: URL): Promise<{ check: CheckResult; raw: Record<string, unknown> }> {
  const url = new URL('/opengraph-image.png', siteUrl).toString();
  const response = await safeFetch(url);

  if (!response) {
    return {
      check: {
        id: 'og-image',
        title: 'OG image loads',
        status: 'fail',
        detail: `Could not fetch ${url}.`,
        fixHint:
          'ensure opengraph-image.png exists in app/ or public and middleware/proxy doesn\'t block it',
      },
      raw: { url, error: 'fetch_failed' },
    };
  }

  const contentType = response.headers.get('content-type') || '';
  const ok = response.status === 200 && /^image\//i.test(contentType);

  return {
    check: {
      id: 'og-image',
      title: 'OG image loads',
      status: ok ? 'pass' : 'fail',
      detail: ok
        ? `OG image responds with ${contentType}.`
        : `OG image check failed (status ${response.status}, content-type ${contentType || 'missing'}).`,
      fixHint:
        'ensure opengraph-image.png exists in app/ or public and middleware/proxy doesn\'t block it',
    },
    raw: {
      url,
      status: response.status,
      contentType,
    },
  };
}

async function checkJsonLd(siteUrl: URL): Promise<{ check: CheckResult; raw: Record<string, unknown> }> {
  const schemaTargets = [
    {
      path: '/',
      expected: ['Organization', 'SoftwareApplication'],
      matcher: (types: Set<string>) => types.has('Organization') && types.has('SoftwareApplication'),
    },
    {
      path: '/pricing',
      expected: ['Product or Offer'],
      matcher: (types: Set<string>) => types.has('Product') || types.has('Offer'),
    },
    {
      path: '/faq',
      expected: ['FAQPage'],
      matcher: (types: Set<string>) => types.has('FAQPage'),
    },
  ];

  const invalidJsonPages: string[] = [];
  const missingPages: string[] = [];
  const debugPages: Array<Record<string, unknown>> = [];

  for (const target of schemaTargets) {
    const url = new URL(target.path, siteUrl).toString();
    const response = await safeFetch(url);

    if (!response || response.status !== 200) {
      missingPages.push(`${target.path} (unreachable)`);
      debugPages.push({ path: target.path, status: response?.status ?? null, types: [] });
      continue;
    }

    const html = await response.text();
    const blocks = extractJsonLdBlocks(html);
    const types = new Set<string>();
    let parseFailed = false;

    for (const block of blocks) {
      try {
        const parsed = JSON.parse(block) as unknown;
        collectJsonLdTypes(parsed, types);
      } catch {
        parseFailed = true;
        break;
      }
    }

    if (parseFailed) {
      invalidJsonPages.push(target.path);
    } else if (!target.matcher(types)) {
      missingPages.push(`${target.path} (missing ${target.expected.join(', ')})`);
    }

    debugPages.push({
      path: target.path,
      status: response.status,
      blockCount: blocks.length,
      types: Array.from(types),
      parseFailed,
    });
  }

  let status: CheckStatus = 'pass';
  let detail = 'JSON-LD scripts are present, parseable, and include expected types.';

  if (invalidJsonPages.length > 0) {
    status = 'fail';
    detail = `Invalid JSON-LD on: ${invalidJsonPages.join(', ')}.`;
  } else if (missingPages.length > 0) {
    status = 'warn';
    detail = `Missing expected schema on: ${missingPages.join(', ')}.`;
  }

  return {
    check: {
      id: 'jsonld',
      title: 'JSON-LD present and parseable',
      status,
      detail,
      fixHint: 'fix jsonld.ts generators / ensure pages render scripts',
    },
    raw: {
      pages: debugPages,
    },
  };
}

async function checkPublicIa(siteUrl: URL): Promise<{ check: CheckResult; raw: Record<string, unknown> }> {
  const homeUrl = new URL('/', siteUrl).toString();
  const homeResponse = await safeFetch(homeUrl);

  if (!homeResponse || homeResponse.status !== 200) {
    return {
      check: {
        id: 'public-ia',
        title: 'Public IA links are public and not broken',
        status: 'fail',
        detail: `Could not fetch homepage (${homeUrl}).`,
        fixHint: 'fix top-nav.tsx/public-footer.tsx links and ensure pages exist',
      },
      raw: { homeUrl, status: homeResponse?.status ?? null },
    };
  }

  const homepageHtml = await homeResponse.text();
  const hrefs = extractHrefs(homepageHtml);
  const hrefPathnames = hrefs
    .map((href) => {
      const parsed = parseMaybeUrl(href);
      if (parsed) return normalizePathnameForCompare(parsed.pathname);
      if (href.startsWith('/')) return normalizePathnameForCompare(href);
      return null;
    })
    .filter((value): value is string => !!value);
  const hrefPathSet = new Set(hrefPathnames);

  const missing = PUBLIC_IA_PATHS.filter((path) => !hrefPathSet.has(normalizePathnameForCompare(path)));

  const dashboardLinked = hrefs.some((href) => {
    const parsed = parseMaybeUrl(href);
    if (parsed) return parsed.pathname.startsWith('/dashboard');
    return href.startsWith('/dashboard');
  });

  const broken: string[] = [];
  for (const path of PUBLIC_IA_PATHS) {
    const response = await safeFetch(new URL(path, siteUrl).toString());
    if (!response) {
      broken.push(`${path} (fetch failed)`);
      continue;
    }

    if (response.status === 404) {
      broken.push(`${path} (404)`);
      continue;
    }

    const location = response.headers.get('location');
    if (isDashboardRedirect(location, siteUrl)) {
      broken.push(`${path} (redirects to dashboard)`);
    }
  }

  let status: CheckStatus = 'pass';
  const notes: string[] = [];

  if (dashboardLinked || broken.length > 0) {
    status = 'fail';
    if (dashboardLinked) notes.push('homepage links include /dashboard');
    if (broken.length > 0) notes.push(`broken links: ${broken.join(', ')}`);
  } else if (missing.length > 0) {
    status = 'warn';
    notes.push(`missing IA links: ${missing.join(', ')}`);
  }

  return {
    check: {
      id: 'public-ia',
      title: 'Public IA links are public and not broken',
      status,
      detail:
        notes.length > 0
          ? notes.join('; ')
          : 'Pricing/FAQ/Help/Privacy/Terms/Security links are present and resolve publicly.',
      fixHint: 'fix top-nav.tsx/public-footer.tsx links and ensure pages exist',
    },
    raw: {
      homeUrl,
      hrefCount: hrefs.length,
      hrefPathnames,
      missing,
      broken,
      dashboardLinked,
    },
  };
}

function checkEnvSanity(params: {
  nodeEnv: string | null;
  vercelEnv: string | null;
  siteUrl: URL;
  source: string;
  usedEnvKey: string | null;
  envValues: Record<string, string | null>;
}): { check: CheckResult; raw: Record<string, unknown> } {
  const { nodeEnv, vercelEnv, siteUrl, source, usedEnvKey, envValues } = params;
  const host = siteUrl.host;
  const inProduction = nodeEnv === 'production' || vercelEnv === 'production';

  let status: CheckStatus = 'pass';
  const notes: string[] = [];

  if (inProduction && !host) {
    status = 'fail';
    notes.push('resolved site URL is empty in production');
  }

  if (inProduction && /localhost|127\.0\.0\.1/i.test(host)) {
    status = 'fail';
    notes.push(`resolved site URL is local in production (${host})`);
  }

  if (inProduction && host !== 'lateless.org') {
    status = 'fail';
    notes.push(`resolved host is ${host}, expected lateless.org`);
  }

  if (
    status === 'pass' &&
    (usedEnvKey === 'VERCEL_URL' || usedEnvKey === 'VERCEL_PROJECT_PRODUCTION_URL')
  ) {
    status = 'warn';
    notes.push(`site URL resolved via fallback env ${usedEnvKey}`);
  }

  if (notes.length === 0) {
    notes.push(
      `resolved ${siteUrl.toString()} using source=${source}${usedEnvKey ? ` (${usedEnvKey})` : ''}.`,
    );
  }

  return {
    check: {
      id: 'env-sanity',
      title: 'Env sanity for sitemap/canonical host',
      status,
      detail: notes.join(' '),
      fixHint: 'set NEXT_PUBLIC_SITE_URL=https://lateless.org in Vercel prod env',
    },
    raw: {
      nodeEnv,
      vercelEnv,
      source,
      usedEnvKey,
      envValues,
      resolvedSiteUrl: siteUrl.toString(),
      resolvedHost: host,
    },
  };
}

export type LaunchCheckAccessDecision = {
  allowed: boolean;
  reason: string;
  context: WorkspaceContext | null;
};

function isWorkspaceOwnerOrAdmin(role: WorkspaceContext['userRole']) {
  return role === 'owner' || role === 'admin';
}

export async function getLaunchCheckAccessDecision(): Promise<LaunchCheckAccessDecision> {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    if (!isInternalAdmin(context.userEmail)) {
      return {
        allowed: false,
        reason: `launch-check: ${context.userEmail} is not internal admin`,
        context: null,
      };
    }
    if (!isWorkspaceOwnerOrAdmin(context.userRole)) {
      return {
        allowed: false,
        reason: `launch-check: workspace role ${context.userRole} is not owner/admin`,
        context: null,
      };
    }
    const allowlistDecision = getLaunchCheckAdminEmailDecision(context.userEmail);
    if (!allowlistDecision.allowed) {
      return {
        allowed: false,
        reason: allowlistDecision.reason,
        context: null,
      };
    }
    return {
      allowed: true,
      reason: 'launch-check: allowed',
      context,
    };
  } catch {
    return {
      allowed: false,
      reason: 'launch-check: no session or workspace context unavailable',
      context: null,
    };
  }
}

export async function getLaunchCheckAccessContext(): Promise<WorkspaceContext | null> {
  const decision = await getLaunchCheckAccessDecision();
  return decision.allowed ? decision.context : null;
}

export async function getLatestLaunchCheckRun(): Promise<LaunchCheckRunRecord | null> {
  try {
    const [row] = await sql<{
      ran_at: Date;
      actor_email: string;
      env: string;
      payload: LaunchCheckPayload;
    }[]>`
      select ran_at, actor_email, env, payload
      from public.launch_checks
      order by ran_at desc
      limit 1
    `;

    if (!row) return null;

    return {
      ranAt: row.ran_at.toISOString(),
      actorEmail: row.actor_email,
      env: row.env,
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

async function persistLaunchCheckRun(input: {
  actorEmail: string;
  env: string;
  payload: LaunchCheckPayload;
}) {
  try {
    await sql`
      insert into public.launch_checks (ran_at, actor_email, env, payload)
      values (
        now(),
        ${normalizeEmail(input.actorEmail)},
        ${input.env},
        ${sql.json(input.payload as unknown as postgres.JSONValue)}
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

export async function getLaunchCheckPingPayload() {
  const resolved = resolveSiteUrlDebug();

  return {
    env: {
      nodeEnv: process.env.NODE_ENV ?? null,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      siteUrlResolved: resolved.url.toString(),
      source: resolved.source,
      usedEnvKey: resolved.usedEnvKey,
      envValues: resolved.envValues,
    },
    lastRun: await getLatestLaunchCheckRun(),
  };
}

export async function runLaunchReadinessChecks(actorEmail: string): Promise<LaunchCheckPayload> {
  const nodeEnv = process.env.NODE_ENV ?? null;
  const vercelEnv = process.env.VERCEL_ENV ?? null;
  const resolved = resolveSiteUrlDebug();
  const siteUrl = resolved.url;

  const [robots, sitemap, noindex, canonical, ogImage, jsonLd, publicIa] = await Promise.all([
    checkRobots(siteUrl),
    checkSitemap(siteUrl),
    checkNoindexHeaders(siteUrl),
    checkCanonical(siteUrl, nodeEnv, vercelEnv),
    checkOgImage(siteUrl),
    checkJsonLd(siteUrl),
    checkPublicIa(siteUrl),
  ]);

  const envSanity = checkEnvSanity({
    nodeEnv,
    vercelEnv,
    siteUrl,
    source: resolved.source,
    usedEnvKey: resolved.usedEnvKey,
    envValues: resolved.envValues,
  });

  const checks = [
    robots.check,
    sitemap.check,
    noindex.check,
    canonical.check,
    ogImage.check,
    jsonLd.check,
    publicIa.check,
    envSanity.check,
  ];

  const payload: LaunchCheckPayload = {
    ok: summarizeStatuses(checks),
    env: {
      nodeEnv,
      vercelEnv,
      siteUrlResolved: siteUrl.toString(),
    },
    checks,
    raw: {
      robots: robots.raw,
      sitemap: sitemap.raw,
      noindex: noindex.raw,
      canonical: canonical.raw,
      ogImage: ogImage.raw,
      jsonLd: jsonLd.raw,
      publicIa: publicIa.raw,
      envSanity: envSanity.raw,
      resolver: {
        source: resolved.source,
        usedEnvKey: resolved.usedEnvKey,
        envValues: resolved.envValues,
      },
      safety: {
        redirectMode: 'manual',
        note: 'Checker does not follow redirects; dashboard redirects are flagged.',
      },
    },
  };

  await persistLaunchCheckRun({
    actorEmail,
    env: buildEnvSummary(nodeEnv, vercelEnv),
    payload,
  });

  return payload;
}

export type { CheckResult as LaunchCheckResult, LaunchCheckPayload, LaunchCheckRunRecord };
