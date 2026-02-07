import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { AuthError } from 'next-auth';
import { authConfig } from './auth.config';
import { z } from 'zod';
import type { User } from '@/app/lib/definitions';
import bcrypt from 'bcrypt';
import postgres from 'postgres';
 
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
 
export const { auth, signIn, signOut } = NextAuth({
  ...authConfig,
  logger: {
    error(code, ...message) {
      const parts = [code, ...message];
      const payload = parts
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part instanceof Error) {
            return `${part.name} ${part.message}`;
          }
          try {
            return JSON.stringify(part);
          } catch {
            return String(part);
          }
        })
        .join(' ');

      // Invalid credentials / unverified email are handled in app/lib/actions.ts.
      const hasCredentialsSigninPayload =
        payload.includes('CredentialsSignin') ||
        parts.some((part) => {
          if (!part || typeof part !== 'object') return false;
          const maybeTyped = part as { type?: unknown; cause?: unknown };
          const type = maybeTyped.type;
          if (type === 'CredentialsSignin') return true;

          const cause = maybeTyped.cause as { code?: unknown } | undefined;
          return (
            cause?.code === 'INVALID_CREDENTIALS' ||
            cause?.code === 'EMAIL_NOT_VERIFIED'
          );
        });

      if (hasCredentialsSigninPayload) {
        return;
      }

      console.error('[auth][error]', code, ...message);
    },
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const { email, password } = parsedCredentials.data;
        const normalizedEmail = normalizeEmail(email);
        const [user] = await sql<{
          id: string;
          name: string | null;
          email: string;
          password: string;
          is_verified: boolean;
        }[]>`
          select id, name, email, password, is_verified
          from users
          where lower(email) = ${normalizedEmail}
          limit 1
        `;

        if (!user) {
          throw new AuthError('CredentialsSignin', {
            cause: { code: 'INVALID_CREDENTIALS' },
          } as any);
        }

        const passwordsMatch = await bcrypt.compare(password, user.password);
        if (!passwordsMatch) {
          throw new AuthError('CredentialsSignin', {
            cause: { code: 'INVALID_CREDENTIALS' },
          } as any);
        }

        if (!user.is_verified) {
          throw new AuthError('CredentialsSignin', {
            cause: { code: 'EMAIL_NOT_VERIFIED', email: user.email },
          } as any);
        }

        return user as User;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.id) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
});
