import postgres from 'postgres';
import { redirect } from 'next/navigation';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

type PageProps = { params: Promise<{ token?: string }> };

export default async function Page(props: PageProps) {
  const params = await props.params;
  const token = params?.token?.trim();

  if (!token) {
    redirect('/login?verified=already');
  }

  let target = '/login?verified=already';

  try {
    const [user] = await sql<{ id: string }[]>`
      select id
      from public.users
      where verification_token = ${token}
        and verification_sent_at is not null
        and verification_sent_at >= now() - interval '24 hours'
      limit 1
    `;

    if (user) {
      await sql`
        update public.users
        set is_verified = true,
            verification_token = null,
            verification_sent_at = null
        where id = ${user.id}
      `;
      target = '/login?verified=success';
    }
  } catch (error) {
    console.error('Verification failed:', error);
  }

  redirect(target);
}
