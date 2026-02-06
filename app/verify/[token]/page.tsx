import Link from 'next/link';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

type PageProps = {
  params: Promise<{ token?: string }>;
};

function VerificationCard({
  title,
  message,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  message: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-center shadow-[0_18px_35px_rgba(0,0,0,0.45)]">
        <h1 className="text-2xl font-semibold text-slate-100">{title}</h1>
        <p className="mt-3 text-sm text-slate-300">{message}</p>
        <Link
          href={ctaHref}
          className="mt-6 inline-flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 transition duration-200 ease-out hover:border-slate-500 hover:bg-slate-900/80 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          {ctaLabel}
        </Link>
      </div>
    </main>
  );
}

export default async function Page(props: PageProps) {
  const params = await props.params;
  const token = params?.token?.trim();

  if (!token) {
    return (
      <VerificationCard
        title="Invalid verification link"
        message="This verification link is invalid or incomplete."
        ctaLabel="Back to login"
        ctaHref="/login"
      />
    );
  }

  const [user] = await sql<{ id: string }[]>`
    select id
    from public.users
    where verification_token = ${token}
    limit 1
  `;

  if (!user) {
    return (
      <VerificationCard
        title="Invalid or expired verification link"
        message="This verification link is no longer valid. Please request a new one."
        ctaLabel="Back to login"
        ctaHref="/login"
      />
    );
  }

  // Clear verification timestamps once the token is consumed.
  await sql`
    update public.users
    set is_verified = true,
        verification_token = null,
        verification_sent_at = null
    where id = ${user.id}
  `;

  return (
    <VerificationCard
      title="Email verified"
      message="Your email has been verified. You can now use Lateless normally."
      ctaLabel="Go to dashboard"
      ctaHref="/dashboard"
    />
  );
}
