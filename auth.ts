import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { AuthError } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
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

function mapUserRowToAdapterUser(user?: {
  id: string;
  name: string | null;
  email: string;
} | null) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: null,
    image: null,
  };
}

function PostgresAuthAdapter(): Adapter {
  return {
    async createUser(user) {
      if (!user.email) {
        throw new Error('Cannot create OAuth user without email.');
      }

      const normalizedEmail = normalizeEmail(user.email);
      const resolvedName = user.name?.trim() || 'Lateless User';
      const placeholderPasswordHash = await bcrypt.hash(
        `${crypto.randomUUID()}:${normalizedEmail}`,
        10,
      );

      const [createdUser] = await sql<{
        id: string;
        name: string | null;
        email: string;
      }[]>`
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
          ${normalizedEmail},
          ${placeholderPasswordHash},
          true,
          null,
          null
        )
        returning id, name, email
      `;

      if (!createdUser) {
        throw new Error('Failed to create user.');
      }

      return {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        emailVerified: null,
        image: user.image ?? null,
      };
    },
    async getUser(id) {
      const [user] = await sql<{
        id: string;
        name: string | null;
        email: string;
      }[]>`
        select id, name, email
        from users
        where id = ${id}
        limit 1
      `;

      return mapUserRowToAdapterUser(user);
    },
    async getUserByEmail(email) {
      const normalizedEmail = normalizeEmail(email);
      const [user] = await sql<{
        id: string;
        name: string | null;
        email: string;
      }[]>`
        select id, name, email
        from users
        where lower(trim(email)) = ${normalizedEmail}
        limit 1
      `;

      return mapUserRowToAdapterUser(user);
    },
    async getUserByAccount(account) {
      const [user] = await sql<{
        id: string;
        name: string | null;
        email: string;
      }[]>`
        select u.id, u.name, u.email
        from nextauth_accounts a
        join users u on u.id = a.user_id
        where a.provider = ${account.provider}
          and a.provider_account_id = ${account.providerAccountId}
        limit 1
      `;

      return mapUserRowToAdapterUser(user);
    },
    async updateUser(user) {
      if (!user.id) {
        throw new Error('Cannot update user without id.');
      }

      const trimmedName = user.name?.trim() || null;
      const normalizedEmail = user.email ? normalizeEmail(user.email) : null;
      const [updated] = await sql<{
        id: string;
        name: string | null;
        email: string;
      }[]>`
        update users
        set
          name = coalesce(${trimmedName}, name),
          email = coalesce(${normalizedEmail}, email)
        where id = ${user.id}
        returning id, name, email
      `;

      if (!updated) {
        throw new Error('Failed to update user.');
      }

      return mapUserRowToAdapterUser(updated)!;
    },
    async deleteUser(id) {
      await sql`
        delete from users
        where id = ${id}
      `;
    },
    async linkAccount(account) {
      const accessToken =
        typeof account.access_token === 'string' ? account.access_token : null;
      const refreshToken =
        typeof account.refresh_token === 'string' ? account.refresh_token : null;
      const expiresAt =
        typeof account.expires_at === 'number' ? account.expires_at : null;
      const tokenType =
        typeof account.token_type === 'string' ? account.token_type : null;
      const scope = typeof account.scope === 'string' ? account.scope : null;
      const idToken = typeof account.id_token === 'string' ? account.id_token : null;
      const sessionState =
        typeof account.session_state === 'string' ? account.session_state : null;

      await sql`
        insert into nextauth_accounts (
          user_id,
          type,
          provider,
          provider_account_id,
          access_token,
          refresh_token,
          expires_at,
          token_type,
          scope,
          id_token,
          session_state
        )
        values (
          ${account.userId},
          ${account.type},
          ${account.provider},
          ${account.providerAccountId},
          ${accessToken},
          ${refreshToken},
          ${expiresAt},
          ${tokenType},
          ${scope},
          ${idToken},
          ${sessionState}
        )
        on conflict (provider, provider_account_id)
        do update set
          user_id = excluded.user_id,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          expires_at = excluded.expires_at,
          token_type = excluded.token_type,
          scope = excluded.scope,
          id_token = excluded.id_token,
          session_state = excluded.session_state
      `;
      return account;
    },
    async unlinkAccount(account) {
      await sql`
        delete from nextauth_accounts
        where provider = ${account.provider}
          and provider_account_id = ${account.providerAccountId}
      `;
    },
    async createSession(session) {
      const [created] = await sql<{
        session_token: string;
        user_id: string;
        expires: Date;
      }[]>`
        insert into nextauth_sessions (session_token, user_id, expires)
        values (${session.sessionToken}, ${session.userId}, ${session.expires})
        returning session_token, user_id, expires
      `;

      if (!created) {
        throw new Error('Failed to create session.');
      }

      return {
        sessionToken: created.session_token,
        userId: created.user_id,
        expires: created.expires,
      };
    },
    async getSessionAndUser(sessionToken) {
      const [result] = await sql<{
        session_token: string;
        expires: Date;
        user_id: string;
        user_name: string | null;
        user_email: string;
      }[]>`
        select
          s.session_token,
          s.expires,
          u.id as user_id,
          u.name as user_name,
          u.email as user_email
        from nextauth_sessions s
        join users u on u.id = s.user_id
        where s.session_token = ${sessionToken}
        limit 1
      `;

      if (!result) {
        return null;
      }

      return {
        session: {
          sessionToken: result.session_token,
          userId: result.user_id,
          expires: result.expires,
        },
        user: {
          id: result.user_id,
          name: result.user_name,
          email: result.user_email,
          emailVerified: null,
          image: null,
        },
      };
    },
    async updateSession(session) {
      if (!session.sessionToken || !session.expires) {
        return null;
      }

      const [updated] = await sql<{
        session_token: string;
        user_id: string;
        expires: Date;
      }[]>`
        update nextauth_sessions
        set expires = ${session.expires}
        where session_token = ${session.sessionToken}
        returning session_token, user_id, expires
      `;

      if (!updated) {
        return null;
      }

      return {
        sessionToken: updated.session_token,
        userId: updated.user_id,
        expires: updated.expires,
      };
    },
    async deleteSession(sessionToken) {
      await sql`
        delete from nextauth_sessions
        where session_token = ${sessionToken}
      `;
    },
    async createVerificationToken(token) {
      return token;
    },
    async useVerificationToken() {
      return null;
    },
  };
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
      authorization: {
        params: {
          prompt: 'select_account consent',
          access_type: 'offline',
          include_granted_scopes: 'true',
        },
      },
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
          prompt: 'login',
          scope: 'read:user user:email',
        },
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PostgresAuthAdapter(),
  session: {
    strategy: 'jwt',
  },
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
        }[]>`
          select id
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
        }
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
