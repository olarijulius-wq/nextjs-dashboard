import type { MetadataRoute } from 'next';
import { getAbsoluteUrl } from '@/app/lib/seo/site-url';

const PUBLIC_ROUTES = ['/', '/pricing', '/faq', '/help', '/privacy', '/terms', '/security'] as const;
const LAST_MODIFIED = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: getAbsoluteUrl(route),
    lastModified: LAST_MODIFIED,
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.7,
  }));
}
