import { NextResponse } from 'next/server';
import { SUPPORT_EMAIL } from '@/app/legal/constants';

export function GET() {
  const body = [
    '/* TEAM */',
    'Product: Lateless',
    '',
    '/* CONTACT */',
    `Email: ${SUPPORT_EMAIL}`,
    `Support: mailto:${SUPPORT_EMAIL}`,
    '',
    '/* SITE */',
    'Standards: HTML5, CSS3, TypeScript, Next.js',
  ].join('\n');

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
