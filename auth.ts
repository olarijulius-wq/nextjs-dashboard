import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { AuthError } from 'next-auth';
import { authConfig } from './auth.config';
import { z } from 'zod';
import type { User } from '@/app/lib/definitions';
import bcrypt from 'bcrypt';
import postgres from 'postgres';
import crypto from 'crypto';
 
const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const rawAuthUrl = process.env.AUTH_URL;
const normalizedAuthUrl =
  rawAuthUrl?.replace(/\/api\/auth\/?$/, '') || rawAuthUrl || '';
const resolvedBaseUrl = process.env.NEXTAUTH_URL || normalizedAuthUrl;

if (!process.env.NEXTAUTH_URL && resolvedBaseUrl) {
  process.env.NEXTAUTH_URL = resolvedBaseUrl;
}

if (process.env.NODE_ENV !== 'production') {
  console.info('[auth][debug] env', {
    googleClientIdPresent: Boolean(process.env.GOOGLE_CLIENT_ID),
    googleClientSecretPresent: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    githubClientIdPresent: Boolean(process.env.GITHUB_CLIENT_ID),
    githubClientSecretPresent: Boolean(process.env.GITHUB_CLIENT_SECRET),
    nextAuthUrlPresent: Boolean(process.env.NEXTAUTH_URL),
    nextAuthSecretPresent: Boolean(
      process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
    ),
  });
  console.info('[auth][debug] resolvedBaseUrl', process.env.NEXTAUTH_URL || null);
}

const oauthProviders = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthProviders.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  oauthProviders.push(
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'read:user user:email',
        },
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
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
          password: string | null;
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

        if (!user.password) {
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
    ...oauthProviders,
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (!account || account.provider === 'credentials') {
        return true;
      }

      const emailFromProfile =
        profile && typeof profile === 'object' && 'email' in profile
          ? profile.email
          : null;

      const email = normalizeEmail(
        user.email || (typeof emailFromProfile === 'string' ? emailFromProfile : ''),
      );

      if (!email) {
        return false;
      }

      const nameFromProfile =
        profile && typeof profile === 'object' && 'name' in profile
          ? profile.name
          : null;
      const resolvedName =
        user.name?.trim() ||
        (typeof nameFromProfile === 'string' ? nameFromProfile.trim() : '') ||
        'Lateless User';

      try {
        const [existing] = await sql<{
          id: string;
          name: string | null;
        }[]>`
          select id, name
          from users
          where lower(trim(email)) = ${email}
          limit 1
        `;

        if (existing) {
          await sql`
            update users
            set
              name = case
                when coalesce(trim(name), '') = '' then ${resolvedName}
                else name
              end,
              is_verified = true,
              verification_token = null,
              verification_sent_at = null
            where id = ${existing.id}
          `;
          (user as { id?: string }).id = existing.id;
          user.email = email;
          return true;
        }

        const placeholderPasswordHash = await bcrypt.hash(
          `${crypto.randomUUID()}:${email}`,
          10,
        );

        const [created] = await sql<{ id: string; email: string }[]>`
          insert into users (
            name,
            email,
            password,
            is_verified,
            verification_token,
            verification_sent_at
          )
          values (
            ${resolvedName},
            ${email},
            ${placeholderPasswordHash},
            true,
            null,
            null
          )
          returning id, email
        `;

        if (!created) {
          return false;
        }

        (user as { id?: string }).id = created.id;
        user.email = created.email;
        return true;
      } catch (error) {
        console.error('OAuth sign-in sync failed:', error);
        return false;
      }
    },
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
