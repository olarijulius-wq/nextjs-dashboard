import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/app/lib/seo/site-url';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/pricing', '/faq', '/help', '/privacy', '/terms', '/security'],
        disallow: [
          '/dashboard',
          '/api',
          '/login',
          '/signup',
          '/settings',
          '/onboarding',
          '/_next',
          '/auth',
          '/admin',
          '/pay',
          '/invite',
          '/verify',
          '/unsubscribe',
        ],
      },
    ],
    sitemap: `${siteUrl.toString()}sitemap.xml`,
  };
}
