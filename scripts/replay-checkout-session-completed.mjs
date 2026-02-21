#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

function usage() {
  console.error(
    "Usage: node scripts/replay-checkout-session-completed.mjs <event-json-path>",
  );
}

function normalizePlan(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  return ["solo", "pro", "studio"].includes(value) ? value : null;
}

function normalizeInterval(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "monthly") return "monthly";
  if (value === "annual" || value === "yearly") return "annual";
  return null;
}

function readObjectId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return typeof value.id === "string" ? value.id : null;
}

async function resolveWorkspaceId(sql, session) {
  const metadataWorkspaceId = session?.metadata?.workspaceId?.trim() || null;
  if (metadataWorkspaceId) {
    const rows = await sql`
      select id
      from public.workspaces
      where id = ${metadataWorkspaceId}
      limit 1
    `;
    if (rows.length > 0) return metadataWorkspaceId;
  }

  const userId = session?.metadata?.userId?.trim() || null;
  if (!userId) return null;

  const activeRows = await sql`
    select w.id as workspace_id
    from public.users u
    left join public.workspaces w on w.id = u.active_workspace_id
    where u.id = ${userId}
    limit 1
  `;
  const activeWorkspaceId = activeRows[0]?.workspace_id ?? null;
  if (activeWorkspaceId) return activeWorkspaceId;

  const ownedRows = await sql`
    select id
    from public.workspaces
    where owner_user_id = ${userId}
    order by created_at asc
    limit 2
  `;
  if (ownedRows.length === 1) return ownedRows[0].id;
  return null;
}

const payloadPath = process.argv[2];
if (!payloadPath) {
  usage();
  process.exit(1);
}

const absolutePath = path.resolve(process.cwd(), payloadPath);
const raw = fs.readFileSync(absolutePath, "utf8");
const event = JSON.parse(raw);

assert.equal(event?.type, "checkout.session.completed");
assert.equal(event?.data?.object?.mode, "subscription");
assert.equal(event?.data?.object?.payment_status, "paid");
assert.ok(readObjectId(event?.data?.object?.subscription));

if (!process.env.POSTGRES_URL) {
  throw new Error("POSTGRES_URL is required");
}

const sql = postgres(process.env.POSTGRES_URL, { ssl: "require" });

try {
  const session = event.data.object;
  const workspaceId = await resolveWorkspaceId(sql, session);
  assert.ok(
    workspaceId,
    "Could not resolve workspace from metadata.workspaceId or metadata.userId fallback",
  );

  const plan = normalizePlan(session?.metadata?.plan);
  assert.ok(plan, "metadata.plan must be one of solo/pro/studio");
  const interval = normalizeInterval(session?.metadata?.interval);

  const subscriptionId = readObjectId(session.subscription);
  const customerId = readObjectId(session.customer);
  const latestInvoiceId = readObjectId(session.invoice);

  const inserted = await sql`
    insert into public.billing_events (
      workspace_id,
      user_email,
      event_type,
      stripe_event_id,
      stripe_object_id,
      status,
      meta
    )
    values (
      ${workspaceId},
      ${session?.metadata?.userEmail ?? null},
      ${event.type},
      ${event.id},
      ${session.id ?? null},
      'active',
      ${sql.json({
        plan,
        interval,
        livemode: Boolean(event.livemode),
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        latestInvoiceId,
      })}
    )
    on conflict do nothing
    returning id
  `;
  if (inserted.length === 0) {
    console.log(`Deduped: billing_events already has stripe_event_id=${event.id}`);
    process.exit(0);
  }

  const updated = await sql`
    update public.users u
    set
      plan = ${plan},
      is_pro = true,
      stripe_subscription_id = ${subscriptionId},
      stripe_customer_id = coalesce(${customerId}, u.stripe_customer_id),
      subscription_status = 'active'
    from public.workspaces w
    where w.id = ${workspaceId}
      and u.id = w.owner_user_id
    returning u.id, u.email, u.plan, u.subscription_status, u.stripe_subscription_id
  `;

  assert.equal(updated.length, 1, "Expected exactly one workspace owner to be updated");
  assert.equal(updated[0].plan, plan, "Plan mismatch after update");
  assert.equal(updated[0].subscription_status, "active", "Status mismatch after update");
  assert.equal(
    updated[0].stripe_subscription_id,
    subscriptionId,
    "stripe_subscription_id mismatch after update",
  );

  console.log("Replay OK");
  console.log(`workspaceId=${workspaceId}`);
  console.log(`ownerUserId=${updated[0].id}`);
  console.log(`plan=${updated[0].plan}`);
  console.log(`interval=${interval ?? "null"}`);
} finally {
  await sql.end({ timeout: 5 });
}
