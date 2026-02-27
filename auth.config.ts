import type { NextAuthConfig } from 'next-auth';
 
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
