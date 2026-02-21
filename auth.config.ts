import type { NextAuthConfig } from 'next-auth';

const DIAGNOSTICS_PAGE_PATHS = new Set([
  '/dashboard/settings/smoke-check',
  '/dashboard/settings/migrations',
  '/dashboard/settings/all-checks',
]);

function isDiagnosticsPagePath(pathname: string) {
  if (DIAGNOSTICS_PAGE_PATHS.has(pathname)) return true;
  for (const path of DIAGNOSTICS_PAGE_PATHS) {
    if (pathname.startsWith(`${path}/`)) return true;
  }
  return false;
}
 
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;

      const pathname = nextUrl.pathname;
      const isOnDashboard = pathname.startsWith('/dashboard');
      const isOnAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');
      const isDiagnosticsPage = isDiagnosticsPagePath(pathname);

      if (isDiagnosticsPage) {
        return true;
      }

      // Protect dashboard
      if (isOnDashboard) {
        return isLoggedIn;
      }

      // If logged in, keep them out of login/signup
      if (isLoggedIn && isOnAuthPage) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      return true;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
