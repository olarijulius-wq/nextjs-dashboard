import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export type FunnelEventName =
  | 'signup_completed'
  | 'company_saved'
  | 'customer_created'
  | 'invoice_created'
  | 'invoice_sent'
  | 'first_reminder_sent'
  | 'billing_opened'
  | 'checkout_started'
  | 'subscription_active';

const EVENT_NAMES: FunnelEventName[] = [
  'signup_completed',
  'company_saved',
  'customer_created',
  'invoice_created',
  'invoice_sent',
  'first_reminder_sent',
  'billing_opened',
  'checkout_started',
  'subscription_active',
];

const EVENT_NAME_SET = new Set<FunnelEventName>(EVENT_NAMES);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function hasRecentEvent(
  userEmail: string,
  eventName: FunnelEventName,
  windowMinutes: number,
) {
  const [row] = await sql<{ count: string }[]>`
    select count(*)::text as count
    from public.funnel_events
    where lower(user_email) = ${normalizeEmail(userEmail)}
      and event_name = ${eventName}
      and event_at >= now() - (${windowMinutes}::int * interval '1 minute')
  `;

  return Number(row?.count ?? '0') > 0;
}

async function hasAnyEvent(userEmail: string, eventName: FunnelEventName) {
  const [row] = await sql<{ count: string }[]>`
    select count(*)::text as count
    from public.funnel_events
    where lower(user_email) = ${normalizeEmail(userEmail)}
      and event_name = ${eventName}
  `;

  return Number(row?.count ?? '0') > 0;
}

export async function logFunnelEvent(input: {
  userEmail: string;
  eventName: FunnelEventName;
  source?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const userEmail = normalizeEmail(input.userEmail);
  const eventName = input.eventName;
  const source = input.source?.trim() ? input.source.trim() : null;
  const meta = input.meta ?? {};

  if (!userEmail || !EVENT_NAME_SET.has(eventName)) {
    return;
  }

  try {
    if (
      eventName === 'billing_opened' &&
      (await hasRecentEvent(userEmail, eventName, 30))
    ) {
      return;
    }

    if (
      eventName === 'first_reminder_sent' &&
      (await hasRecentEvent(userEmail, eventName, 24 * 60))
    ) {
      return;
    }

    if (
      eventName === 'subscription_active' &&
      (await hasAnyEvent(userEmail, eventName))
    ) {
      return;
    }

    await sql`
      with user_context as (
        select active_workspace_id
        from public.users
        where lower(email) = ${userEmail}
        limit 1
      )
      insert into public.funnel_events (
        user_email,
        workspace_id,
        event_name,
        source,
        meta
      )
      select
        ${userEmail},
        (select active_workspace_id from user_context),
        ${eventName},
        ${source},
        ${JSON.stringify(meta)}::jsonb
    `;
  } catch (error) {
    console.error(`Failed to log funnel event (${eventName}):`, error);
  }
}
