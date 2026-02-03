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
            cause: { code: 'EMAIL_NOT_VERIFIED' },
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
