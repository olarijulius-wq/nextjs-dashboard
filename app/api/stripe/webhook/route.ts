// app/api/stripe/webhook/route.ts
// Local test note:
// stripe payment_intents create --amount 50 --currency eur --payment-method pm_card_visa --confirm true --metadata invoiceId=<invoice_id> --stripe-account <acct_id>
// Confirm the invoice stays pending when amount/currency does not match.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { sql } from "@/app/lib/db";
import {
  resolvePaidPlanFromStripe,
} from "@/app/lib/config";
import { allowedPayStatuses, canPayInvoiceStatus } from "@/app/lib/invoice-status";
import { logFunnelEvent } from "@/app/lib/funnel-events";
import { stripe } from "@/app/lib/stripe";
import {
  readLegacyWorkspaceIdFromStripeMetadata,
  readWorkspaceIdFromStripeMetadata,
} from "@/app/lib/stripe-workspace-metadata";
import {
  assertStripeConfig,
  createStripeRequestVerifier,
  normalizeStripeConfigError,
} from "@/app/lib/stripe-guard";
import {
  insertBillingEvent,
  logRecoveryEmailFailure,
  maybeSendRecoveryEmailForWorkspace,
  normalizeBillingStatus,
  upsertDunningStateFromStripeSignal,
} from "@/app/lib/billing-dunning";
import {
  applyPlanSync,
  readCanonicalWorkspacePlanSource,
} from "@/app/lib/billing-sync";
import { upsertWorkspaceBilling } from "@/app/lib/workspace-billing";
import { enforceRateLimit } from "@/app/lib/security/api-guard";

export const runtime = "nodejs";

const DEBUG = process.env.DEBUG_STRIPE_WEBHOOK === "true";
const IS_PRODUCTION =
  process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
const BILLING_EVENTS_DEDUPE_TYPES = new Set([
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.paid",
  "customer.subscription.created",
  "customer.subscription.updated",
]);

function debugLog(...args: unknown[]) {
  if (DEBUG) console.log(...args);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseStripeId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  const candidate = value as { id?: unknown };
  return typeof candidate.id === "string" ? candidate.id : null;
}

type BillingContextHints = {
  metadataWorkspaceId?: string | null;
  legacyWorkspaceId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
};

type BillingWorkspaceContext = {
  workspaceId: string;
  userEmail: string | null;
};

function readStripeObjectId(event: Stripe.Event): string | null {
  const candidate = event.data.object as { id?: unknown } | null | undefined;
  if (!candidate || typeof candidate.id !== "string") {
    return null;
  }
  const normalized = candidate.id.trim();
  return normalized ? normalized : null;
}

function logMissingWorkspaceMetadata(input: {
  event: Stripe.Event;
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  console.warn("[stripe webhook] workspace_id missing; ignoring billing sync", {
    eventId: input.event.id,
    eventType: input.event.type,
    customerId: input.customerId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    message: "workspace_id missing; ignoring billing sync",
  });
}

async function resolveBillingWorkspaceContext(
  input: {
    event: Stripe.Event;
    hints: BillingContextHints;
  },
): Promise<BillingWorkspaceContext | null> {
  const workspaceHint = input.hints.metadataWorkspaceId?.trim() || null;
  if (workspaceHint) {
    const rows = await sql<{ workspace_id: string; user_email: string | null }[]>`
      select
        w.id as workspace_id,
        u.email as user_email
      from public.workspaces w
      join public.users u on u.id = w.owner_user_id
      where w.id = ${workspaceHint}
      limit 1
    `;
    const row = rows[0];
    if (row?.workspace_id) {
      return {
        workspaceId: row.workspace_id,
        userEmail: row.user_email ? normalizeEmail(row.user_email) : null,
      };
    }
  }

  if (IS_PRODUCTION) {
    logMissingWorkspaceMetadata({
      event: input.event,
      customerId: input.hints.customerId ?? null,
      subscriptionId: input.hints.subscriptionId ?? null,
    });
    return null;
  }

  console.warn("[stripe webhook] workspace_id missing; using non-production fallback", {
    eventId: input.event.id,
    eventType: input.event.type,
    customerId: input.hints.customerId ?? null,
    subscriptionId: input.hints.subscriptionId ?? null,
    metadataWorkspaceId: input.hints.metadataWorkspaceId ?? null,
    legacyWorkspaceId: input.hints.legacyWorkspaceId ?? null,
  });

  const legacyWorkspaceHint = input.hints.legacyWorkspaceId?.trim() || null;
  if (legacyWorkspaceHint) {
    const rows = await sql<{ workspace_id: string; user_email: string | null }[]>`
      select
        w.id as workspace_id,
        u.email as user_email
      from public.workspaces w
      join public.users u on u.id = w.owner_user_id
      where w.id = ${legacyWorkspaceHint}
      limit 1
    `;
    const row = rows[0];
    if (row?.workspace_id) {
      return {
        workspaceId: row.workspace_id,
        userEmail: row.user_email ? normalizeEmail(row.user_email) : null,
      };
    }
  }

  const byCustomer = input.hints.customerId?.trim() || null;
  if (byCustomer) {
    const rows = await sql<{ workspace_id: string | null; user_email: string | null }[]>`
      select
        wb.workspace_id,
        u.email as user_email
      from public.workspace_billing wb
      join public.workspaces w on w.id = wb.workspace_id
      join public.users u on u.id = w.owner_user_id
      where wb.stripe_customer_id = ${byCustomer}
      limit 1
    `;
    const row = rows[0];
    if (row?.workspace_id) {
      return {
        workspaceId: row.workspace_id,
        userEmail: row.user_email ? normalizeEmail(row.user_email) : null,
      };
    }
  }

  const userIdHint = input.hints.userId?.trim() || null;
  if (userIdHint) {
    const rows = await sql<{ workspace_id: string | null; user_email: string | null }[]>`
      select
        coalesce(u.active_workspace_id, w.id) as workspace_id,
        u.email as user_email
      from public.users u
      left join public.workspaces w on w.owner_user_id = u.id
      where u.id = ${userIdHint}
      limit 1
    `;
    const row = rows[0];
    if (row?.workspace_id) {
      return {
        workspaceId: row.workspace_id,
        userEmail: row.user_email ? normalizeEmail(row.user_email) : null,
      };
    }
  }

  return null;
}

async function reconcileBillingRecoveryForEvent(input: {
  event: Stripe.Event;
  status: string | null;
  paymentFailedSignal: boolean;
  paymentSucceededSignal: boolean;
  hints: BillingContextHints;
}): Promise<void> {
  const context = await resolveBillingWorkspaceContext({
    event: input.event,
    hints: input.hints,
  });
  if (!context?.workspaceId) {
    return;
  }
  const stripeObjectId = readStripeObjectId(input.event);
  const normalizedStatus = normalizeBillingStatus(input.status);

  let transitionIntoRecovery = false;
  let resolvedStatus = normalizedStatus;

  const update = await upsertDunningStateFromStripeSignal({
    workspaceId: context.workspaceId,
    userEmail: input.hints.userEmail ?? context.userEmail,
    status: input.status,
    paymentFailedSignal: input.paymentFailedSignal,
    paymentSucceededSignal: input.paymentSucceededSignal,
  });
  transitionIntoRecovery = update.transitionedIntoRecovery;
  resolvedStatus = update.current.subscriptionStatus;

  await insertBillingEvent({
    workspaceId: context.workspaceId,
    userEmail: input.hints.userEmail ?? context.userEmail ?? null,
    eventType: input.event.type,
    stripeEventId: input.event.id,
    stripeObjectId,
    status: resolvedStatus,
    meta: {
      account: input.event.account ?? null,
      livemode: input.event.livemode,
      paymentFailedSignal: input.paymentFailedSignal,
      paymentSucceededSignal: input.paymentSucceededSignal,
      rawStatus: input.status ?? null,
    },
  });

  if (transitionIntoRecovery) {
    try {
      await maybeSendRecoveryEmailForWorkspace({
        workspaceId: context.workspaceId,
      });
    } catch (error) {
      const message = stringifyErrorMessage(error);
      console.error("[billing recovery] failed to send recovery email", {
        eventId: input.event.id,
        workspaceId: context.workspaceId,
        message,
      });
      await logRecoveryEmailFailure({
        workspaceId: context.workspaceId,
        userEmail: context.userEmail,
        error: message,
      });
    }
  }
}

function parseCustomerId(
  customer:
    | Stripe.Subscription["customer"]
    | Stripe.Checkout.Session["customer"]
    | null
    | undefined,
): string | null {
  return parseStripeId(customer);
}

function readInvoiceReferenceId(
  invoice:
    | Stripe.Checkout.Session["invoice"]
    | Stripe.Subscription["latest_invoice"]
    | Stripe.Invoice["id"]
    | null
    | undefined,
): string | null {
  return parseStripeId(invoice);
}

function toStoredBillingInterval(
  value: string | null | undefined,
): "monthly" | "annual" | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "monthly") return "monthly";
  if (normalized === "annual" || normalized === "yearly") return "annual";
  return null;
}

function captureBillingBusinessException(
  error: unknown,
  input: {
    event: Stripe.Event;
    sessionId?: string | null;
    subscriptionId?: string | null;
    userId?: string | null;
    workspaceId?: string | null;
  },
) {
  Sentry.captureException(error, {
    tags: {
      "event.type": input.event.type,
      livemode: String(input.event.livemode),
      "session.id": input.sessionId ?? "none",
      "subscription.id": input.subscriptionId ?? "none",
      userId: input.userId ?? "none",
      workspaceId: input.workspaceId ?? "none",
    },
    extra: {
      eventId: input.event.id,
      account: input.event.account ?? null,
    },
  });
}

async function resolveWorkspaceOwnerUserId(workspaceId: string): Promise<string | null> {
  const rows = await sql<{ owner_user_id: string }[]>`
    select owner_user_id
    from public.workspaces
    where id = ${workspaceId}
    limit 1
  `;
  return rows[0]?.owner_user_id ?? null;
}

async function syncPlanSnapshotAndCheckEffectiveness(input: {
  event: Stripe.Event;
  workspaceId: string;
  userId: string | null;
  plan: string | null;
  interval: "monthly" | "annual" | null;
  subscriptionId: string | null;
  customerId: string | null;
  latestInvoiceId: string | null;
  status: string;
}): Promise<{
  effective: boolean;
  wrote: {
    users: { matched: number; updated: number };
    workspaces: { matched: number; updated: number };
    membership: { matched: number; updated: number };
  };
  readback: {
    userPlan?: string | null;
    workspacePlan?: string | null;
    membershipPlan?: string | null;
    activeWorkspaceId?: string | null;
  };
}> {
  const ownerUserId =
    input.userId?.trim() || (await resolveWorkspaceOwnerUserId(input.workspaceId)) || "";
  let normalizedPlan = (input.plan ?? "").trim().toLowerCase();
  if (!normalizedPlan) {
    const fallback = await readCanonicalWorkspacePlanSource({
      workspaceId: input.workspaceId,
      userId: ownerUserId,
    });
    normalizedPlan = (fallback.value ?? "").trim().toLowerCase() || "free";
  }
  const normalizedWorkspaceId = input.workspaceId.trim();
  const normalizedUserId = ownerUserId.trim();
  if (!normalizedWorkspaceId || !normalizedPlan || !normalizedUserId) {
    console.warn("[stripe webhook] plan sync skipped due to missing required context", {
      eventId: input.event.id,
      eventType: input.event.type,
      workspaceId: normalizedWorkspaceId || null,
      userId: normalizedUserId || null,
      plan: normalizedPlan || null,
    });
    return {
      effective: false,
      wrote: {
        users: { matched: 0, updated: 0 },
        workspaces: { matched: 0, updated: 0 },
        membership: { matched: 0, updated: 0 },
      },
      readback: {
        userPlan: null,
        workspacePlan: null,
        membershipPlan: null,
        activeWorkspaceId: null,
      },
    };
  }

  const synced = await applyPlanSync({
    workspaceId: normalizedWorkspaceId,
    userId: normalizedUserId,
    plan: normalizedPlan,
    interval: input.interval,
    stripeCustomerId: input.customerId,
    stripeSubscriptionId: input.subscriptionId,
    subscriptionStatus: input.status,
    livemode: input.event.livemode,
    latestInvoiceId: input.latestInvoiceId,
    source: input.event.type,
    stripeEventIdOrReconcileKey: input.event.id,
  });

  const effective =
    synced.readback.workspacePlan === normalizedPlan;

  await sql`
    update public.billing_events
    set
      workspace_id = ${input.workspaceId},
      status = ${input.status},
      meta = coalesce(meta, '{}'::jsonb) || ${JSON.stringify({
        plan: normalizedPlan,
        interval: input.interval,
        stripeSubscriptionId: input.subscriptionId,
        stripeCustomerId: input.customerId,
        latestInvoiceId: input.latestInvoiceId,
        livemode: input.event.livemode,
        sync: {
          effective,
          wrote: synced.wrote,
          readback: synced.readback,
        },
      })}::jsonb
    where stripe_event_id = ${input.event.id}
  `;

  if (!effective) {
    Sentry.captureException(new Error("PLAN_SYNC_NO_EFFECT"), {
      tags: {
        "event.type": input.event.type,
        livemode: String(input.event.livemode),
        workspaceId: normalizedWorkspaceId,
      },
      extra: {
        eventId: input.event.id,
        userId: normalizedUserId || null,
        plan: normalizedPlan,
        wrote: synced.wrote,
        readback: synced.readback,
      },
    });
    console.warn("[stripe webhook] plan sync had no effect", {
      eventId: input.event.id,
      eventType: input.event.type,
      workspaceId: normalizedWorkspaceId,
      userId: normalizedUserId || null,
      plan: normalizedPlan,
      wrote: synced.wrote,
      readback: synced.readback,
    });
  }

  return {
    effective,
    wrote: synced.wrote,
    readback: synced.readback,
  };
}

function isStripeResourceMissing404(err: any): boolean {
  return (
    err?.statusCode === 404 &&
    err?.code === "resource_missing" &&
    typeof err?.message === "string"
  );
}

function readInvoiceIdFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): string | null {
  const invoiceId = metadata?.invoiceId ?? metadata?.invoice_id;
  return typeof invoiceId === "string" && invoiceId.trim() ? invoiceId.trim() : null;
}

function readPaymentIntentId(
  paymentIntent: Stripe.Checkout.Session["payment_intent"] | null | undefined,
): string | null {
  if (!paymentIntent) return null;
  if (typeof paymentIntent === "string") return paymentIntent;
  return typeof paymentIntent.id === "string" ? paymentIntent.id : null;
}

function stringifyErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.length > 2000 ? raw.slice(0, 2000) : raw;
}

function revalidateInvoicePaths(invoiceId: string) {
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
}

async function findInvoiceIdByCheckoutSessionId(
  checkoutSessionId: string,
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id
    from invoices
    where stripe_checkout_session_id = ${checkoutSessionId}
    limit 1
  `;
  return rows[0]?.id ?? null;
}

async function findInvoiceIdByPaymentIntentId(
  paymentIntentId: string,
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id
    from invoices
    where stripe_payment_intent_id = ${paymentIntentId}
    limit 1
  `;
  return rows[0]?.id ?? null;
}

async function retrievePaymentIntentWithAccountContext(
  paymentIntentId: string,
  eventAccount?: string,
): Promise<Stripe.PaymentIntent | null> {
  try {
    return await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {},
      eventAccount ? { stripeAccount: eventAccount } : undefined,
    );
  } catch (err: any) {
    if (isStripeResourceMissing404(err)) {
      debugLog(
        "[stripe webhook] payment_intent retrieve resource_missing (ignored)",
        {
          paymentIntentId,
          eventAccount: eventAccount ?? null,
          code: err?.code,
          statusCode: err?.statusCode,
          message: err?.message,
        },
      );
      return null;
    }
    throw err;
  }
}

async function retrieveCheckoutSessionByPaymentIntentWithAccountContext(
  paymentIntentId: string,
  eventAccount?: string,
): Promise<Stripe.Checkout.Session | null> {
  try {
    const list = await stripe.checkout.sessions.list(
      { payment_intent: paymentIntentId, limit: 1 },
      eventAccount ? { stripeAccount: eventAccount } : undefined,
    );
    return list.data[0] ?? null;
  } catch (err: any) {
    if (isStripeResourceMissing404(err)) {
      return null;
    }
    throw err;
  }
}

async function retrieveChargeWithAccountContext(
  chargeId: string,
  eventAccount?: string,
): Promise<Stripe.Charge | null> {
  try {
    return await stripe.charges.retrieve(
      chargeId,
      eventAccount ? { stripeAccount: eventAccount } : undefined,
    );
  } catch (err: any) {
    if (isStripeResourceMissing404(err)) {
      debugLog("[stripe webhook] charge retrieve resource_missing (ignored)", {
        chargeId,
        eventAccount: eventAccount ?? null,
        code: err?.code,
        statusCode: err?.statusCode,
        message: err?.message,
      });
      return null;
    }
    throw err;
  }
}

async function retrieveChargeWithBalanceTransactionWithAccountContext(
  chargeId: string,
  eventAccount?: string,
): Promise<Stripe.Charge | null> {
  try {
    return await stripe.charges.retrieve(
      chargeId,
      { expand: ["balance_transaction"] },
      eventAccount ? { stripeAccount: eventAccount } : undefined,
    );
  } catch (err: any) {
    if (isStripeResourceMissing404(err)) {
      debugLog(
        "[stripe webhook] charge retrieve with balance_transaction resource_missing (ignored)",
        {
          chargeId,
          eventAccount: eventAccount ?? null,
          code: err?.code,
          statusCode: err?.statusCode,
          message: err?.message,
        },
      );
      return null;
    }
    throw err;
  }
}

async function findInvoiceStatusById(invoiceId: string): Promise<string | null> {
  const rows = await sql<{ status: string }[]>`
    select status
    from invoices
    where id = ${invoiceId}
    limit 1
  `;
  return rows[0]?.status ?? null;
}

type InvoiceMutationByInvoiceIdInput = {
  invoiceId: string;
  eventAccount?: string | null;
  amount: number | null | undefined;
  currency: string | null | undefined;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  chargeId?: string | null;
  disputeId?: string | null;
};

type InvoiceMutationByInvoiceIdResult =
  | { ok: true; invoice: InvoiceValidationRow }
  | {
      ok: false;
      reason: string;
      invoice?: InvoiceValidationRow;
    };

type InvoiceValidationRow = {
  id: string;
  status: string;
  amount: number;
  payable_amount: number | null;
  currency: string | null;
  workspace_id: string | null;
  owner_email: string | null;
  user_email: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  owner_connect_account_id: string | null;
  workspace_owner_connect_account_id: string | null;
};

function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

type InvoiceMoneyValidationRow = {
  id: string;
  amount: number;
  payable_amount: number | null;
  currency: string | null;
  owner_stripe_connect_account_id: string | null;
};

type InvoiceForValidation = {
  expectedChargeAmount: number;
  currency: string | null;
  ownerStripeConnectAccountId: string | null;
};

type StripeMoney = {
  amount: number | null;
  currency: string | null;
};

async function loadInvoiceForValidation(
  invoiceId: string,
): Promise<InvoiceForValidation | null> {
  const rows = await sql<InvoiceMoneyValidationRow[]>`
    select
      i.id,
      i.amount,
      i.payable_amount,
      i.currency,
      coalesce(
        w_active_owner.stripe_connect_account_id,
        w_owner_owner.stripe_connect_account_id,
        u.stripe_connect_account_id
      ) as owner_stripe_connect_account_id
    from invoices i
    left join public.users u
      on lower(u.email) = lower(i.user_email)
    left join public.workspaces w_active
      on w_active.id = u.active_workspace_id
    left join public.users w_active_owner
      on w_active_owner.id = w_active.owner_user_id
    left join public.workspaces w_owner
      on w_owner.owner_user_id = u.id
    left join public.users w_owner_owner
      on w_owner_owner.id = w_owner.owner_user_id
    where i.id = ${invoiceId}
    limit 1
  `;
  const invoice = rows[0];
  if (!invoice) return null;
  return {
    expectedChargeAmount:
      typeof invoice.payable_amount === "number"
        ? invoice.payable_amount
        : invoice.amount,
    currency: invoice.currency,
    ownerStripeConnectAccountId: invoice.owner_stripe_connect_account_id,
  };
}

function extractStripeMoneyFromEvent(
  obj: Stripe.Checkout.Session | Stripe.PaymentIntent | Stripe.Charge | null | undefined,
): StripeMoney {
  if (!obj) return { amount: null, currency: null };
  const candidate = obj as any;
  const currency = typeof candidate.currency === "string" ? candidate.currency : null;
  if (typeof candidate.amount_total === "number") {
    return { amount: candidate.amount_total, currency };
  }
  if (typeof candidate.amount === "number") {
    return { amount: candidate.amount, currency };
  }
  return { amount: null, currency };
}

function validateInvoiceMutation({
  invoice,
  stripeMoney,
  eventAccount,
}: {
  invoice: InvoiceForValidation | null;
  stripeMoney: StripeMoney;
  eventAccount?: string | null;
}): { ok: boolean; reason: string } {
  if (!invoice) return { ok: false, reason: "invoice not found" };

  if (typeof stripeMoney.amount !== "number" || !Number.isInteger(stripeMoney.amount)) {
    return { ok: false, reason: "stripe amount missing or not an integer" };
  }
  if (invoice.expectedChargeAmount !== stripeMoney.amount) {
    return { ok: false, reason: "amount mismatch" };
  }

  const invoiceCurrency = normalizeCurrency(invoice.currency);
  const stripeCurrency = normalizeCurrency(stripeMoney.currency);
  if (!invoiceCurrency || !stripeCurrency || invoiceCurrency !== stripeCurrency) {
    return { ok: false, reason: "currency mismatch" };
  }

  const normalizedEventAccount = eventAccount?.trim() || null;
  if (normalizedEventAccount) {
    const expectedAccount = invoice.ownerStripeConnectAccountId?.trim() || null;
    if (!expectedAccount) {
      return {
        ok: false,
        reason: "missing invoice owner connect account mapping",
      };
    }
    if (expectedAccount !== normalizedEventAccount) {
      return { ok: false, reason: "connect account mismatch" };
    }
  }

  return { ok: true, reason: "ok" };
}

async function validatePaidMutationOrWarn({
  eventType,
  eventId,
  eventAccount,
  invoiceId,
  stripeObject,
  paymentIntentId,
  checkoutSessionId,
  chargeId,
}: {
  eventType: string;
  eventId: string;
  eventAccount?: string | null;
  invoiceId: string;
  stripeObject: Stripe.Checkout.Session | Stripe.PaymentIntent | Stripe.Charge;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  chargeId?: string | null;
}): Promise<boolean> {
  const invoice = await loadInvoiceForValidation(invoiceId);
  const stripeMoney = extractStripeMoneyFromEvent(stripeObject);
  const validation = validateInvoiceMutation({
    invoice,
    stripeMoney,
    eventAccount,
  });
  if (validation.ok) return true;

  console.warn("[stripe webhook] invoice mutation skipped after validation failure", {
    reason: validation.reason,
    eventType,
    eventId,
    eventAccount: eventAccount ?? null,
    invoiceId,
    amount: stripeMoney.amount ?? null,
    currency: stripeMoney.currency ?? null,
    paymentIntentId: paymentIntentId ?? null,
    checkoutSessionId: checkoutSessionId ?? null,
    chargeId: chargeId ?? null,
    disputeId: null,
  });
  return false;
}

async function validateInvoiceMutationByInvoiceId({
  invoiceId,
  eventAccount,
  amount,
  currency,
  paymentIntentId,
  checkoutSessionId,
  chargeId,
  disputeId,
}: InvoiceMutationByInvoiceIdInput): Promise<InvoiceMutationByInvoiceIdResult> {
  const rows = await sql<InvoiceValidationRow[]>`
    select
      i.id,
      i.status,
      i.amount,
      i.payable_amount,
      i.currency,
      coalesce(w_active.id, w_owner.id, u.active_workspace_id) as workspace_id,
      u.email as owner_email,
      i.user_email,
      i.stripe_checkout_session_id,
      i.stripe_payment_intent_id,
      u.stripe_connect_account_id as owner_connect_account_id,
      coalesce(
        w_active_owner.stripe_connect_account_id,
        w_owner_owner.stripe_connect_account_id
      ) as workspace_owner_connect_account_id
    from invoices i
    left join public.users u
      on lower(u.email) = lower(i.user_email)
    left join public.workspaces w_active
      on w_active.id = u.active_workspace_id
    left join public.users w_active_owner
      on w_active_owner.id = w_active.owner_user_id
    left join public.workspaces w_owner
      on w_owner.owner_user_id = u.id
    left join public.users w_owner_owner
      on w_owner_owner.id = w_owner.owner_user_id
    where i.id = ${invoiceId}
    limit 1
  `;

  const invoice = rows[0];
  if (!invoice) {
    const reason = "invoice not found";
    debugLog("[stripe webhook] invoice validation warning", {
      reason,
      invoiceId,
      eventAccount: eventAccount ?? null,
      paymentIntentId: paymentIntentId ?? null,
      checkoutSessionId: checkoutSessionId ?? null,
      chargeId: chargeId ?? null,
      disputeId: disputeId ?? null,
    });
    return { ok: false, reason };
  }

  if (typeof amount !== "number" || !Number.isInteger(amount)) {
    const reason = "stripe amount missing or not an integer";
    debugLog("[stripe webhook] invoice validation warning", {
      reason,
      invoiceId,
      eventAccount: eventAccount ?? null,
      paymentIntentId: paymentIntentId ?? null,
      checkoutSessionId: checkoutSessionId ?? null,
      chargeId: chargeId ?? null,
      disputeId: disputeId ?? null,
      stripeAmount: amount ?? null,
    });
    return { ok: false, reason, invoice };
  }

  const expectedAmount =
    typeof invoice.payable_amount === "number"
      ? invoice.payable_amount
      : invoice.amount;

  if (expectedAmount !== amount) {
    const reason = "amount mismatch";
    debugLog("[stripe webhook] invoice validation warning", {
      reason,
      invoiceId,
      eventAccount: eventAccount ?? null,
      paymentIntentId: paymentIntentId ?? null,
      checkoutSessionId: checkoutSessionId ?? null,
      chargeId: chargeId ?? null,
      disputeId: disputeId ?? null,
      invoiceAmount: expectedAmount,
      stripeAmount: amount,
    });
    return { ok: false, reason, invoice };
  }

  const invoiceCurrency = normalizeCurrency(invoice.currency);
  const stripeCurrency = normalizeCurrency(currency);
  if (!invoiceCurrency || !stripeCurrency || invoiceCurrency !== stripeCurrency) {
    const reason = "currency mismatch";
    debugLog("[stripe webhook] invoice validation warning", {
      reason,
      invoiceId,
      eventAccount: eventAccount ?? null,
      paymentIntentId: paymentIntentId ?? null,
      checkoutSessionId: checkoutSessionId ?? null,
      chargeId: chargeId ?? null,
      disputeId: disputeId ?? null,
      invoiceCurrency: invoice.currency ?? null,
      stripeCurrency: currency ?? null,
    });
    return { ok: false, reason, invoice };
  }

  const normalizedEventAccount = eventAccount?.trim() || null;
  if (normalizedEventAccount) {
    const expectedAccount =
      invoice.workspace_owner_connect_account_id?.trim() ||
      invoice.owner_connect_account_id?.trim() ||
      null;
    if (!expectedAccount) {
      const reason = "missing invoice owner connect account mapping";
      debugLog("[stripe webhook] invoice validation warning", {
        reason,
        invoiceId,
        eventAccount: normalizedEventAccount,
        paymentIntentId: paymentIntentId ?? null,
        checkoutSessionId: checkoutSessionId ?? null,
        chargeId: chargeId ?? null,
        disputeId: disputeId ?? null,
        ownerEmail: invoice.owner_email ?? invoice.user_email ?? null,
        workspaceId: invoice.workspace_id,
      });
      return { ok: false, reason, invoice };
    }
    if (expectedAccount !== normalizedEventAccount) {
      const reason = "connect account mismatch";
      debugLog("[stripe webhook] invoice validation warning", {
        reason,
        invoiceId,
        eventAccount: normalizedEventAccount,
        expectedAccount,
        paymentIntentId: paymentIntentId ?? null,
        checkoutSessionId: checkoutSessionId ?? null,
        chargeId: chargeId ?? null,
        disputeId: disputeId ?? null,
        ownerEmail: invoice.owner_email ?? invoice.user_email ?? null,
        workspaceId: invoice.workspace_id,
      });
      return { ok: false, reason, invoice };
    }
  }

  return { ok: true, invoice };
}

async function validateInvoiceMutationOrWarn({
  eventType,
  eventId,
  eventAccount,
  invoiceId,
  amount,
  currency,
  paymentIntentId,
  checkoutSessionId,
  chargeId,
  disputeId,
}: {
  eventType: string;
  eventId: string;
  eventAccount?: string | null;
  invoiceId: string;
  amount: number | null | undefined;
  currency: string | null | undefined;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  chargeId?: string | null;
  disputeId?: string | null;
}): Promise<boolean> {
  const validation = await validateInvoiceMutationByInvoiceId({
    invoiceId,
    eventAccount,
    amount,
    currency,
    paymentIntentId,
    checkoutSessionId,
    chargeId,
    disputeId,
  });
  if (validation.ok) return true;

  console.warn("[stripe webhook] invoice mutation skipped after validation failure", {
    reason: validation.reason,
    eventType,
    eventId,
    eventAccount: eventAccount ?? null,
    invoiceId,
    amount: amount ?? null,
    currency: currency ?? null,
    paymentIntentId: paymentIntentId ?? null,
    checkoutSessionId: checkoutSessionId ?? null,
    chargeId: chargeId ?? null,
    disputeId: disputeId ?? null,
  });
  return false;
}

async function resolveInvoiceIdFromPaymentIntent({
  paymentIntentId,
  eventAccount,
  intentMetadata,
}: {
  paymentIntentId: string;
  eventAccount?: string;
  intentMetadata?: Stripe.Metadata | null;
}): Promise<{ invoiceId: string | null; checkoutSessionId: string | null }> {
  let checkoutSessionId: string | null = null;
  let invoiceId = await findInvoiceIdByPaymentIntentId(paymentIntentId);

  if (!invoiceId) {
    const session = await retrieveCheckoutSessionByPaymentIntentWithAccountContext(
      paymentIntentId,
      eventAccount,
    );
    if (session) {
      checkoutSessionId = session.id ?? null;
      if (checkoutSessionId) {
        invoiceId = await findInvoiceIdByCheckoutSessionId(checkoutSessionId);
      }
      if (!invoiceId) {
        invoiceId = readInvoiceIdFromMetadata(session.metadata);
      }
    }
  }

  if (!invoiceId) {
    invoiceId = readInvoiceIdFromMetadata(intentMetadata);
  }

  if (!invoiceId) {
    const intent = await retrievePaymentIntentWithAccountContext(
      paymentIntentId,
      eventAccount,
    );
    if (intent) {
      invoiceId = readInvoiceIdFromMetadata(intent.metadata);
    }
  }

  return { invoiceId, checkoutSessionId };
}

async function markInvoicePaid({
  invoiceId,
  paymentIntentId,
  checkoutSessionId,
  eventId,
  eventAccount,
  eventType,
}: {
  invoiceId: string;
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  eventId: string;
  eventAccount?: string | null;
  eventType: string;
}): Promise<number> {
  const previousStatus = await findInvoiceStatusById(invoiceId);
  const updated = await sql`
    update invoices
    set
      status = 'paid',
      paid_at = coalesce(paid_at, now()),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${paymentIntentId ?? null}),
      stripe_checkout_session_id = coalesce(stripe_checkout_session_id, ${checkoutSessionId ?? null})
    where id = ${invoiceId}
      and status = any(${sql.array([...allowedPayStatuses])})
    returning id, status, paid_at, stripe_payment_intent_id, stripe_checkout_session_id
  `;

  const rowCount = updated.length;
  debugLog("[stripe webhook] invoice update", {
    eventType,
    eventId,
    eventAccount: eventAccount ?? null,
    invoiceId,
    checkoutSessionId: checkoutSessionId ?? null,
    paymentIntentId: paymentIntentId ?? null,
    rows: rowCount,
    invoice: updated[0] ?? null,
  });

  if (rowCount === 0) {
    const skipReason =
      previousStatus === null
        ? "invoice not found"
        : canPayInvoiceStatus(previousStatus)
          ? "no payable transition applied"
          : `status "${previousStatus}" is not payable`;
    debugLog("[stripe webhook] invoice update affected 0 rows", {
      eventType,
      eventId,
      eventAccount: eventAccount ?? null,
      invoiceId,
      checkoutSessionId: checkoutSessionId ?? null,
      paymentIntentId: paymentIntentId ?? null,
      previousStatus,
      reason: skipReason,
    });
  }

  if (rowCount > 0) {
    revalidateInvoicePaths(invoiceId);
  }

  return rowCount;
}

async function updateInvoiceActualFeeDetailsFromCharge({
  invoiceId,
  charge,
  eventId,
  eventType,
  eventAccount,
}: {
  invoiceId: string;
  charge: Stripe.Charge;
  eventId: string;
  eventType: string;
  eventAccount?: string | null;
}): Promise<void> {
  const normalizedEventAccount = eventAccount ?? undefined;
  const chargeWithBalanceTransaction =
    typeof charge.balance_transaction === "object" && charge.balance_transaction
      ? charge
      : await retrieveChargeWithBalanceTransactionWithAccountContext(
          charge.id,
          normalizedEventAccount,
        );

  const balanceTransaction = chargeWithBalanceTransaction?.balance_transaction;
  if (
    !chargeWithBalanceTransaction ||
    !balanceTransaction ||
    typeof balanceTransaction === "string"
  ) {
    debugLog("[stripe webhook] actual fee update skipped (no balance transaction)", {
      eventType,
      eventId,
      eventAccount: eventAccount ?? null,
      invoiceId,
      chargeId: charge.id,
    });
    return;
  }

  if (
    typeof chargeWithBalanceTransaction.amount !== "number" ||
    typeof balanceTransaction.fee !== "number" ||
    typeof balanceTransaction.net !== "number"
  ) {
    debugLog("[stripe webhook] actual fee update skipped (missing gross, fee, or net)", {
      eventType,
      eventId,
      eventAccount: eventAccount ?? null,
      invoiceId,
      chargeId: charge.id,
      gross: chargeWithBalanceTransaction.amount ?? null,
      fee: balanceTransaction.fee ?? null,
      stripeNet: balanceTransaction.net ?? null,
    });
    return;
  }

  const gross = chargeWithBalanceTransaction.amount;
  const processingFee = balanceTransaction.fee;
  const stripeNetAmount = balanceTransaction.net;
  const applicationFee =
    typeof chargeWithBalanceTransaction.application_fee_amount === "number"
      ? chargeWithBalanceTransaction.application_fee_amount
      : 0;
  const merchantNetAmount = stripeNetAmount - applicationFee;
  const processingFeeCurrency =
    normalizeCurrency(balanceTransaction.currency) ??
    normalizeCurrency(chargeWithBalanceTransaction.currency) ??
    null;
  const balanceTransactionId = balanceTransaction.id ?? null;

  const updated = await sql`
    update invoices
    set
      stripe_processing_fee_amount = ${processingFee},
      stripe_processing_fee_currency = ${processingFeeCurrency},
      stripe_balance_transaction_id = ${balanceTransactionId},
      stripe_net_amount = ${stripeNetAmount},
      merchant_net_amount = ${merchantNetAmount},
      net_received_amount = ${merchantNetAmount}
    where id = ${invoiceId}
    returning
      id,
      stripe_processing_fee_amount,
      stripe_processing_fee_currency,
      stripe_balance_transaction_id,
      stripe_net_amount,
      merchant_net_amount,
      net_received_amount
  `;

  debugLog("[stripe webhook] invoice actual fee update", {
    eventType,
    eventId,
    eventAccount: eventAccount ?? null,
    invoiceId,
    chargeId: charge.id,
    gross,
    processingFee,
    stripeNetAmount,
    applicationFee,
    merchantNetAmount,
    rows: updated.length,
    invoice: updated[0] ?? null,
  });

  if (updated.length > 0) {
    revalidateInvoicePaths(invoiceId);
  }
}

async function processEvent(event: Stripe.Event): Promise<void> {
  let resolvedInvoiceId: string | null = null;
  let invoiceUpdateRows = 0;
  let billingStatusSignal: string | null = null;
  let paymentFailedSignal = false;
  let paymentSucceededSignal = false;
  const billingContextHints: BillingContextHints = {};

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const metadataWorkspaceId = readWorkspaceIdFromStripeMetadata(session.metadata);
    const legacyWorkspaceId = readLegacyWorkspaceIdFromStripeMetadata(session.metadata);
    billingContextHints.userId = session.metadata?.userId ?? null;
    billingContextHints.userEmail =
      session.customer_email ||
      session.customer_details?.email ||
      session.metadata?.userEmail ||
      null;
    billingContextHints.customerId = parseCustomerId(session.customer);
    billingContextHints.subscriptionId =
      typeof session.subscription === "string" ? session.subscription : null;
    billingContextHints.metadataWorkspaceId = metadataWorkspaceId;
    billingContextHints.legacyWorkspaceId = legacyWorkspaceId;

    if (
      session.mode === "subscription" &&
      session.payment_status === "paid" &&
      typeof session.subscription === "string"
    ) {
      billingStatusSignal = "active";
      paymentSucceededSignal = true;

      try {
        const workspace = await resolveBillingWorkspaceContext({
          event,
          hints: {
            metadataWorkspaceId,
            legacyWorkspaceId,
            userId: session.metadata?.userId ?? null,
            userEmail: session.metadata?.userEmail ?? null,
            customerId: parseCustomerId(session.customer),
            subscriptionId: session.subscription,
          },
        });
        if (!workspace?.workspaceId) {
          captureBillingBusinessException(
            new Error("Unable to resolve workspace for checkout.session.completed"),
            {
              event,
              sessionId: session.id ?? null,
              subscriptionId: session.subscription,
              userId: session.metadata?.userId ?? null,
              workspaceId: metadataWorkspaceId ?? null,
            },
          );
          return;
        }

        const stripeSubscription = await stripe.subscriptions.retrieve(
          session.subscription,
          { expand: ["items.data.price"] },
        );
        const checkoutPrice = stripeSubscription.items?.data?.[0]?.price;
        const normalizedPlan = resolvePaidPlanFromStripe({
          metadataPlan: session.metadata?.plan ?? stripeSubscription.metadata?.plan ?? null,
          priceId: checkoutPrice?.id ?? null,
          priceLookupKey: checkoutPrice?.lookup_key ?? null,
        });
        const interval = toStoredBillingInterval(session.metadata?.interval ?? null);
        const customerId = parseCustomerId(stripeSubscription.customer ?? session.customer);
        const latestInvoiceId = readInvoiceReferenceId(session.invoice);

        const inserted = await insertBillingEvent({
          workspaceId: workspace.workspaceId,
          userEmail: session.metadata?.userEmail ?? workspace.userEmail ?? null,
          eventType: event.type,
          stripeEventId: event.id,
          stripeObjectId: session.id ?? null,
          status: "active",
          meta: {
            account: event.account ?? null,
            livemode: event.livemode,
            plan: normalizedPlan,
            interval,
            userId: session.metadata?.userId ?? null,
            workspaceId: workspace.workspaceId,
            stripeSubscriptionId: stripeSubscription.id,
            stripeCustomerId: customerId,
            latestInvoiceId,
          },
        });
        if (!inserted) {
          return;
        }

        await syncPlanSnapshotAndCheckEffectiveness({
          event,
          workspaceId: workspace.workspaceId,
          userId: session.metadata?.userId ?? null,
          plan: normalizedPlan,
          interval,
          subscriptionId: stripeSubscription.id,
          customerId,
          latestInvoiceId,
          status: "active",
        });

        const funnelEmail = session.metadata?.userEmail ?? workspace.userEmail ?? null;
        if (funnelEmail) {
          await logFunnelEvent({
            userEmail: funnelEmail,
            eventName: "subscription_active",
            source: "billing",
          });
        }
      } catch (error) {
        captureBillingBusinessException(error, {
          event,
          sessionId: session.id ?? null,
          subscriptionId:
            typeof session.subscription === "string" ? session.subscription : null,
          userId: session.metadata?.userId ?? null,
          workspaceId: metadataWorkspaceId ?? null,
        });
        return;
      }
    }

    const checkoutSessionId = session.id ?? null;
    const paymentIntentId = readPaymentIntentId(session.payment_intent);
    let invoiceId =
      checkoutSessionId
        ? await findInvoiceIdByCheckoutSessionId(checkoutSessionId)
        : null;

    if (!invoiceId) {
      invoiceId = readInvoiceIdFromMetadata(session.metadata);
    }

    if (!invoiceId && paymentIntentId) {
      invoiceId = await findInvoiceIdByPaymentIntentId(paymentIntentId);
    }

    if (!invoiceId) {
      debugLog(
        "[stripe webhook] checkout.session.completed missing invoiceId (ignored)",
        {
          checkoutSessionId: session.id,
          paymentIntentId,
        },
      );
      return;
    }

    debugLog("[stripe webhook] invoice resolution", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      checkoutSessionId,
      paymentIntentId,
      resolvedInvoiceId: invoiceId,
    });

    const isValid = await validatePaidMutationOrWarn({
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      stripeObject: session,
      paymentIntentId,
      checkoutSessionId,
    });
    if (!isValid) return;

    resolvedInvoiceId = invoiceId;
    invoiceUpdateRows = await markInvoicePaid({
      invoiceId,
      paymentIntentId,
      checkoutSessionId,
      eventId: event.id,
      eventAccount: event.account ?? null,
      eventType: event.type,
    });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const metadataWorkspaceId = readWorkspaceIdFromStripeMetadata(sub.metadata);
    const legacyWorkspaceId = readLegacyWorkspaceIdFromStripeMetadata(sub.metadata);

    const subscriptionId = sub.id;
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
    const status = String(sub.status).trim().toLowerCase();
    billingStatusSignal = status;
    billingContextHints.subscriptionId = sub.id;
    billingContextHints.customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
    billingContextHints.userId = sub.metadata?.userId ?? null;
    billingContextHints.userEmail = sub.metadata?.userEmail ?? null;
    billingContextHints.metadataWorkspaceId = metadataWorkspaceId;
    billingContextHints.legacyWorkspaceId = legacyWorkspaceId;
    const subscriptionPrice = sub.items?.data?.[0]?.price;
    const plan = resolvePaidPlanFromStripe({
      metadataPlan: sub.metadata?.plan ?? null,
      priceId: subscriptionPrice?.id ?? null,
      priceLookupKey: subscriptionPrice?.lookup_key ?? null,
    });
    const interval = toStoredBillingInterval(
      sub.items?.data?.[0]?.price?.recurring?.interval ?? null,
    );
    const latestInvoiceId = readInvoiceReferenceId(sub.latest_invoice);

    try {
      const workspace = await resolveBillingWorkspaceContext({
        event,
        hints: {
          metadataWorkspaceId,
          legacyWorkspaceId,
          userId: sub.metadata?.userId ?? null,
          userEmail: sub.metadata?.userEmail ?? null,
          customerId,
          subscriptionId,
        },
      });
      if (!workspace?.workspaceId) return;

      const inserted = await insertBillingEvent({
        workspaceId: workspace?.workspaceId ?? null,
        userEmail: sub.metadata?.userEmail ?? workspace?.userEmail ?? null,
        eventType: event.type,
        stripeEventId: event.id,
        stripeObjectId: sub.id,
        status,
        meta: {
          account: event.account ?? null,
          livemode: event.livemode,
          workspaceId: workspace?.workspaceId ?? null,
          userId: sub.metadata?.userId ?? null,
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
          latestInvoiceId: readInvoiceReferenceId(sub.latest_invoice),
          plan: plan ?? null,
          interval: toStoredBillingInterval(
            sub.items?.data?.[0]?.price?.recurring?.interval ?? null,
          ),
        },
      });
      if (!inserted) {
        return;
      }

      if (workspace?.workspaceId) {
        await syncPlanSnapshotAndCheckEffectiveness({
          event,
          workspaceId: workspace.workspaceId,
          userId: sub.metadata?.userId ?? null,
          plan: plan ?? null,
          interval,
          subscriptionId: subscriptionId ?? null,
          customerId: customerId ?? null,
          latestInvoiceId,
          status,
        });

        if (status === "active" && workspace.userEmail) {
          await logFunnelEvent({
            userEmail: workspace.userEmail,
            eventName: "subscription_active",
            source: "billing",
          });
        }
      }
    } catch (error) {
      captureBillingBusinessException(error, {
        event,
        subscriptionId: sub.id,
        userId: sub.metadata?.userId ?? null,
        workspaceId: metadataWorkspaceId ?? null,
      });
      return;
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const metadataWorkspaceId = readWorkspaceIdFromStripeMetadata(sub.metadata);
    const legacyWorkspaceId = readLegacyWorkspaceIdFromStripeMetadata(sub.metadata);
    billingStatusSignal = "canceled";
    billingContextHints.subscriptionId = sub.id;
    billingContextHints.customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
    billingContextHints.userId = sub.metadata?.userId ?? null;
    billingContextHints.userEmail = sub.metadata?.userEmail ?? null;
    billingContextHints.metadataWorkspaceId = metadataWorkspaceId;
    billingContextHints.legacyWorkspaceId = legacyWorkspaceId;

    const workspace = await resolveBillingWorkspaceContext({
      event,
      hints: {
        metadataWorkspaceId,
        legacyWorkspaceId,
        userId: sub.metadata?.userId ?? null,
        userEmail: sub.metadata?.userEmail ?? null,
        customerId:
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
        subscriptionId: sub.id,
      },
    });
    if (!workspace?.workspaceId) {
      return;
    }

    await upsertWorkspaceBilling({
      workspaceId: workspace.workspaceId,
      plan: 'free',
      subscriptionStatus: 'canceled',
      stripeCustomerId: null,
      stripeSubscriptionId: sub.id ?? null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    debugLog("customer.subscription.deleted", {
      subscriptionId: sub.id,
      workspaceId: workspace.workspaceId,
    });
  }

  if (event.type === "invoice.payment_failed") {
    const stripeInvoice = event.data.object as Stripe.Invoice;
    const invoiceAny = stripeInvoice as any;
    const subscriptionId =
      typeof invoiceAny.subscription === "string"
        ? invoiceAny.subscription
        : invoiceAny.subscription?.id ?? null;
    const customerId =
      typeof stripeInvoice.customer === "string"
        ? stripeInvoice.customer
        : stripeInvoice.customer?.id ?? null;

    billingStatusSignal = "past_due";
    paymentFailedSignal = true;
    billingContextHints.subscriptionId = subscriptionId;
    billingContextHints.customerId = customerId;
    billingContextHints.userEmail = stripeInvoice.customer_email ?? null;
    billingContextHints.metadataWorkspaceId =
      readWorkspaceIdFromStripeMetadata(invoiceAny.parent?.subscription_details?.metadata) ??
      readWorkspaceIdFromStripeMetadata(invoiceAny.subscription_details?.metadata) ??
      readWorkspaceIdFromStripeMetadata(invoiceAny.lines?.data?.[0]?.metadata) ??
      null;
    billingContextHints.legacyWorkspaceId =
      readLegacyWorkspaceIdFromStripeMetadata(invoiceAny.parent?.subscription_details?.metadata) ??
      readLegacyWorkspaceIdFromStripeMetadata(invoiceAny.subscription_details?.metadata) ??
      readLegacyWorkspaceIdFromStripeMetadata(invoiceAny.lines?.data?.[0]?.metadata) ??
      null;

    const workspace = await resolveBillingWorkspaceContext({
      event,
      hints: {
        metadataWorkspaceId: billingContextHints.metadataWorkspaceId,
        legacyWorkspaceId: billingContextHints.legacyWorkspaceId,
        userEmail: billingContextHints.userEmail,
        customerId,
        subscriptionId,
      },
    });
    if (!workspace?.workspaceId) {
      return;
    }

    await upsertWorkspaceBilling({
      workspaceId: workspace.workspaceId,
      plan: null,
      subscriptionStatus: 'past_due',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    });
  }

  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
    const stripeInvoice = event.data.object as Stripe.Invoice;
    const invoiceAny = stripeInvoice as any;
    const subscriptionId =
      typeof invoiceAny.subscription === "string"
        ? invoiceAny.subscription
        : invoiceAny.subscription?.id ?? null;
    const customerId =
      typeof stripeInvoice.customer === "string"
        ? stripeInvoice.customer
        : stripeInvoice.customer?.id ?? null;

    billingStatusSignal = "active";
    paymentSucceededSignal = true;
    billingContextHints.subscriptionId = subscriptionId;
    billingContextHints.customerId = customerId;
    billingContextHints.userEmail = stripeInvoice.customer_email ?? null;
    billingContextHints.metadataWorkspaceId =
      readWorkspaceIdFromStripeMetadata(invoiceAny.parent?.subscription_details?.metadata) ??
      readWorkspaceIdFromStripeMetadata(invoiceAny.subscription_details?.metadata) ??
      readWorkspaceIdFromStripeMetadata(invoiceAny.lines?.data?.[0]?.metadata) ??
      null;
    billingContextHints.legacyWorkspaceId =
      readLegacyWorkspaceIdFromStripeMetadata(invoiceAny.parent?.subscription_details?.metadata) ??
      readLegacyWorkspaceIdFromStripeMetadata(invoiceAny.subscription_details?.metadata) ??
      readLegacyWorkspaceIdFromStripeMetadata(invoiceAny.lines?.data?.[0]?.metadata) ??
      null;

    try {
      const workspace = await resolveBillingWorkspaceContext({
        event,
        hints: {
          metadataWorkspaceId: billingContextHints.metadataWorkspaceId,
          legacyWorkspaceId: billingContextHints.legacyWorkspaceId,
          userId:
            invoiceAny.parent?.subscription_details?.metadata?.userId ??
            invoiceAny.subscription_details?.metadata?.userId ??
            null,
          userEmail: billingContextHints.userEmail,
          customerId,
          subscriptionId,
        },
      });
      if (!workspace?.workspaceId) return;

      const inserted = await insertBillingEvent({
        workspaceId: workspace?.workspaceId ?? null,
        userEmail: billingContextHints.userEmail ?? workspace?.userEmail ?? null,
        eventType: event.type,
        stripeEventId: event.id,
        stripeObjectId: stripeInvoice.id ?? null,
        status: "active",
        meta: {
          account: event.account ?? null,
          livemode: event.livemode,
          workspaceId: workspace?.workspaceId ?? null,
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
          latestInvoiceId: stripeInvoice.id ?? null,
        },
      });
      if (!inserted) {
        return;
      }

      if (workspace?.workspaceId && subscriptionId) {
        const linePrice = invoiceAny.lines?.data?.[0]?.price;
        const metadataPlan =
          invoiceAny.parent?.subscription_details?.metadata?.plan ??
          invoiceAny.subscription_details?.metadata?.plan ??
          null;
        const plan = resolvePaidPlanFromStripe({
          metadataPlan,
          priceId: linePrice?.id ?? null,
          priceLookupKey: linePrice?.lookup_key ?? null,
        });
        const stripeInterval =
          linePrice?.recurring?.interval ?? null;
        const interval = toStoredBillingInterval(stripeInterval);

        await syncPlanSnapshotAndCheckEffectiveness({
          event,
          workspaceId: workspace.workspaceId,
          userId:
            invoiceAny.parent?.subscription_details?.metadata?.userId ??
            invoiceAny.subscription_details?.metadata?.userId ??
            null,
          plan,
          interval,
          subscriptionId: subscriptionId ?? null,
          customerId: customerId ?? null,
          latestInvoiceId: stripeInvoice.id ?? null,
          status: "active",
        });
      }
    } catch (error) {
      captureBillingBusinessException(error, {
        event,
        subscriptionId,
        userId:
          invoiceAny.parent?.subscription_details?.metadata?.userId ??
          invoiceAny.subscription_details?.metadata?.userId ??
          null,
        workspaceId: billingContextHints.metadataWorkspaceId ?? null,
      });
      return;
    }

  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const eventStripeAccount = event.account ?? undefined;
    const paymentIntentId = intent.id ?? null;
    let checkoutSessionId: string | null = null;
    let invoiceId: string | null = null;

    if (paymentIntentId) {
      const resolved = await resolveInvoiceIdFromPaymentIntent({
        paymentIntentId,
        eventAccount: eventStripeAccount,
        intentMetadata: intent.metadata,
      });
      invoiceId = resolved.invoiceId;
      checkoutSessionId = resolved.checkoutSessionId;
    }

    if (!invoiceId) {
      debugLog(
        "[stripe webhook] payment_intent.succeeded missing invoiceId (ignored)",
        {
          paymentIntentId,
          checkoutSessionId,
        },
      );
      return;
    }

    debugLog("[stripe webhook] invoice resolution", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      checkoutSessionId,
      paymentIntentId,
      resolvedInvoiceId: invoiceId,
    });

    const isValid = await validatePaidMutationOrWarn({
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      stripeObject: intent,
      paymentIntentId,
      checkoutSessionId,
    });
    if (!isValid) return;

    resolvedInvoiceId = invoiceId;
    invoiceUpdateRows = await markInvoicePaid({
      invoiceId,
      paymentIntentId,
      checkoutSessionId,
      eventId: event.id,
      eventAccount: event.account ?? null,
      eventType: event.type,
    });
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object as Stripe.PaymentIntent;
    const eventStripeAccount = event.account ?? undefined;
    const paymentIntentId = intent.id ?? null;
    let checkoutSessionId: string | null = null;
    let invoiceId: string | null = null;

    if (paymentIntentId) {
      const resolved = await resolveInvoiceIdFromPaymentIntent({
        paymentIntentId,
        eventAccount: eventStripeAccount,
        intentMetadata: intent.metadata,
      });
      invoiceId = resolved.invoiceId;
      checkoutSessionId = resolved.checkoutSessionId;
    }

    if (!invoiceId) {
      debugLog(
        "[stripe webhook] payment_intent.payment_failed missing invoiceId (ignored)",
        {
          paymentIntentId,
          checkoutSessionId,
        },
      );
      return;
    }

    const currentStatus = await findInvoiceStatusById(invoiceId);
    debugLog("[stripe webhook] invoice resolution", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      checkoutSessionId,
      paymentIntentId,
      resolvedInvoiceId: invoiceId,
      currentStatus,
    });

    const isValid = await validateInvoiceMutationOrWarn({
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      amount: intent.amount,
      currency: intent.currency ?? null,
      paymentIntentId,
      checkoutSessionId,
    });
    if (!isValid) return;

    resolvedInvoiceId = invoiceId;
    const intentStatus = String(intent.status ?? "").trim().toLowerCase();
    const canOverridePaidToFailed = intentStatus === "requires_payment_method";

    if (currentStatus !== "paid" || canOverridePaidToFailed) {
      const updated = await sql`
        update invoices
        set status = 'failed'
        where id = ${invoiceId}
          and (
            status <> 'paid'
            or ${canOverridePaidToFailed}
          )
        returning id, status, paid_at, stripe_payment_intent_id, stripe_checkout_session_id
      `;
      invoiceUpdateRows = updated.length;
      debugLog("[stripe webhook] invoice update", {
        eventType: event.type,
        eventId: event.id,
        eventAccount: event.account ?? null,
        invoiceId,
        checkoutSessionId,
        paymentIntentId,
        currentStatus,
        intentStatus,
        canOverridePaidToFailed,
        rows: updated.length,
        invoice: updated[0] ?? null,
      });
    } else {
      debugLog(
        "[stripe webhook] payment_intent.payment_failed keeps paid invoice paid (unproven hard failure)",
        {
          eventId: event.id,
          eventAccount: event.account ?? null,
          invoiceId,
          paymentIntentId,
          currentStatus,
          intentStatus,
        },
      );
    }
  }

  if (event.type === "charge.succeeded") {
    const charge = event.data.object as Stripe.Charge;
    const eventStripeAccount = event.account ?? undefined;

    let invoiceId = readInvoiceIdFromMetadata(charge.metadata);
    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : null;
    let checkoutSessionId: string | null = null;

    if (!invoiceId && paymentIntentId) {
      const intent = await retrievePaymentIntentWithAccountContext(
        paymentIntentId,
        eventStripeAccount,
      );
      if (intent) {
        invoiceId = readInvoiceIdFromMetadata(intent.metadata);
      }
    }

    if (!invoiceId && paymentIntentId) {
      const session = await retrieveCheckoutSessionByPaymentIntentWithAccountContext(
        paymentIntentId,
        eventStripeAccount,
      );
      if (session) {
        checkoutSessionId = session.id ?? null;
        invoiceId = readInvoiceIdFromMetadata(session.metadata);
      }
    }

    if (!invoiceId) {
      debugLog("[stripe webhook] charge.succeeded missing invoiceId (ignored)", {
        chargeId: charge.id,
        paymentIntentId,
      });
      return;
    }

    const isValid = await validatePaidMutationOrWarn({
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      stripeObject: charge,
      paymentIntentId,
      checkoutSessionId,
      chargeId: charge.id ?? null,
    });
    if (!isValid) return;

    resolvedInvoiceId = invoiceId;
    invoiceUpdateRows = await markInvoicePaid({
      invoiceId,
      paymentIntentId,
      checkoutSessionId,
      eventId: event.id,
      eventAccount: event.account ?? null,
      eventType: event.type,
    });
    await updateInvoiceActualFeeDetailsFromCharge({
      invoiceId,
      charge,
      eventId: event.id,
      eventType: event.type,
      eventAccount: event.account ?? null,
    });
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const eventStripeAccount = event.account ?? undefined;
    const chargeId = charge.id ?? null;
    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : null;
    let checkoutSessionId: string | null = null;
    let invoiceId: string | null = null;

    if (paymentIntentId) {
      const resolved = await resolveInvoiceIdFromPaymentIntent({
        paymentIntentId,
        eventAccount: eventStripeAccount,
      });
      invoiceId = resolved.invoiceId;
      checkoutSessionId = resolved.checkoutSessionId;
    }

    if (!invoiceId) {
      invoiceId = readInvoiceIdFromMetadata(charge.metadata);
    }

    if (!invoiceId) {
      debugLog("[stripe webhook] charge.refunded missing invoiceId (ignored)", {
        eventId: event.id,
        eventAccount: event.account ?? null,
        chargeId,
        paymentIntentId,
      });
      return;
    }

    resolvedInvoiceId = invoiceId;
    const amount = typeof charge.amount === "number" ? charge.amount : 0;
    const amountRefunded =
      typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;
    const isPartialRefund = amount > 0 && amountRefunded > 0 && amountRefunded < amount;

    debugLog("[stripe webhook] invoice resolution", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      chargeId,
      checkoutSessionId,
      paymentIntentId,
      resolvedInvoiceId: invoiceId,
      amount,
      amountRefunded,
      isPartialRefund,
    });

    const isValid = await validateInvoiceMutationOrWarn({
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      amount: charge.amount,
      currency: charge.currency ?? null,
      paymentIntentId,
      checkoutSessionId,
      chargeId,
    });
    if (!isValid) return;

    const refundStatus = isPartialRefund ? "partially_refunded" : "refunded";
    const updated = await sql`
      update invoices
      set
        status = ${refundStatus},
        refunded_at = now()
      where id = ${invoiceId}
        and status in ('paid', 'partially_refunded')
      returning id, status, paid_at, refunded_at
    `;
    invoiceUpdateRows = updated.length;
    debugLog("[stripe webhook] invoice update", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      chargeId,
      paymentIntentId,
      rows: updated.length,
      invoice: updated[0] ?? null,
      refundStatus,
    });
    if (updated.length === 0) {
      const currentStatus = await findInvoiceStatusById(invoiceId);
      const skipReason =
        currentStatus === "refunded"
          ? "invoice already in terminal refunded state"
          : "invoice status not eligible for refund transition";
      debugLog("[stripe webhook] charge.refunded skipped status change", {
        eventId: event.id,
        eventAccount: event.account ?? null,
        invoiceId,
        previousStatus: currentStatus,
        skipReason,
      });
    }
  }

  if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.funds_withdrawn"
  ) {
    const dispute = event.data.object as Stripe.Dispute;
    const eventStripeAccount = event.account ?? undefined;
    const disputeCharge =
      dispute.charge && typeof dispute.charge === "object" ? dispute.charge : null;
    const chargeId =
      typeof dispute.charge === "string"
        ? dispute.charge
        : typeof disputeCharge?.id === "string"
          ? disputeCharge.id
          : null;
    let chargeAmount: number | null = null;
    let chargeCurrency: string | null = null;
    let paymentIntentId =
      typeof (dispute as any).payment_intent === "string"
        ? ((dispute as any).payment_intent as string)
        : null;
    let checkoutSessionId: string | null = null;
    let invoiceId: string | null = null;

    if (disputeCharge) {
      chargeAmount =
        typeof (disputeCharge as any).amount === "number"
          ? ((disputeCharge as any).amount as number)
          : null;
      chargeCurrency =
        typeof (disputeCharge as any).currency === "string"
          ? ((disputeCharge as any).currency as string)
          : null;
      if (
        !paymentIntentId &&
        typeof (disputeCharge as any).payment_intent === "string"
      ) {
        paymentIntentId = (disputeCharge as any).payment_intent as string;
      }
    }

    if (chargeId) {
      const charge = await retrieveChargeWithAccountContext(chargeId, eventStripeAccount);
      if (charge) {
        chargeAmount = typeof charge.amount === "number" ? charge.amount : null;
        chargeCurrency = charge.currency ?? null;
      }
      if (!paymentIntentId && charge && typeof charge.payment_intent === "string") {
        paymentIntentId = charge.payment_intent;
      }
    }

    if (paymentIntentId) {
      const resolved = await resolveInvoiceIdFromPaymentIntent({
        paymentIntentId,
        eventAccount: eventStripeAccount,
      });
      invoiceId = resolved.invoiceId;
      checkoutSessionId = resolved.checkoutSessionId;
    }

    if (!invoiceId) {
      debugLog(
        "[stripe webhook] charge.dispute.created missing invoiceId (ignored)",
        {
          eventId: event.id,
          eventAccount: event.account ?? null,
          disputeId: dispute.id,
          chargeId,
          paymentIntentId,
        },
      );
      return;
    }

    resolvedInvoiceId = invoiceId;
    debugLog("[stripe webhook] invoice resolution", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      disputeId: dispute.id,
      chargeId,
      checkoutSessionId,
      paymentIntentId,
      resolvedInvoiceId: invoiceId,
    });

    const isValid = await validateInvoiceMutationOrWarn({
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      amount: chargeAmount,
      currency: chargeCurrency,
      paymentIntentId,
      checkoutSessionId,
      chargeId,
      disputeId: dispute.id,
    });
    if (!isValid) return;

    const updated = await sql`
      update invoices
      set status = 'disputed'
      where id = ${invoiceId}
      returning id, status, paid_at
    `;
    invoiceUpdateRows = updated.length;
    debugLog("[stripe webhook] invoice update", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      disputeId: dispute.id,
      rows: updated.length,
      invoice: updated[0] ?? null,
    });
    if (updated.length === 0) {
      debugLog("[stripe webhook] dispute event invoice update affected 0 rows", {
        eventType: event.type,
        eventId: event.id,
        eventAccount: event.account ?? null,
        invoiceId,
      });
    }
  }

  if (
    event.type === "charge.dispute.closed" ||
    (event.type as string) === "dispute.closed"
  ) {
    const dispute = event.data.object as Stripe.Dispute;
    const eventStripeAccount = event.account ?? undefined;
    const disputeCharge =
      dispute.charge && typeof dispute.charge === "object" ? dispute.charge : null;
    const chargeId =
      typeof dispute.charge === "string"
        ? dispute.charge
        : typeof disputeCharge?.id === "string"
          ? disputeCharge.id
          : null;
    const disputeStatus = String(dispute.status ?? "").trim().toLowerCase();
    let chargeAmount: number | null = null;
    let chargeCurrency: string | null = null;
    let paymentIntentId =
      typeof (dispute as any).payment_intent === "string"
        ? ((dispute as any).payment_intent as string)
        : null;
    let checkoutSessionId: string | null = null;
    let invoiceId: string | null = null;

    if (disputeCharge) {
      chargeAmount =
        typeof (disputeCharge as any).amount === "number"
          ? ((disputeCharge as any).amount as number)
          : null;
      chargeCurrency =
        typeof (disputeCharge as any).currency === "string"
          ? ((disputeCharge as any).currency as string)
          : null;
      if (
        !paymentIntentId &&
        typeof (disputeCharge as any).payment_intent === "string"
      ) {
        paymentIntentId = (disputeCharge as any).payment_intent as string;
      }
    }

    if (chargeId) {
      const charge = await retrieveChargeWithAccountContext(chargeId, eventStripeAccount);
      if (charge) {
        chargeAmount = typeof charge.amount === "number" ? charge.amount : null;
        chargeCurrency = charge.currency ?? null;
      }
      if (!paymentIntentId && charge && typeof charge.payment_intent === "string") {
        paymentIntentId = charge.payment_intent;
      }
    }

    if (paymentIntentId) {
      const resolved = await resolveInvoiceIdFromPaymentIntent({
        paymentIntentId,
        eventAccount: eventStripeAccount,
      });
      invoiceId = resolved.invoiceId;
      checkoutSessionId = resolved.checkoutSessionId;
    }

    if (!invoiceId) {
      debugLog(
        "[stripe webhook] charge.dispute.closed missing invoiceId (ignored)",
        {
          eventId: event.id,
          eventAccount: event.account ?? null,
          disputeId: dispute.id,
          chargeId,
          paymentIntentId,
          disputeStatus,
        },
      );
      return;
    }

    resolvedInvoiceId = invoiceId;
    let targetStatus: string | null = null;
    if (disputeStatus === "won") targetStatus = "paid";
    if (disputeStatus === "lost") targetStatus = "lost";

    if (!targetStatus) {
      debugLog("[stripe webhook] dispute.closed has unsupported status (ignored)", {
        eventType: event.type,
        eventId: event.id,
        eventAccount: event.account ?? null,
        disputeId: dispute.id,
        disputeStatus,
        invoiceId,
      });
      return;
    }

    const isValid = await validateInvoiceMutationOrWarn({
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      amount: chargeAmount,
      currency: chargeCurrency,
      paymentIntentId,
      checkoutSessionId,
      chargeId,
      disputeId: dispute.id,
    });
    if (!isValid) return;

    let updated: { id: string; status: string; paid_at: Date | null }[] = [];
    if (targetStatus === "paid") {
      invoiceUpdateRows = await markInvoicePaid({
        invoiceId,
        paymentIntentId,
        checkoutSessionId,
        eventId: event.id,
        eventAccount: event.account ?? null,
        eventType: event.type,
      });
    } else {
      updated = await sql`
        update invoices
        set status = ${targetStatus}
        where id = ${invoiceId}
          and status = 'disputed'
        returning id, status, paid_at
      `;
      invoiceUpdateRows = updated.length;
    }
    debugLog("[stripe webhook] invoice resolution", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      disputeId: dispute.id,
      chargeId,
      checkoutSessionId,
      paymentIntentId,
      disputeStatus,
      resolvedInvoiceId: invoiceId,
      targetStatus,
    });
    debugLog("[stripe webhook] invoice update", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      invoiceId,
      disputeId: dispute.id,
      targetStatus,
      rows: invoiceUpdateRows,
      invoice: updated[0] ?? null,
    });
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const connectAccountId = account.id.trim();
    const payoutsEnabled = !!account.payouts_enabled;
    const detailsSubmitted = !!account.details_submitted;

    const result = await sql<{ email: string }[]>`
      update public.users
      set
        stripe_connect_payouts_enabled = ${payoutsEnabled},
        stripe_connect_details_submitted = ${detailsSubmitted}
      where lower(trim(stripe_connect_account_id)) = lower(${connectAccountId})
      returning email
    `;

    debugLog("[connect webhook] account.updated user sync", {
      accountId: connectAccountId,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      matchedUsers: result.length,
    });

    if (result.length === 0) {
      debugLog("[connect webhook] account.updated no matching user row", {
        accountId: connectAccountId,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      });
    }
  }

  const shouldReconcileBillingRecovery =
    billingStatusSignal !== null || paymentFailedSignal || paymentSucceededSignal;

  if (shouldReconcileBillingRecovery) {
    await reconcileBillingRecoveryForEvent({
      event,
      status: billingStatusSignal,
      paymentFailedSignal,
      paymentSucceededSignal,
      hints: billingContextHints,
    });
  }

  debugLog("[stripe webhook] reconcile debug", {
    eventType: event.type,
    eventId: event.id,
    eventAccount: event.account ?? null,
    resolvedInvoiceId: resolvedInvoiceId ?? "none",
    updateRows: invoiceUpdateRows,
  });

  if (resolvedInvoiceId && invoiceUpdateRows > 0) {
    revalidateInvoicePaths(resolvedInvoiceId);
  }
}

export async function POST(req: Request) {
  const rateLimitResponse = await enforceRateLimit(
    req,
    {
      bucket: "stripe_webhook",
      windowSec: 60,
      ipLimit: 300,
    },
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 },
    );
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: 400 },
    );
  }

  console.log("[stripe webhook] received", {
    type: event.type,
    id: event.id,
    account: event.account ?? null,
  });

  try {
    assertStripeConfig({ expectedMode: event.livemode ? "live" : "test" });
    if (event.account) {
      const verifier = createStripeRequestVerifier(stripe);
      await verifier.verifyConnectedAccountAccess(event.account);
    }
  } catch (error) {
    const normalized = normalizeStripeConfigError(error);
    Sentry.captureException(error, {
      tags: {
        route: "stripe_webhook",
        phase: "config_guard",
        stripe_event_type: event.type,
      },
      extra: {
        eventId: event.id,
        code: normalized.code,
      },
    });
    console.error("[stripe webhook] outcome=error", {
      id: event.id,
      type: event.type,
      code: normalized.code,
      error: normalized.message,
      guidance: normalized.guidance,
    });
    return NextResponse.json(
      { ok: false, code: normalized.code, error: normalized.guidance },
      { status: 500 },
    );
  }

  if (BILLING_EVENTS_DEDUPE_TYPES.has(event.type)) {
    const existingBillingEvent = await sql<{ id: string }[]>`
      select id
      from public.billing_events
      where stripe_event_id = ${event.id}
      limit 1
    `;
    if (existingBillingEvent.length > 0) {
      console.log("[stripe webhook] outcome=duplicate_via_billing_events", {
        id: event.id,
        type: event.type,
      });
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }
  }

  const inserted = await sql<{ event_id: string }[]>`
    insert into public.stripe_webhook_events (event_id, event_type, account, livemode)
    values (${event.id}, ${event.type}, ${event.account ?? null}, ${event.livemode})
    on conflict (event_id) do nothing
    returning event_id
  `;
  if (inserted.length === 0) {
    console.log("[stripe webhook] outcome=duplicate", {
      id: event.id,
      type: event.type,
    });
    return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
  }

  try {
    await processEvent(event);

    await sql`
      update public.stripe_webhook_events
      set
        status = 'processed',
        processed_at = now(),
        error = null
      where event_id = ${event.id}
    `;

    console.log("[stripe webhook] outcome=processed", {
      id: event.id,
      type: event.type,
    });
    debugLog("[stripe webhook] processed", { id: event.id, type: event.type });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    const message = stringifyErrorMessage(err);
    Sentry.captureException(err, {
      tags: {
        route: "stripe_webhook",
        phase: "process_event",
        stripe_event_type: event.type,
        livemode: String(event.livemode),
      },
      extra: {
        eventId: event.id,
      },
    });

    try {
      await sql`
        update public.stripe_webhook_events
        set
          status = 'failed',
          processed_at = now(),
          error = ${message}
        where event_id = ${event.id}
      `;
    } catch {
      // best effort only; original handler failure still drives retry semantics
    }

    console.error("[stripe webhook] outcome=error", {
      id: event.id,
      type: event.type,
      message,
    });

    return NextResponse.json(
      { ok: false, code: "WEBHOOK_PROCESSING_FAILED", error: "Webhook business logic failed" },
      { status: 500 },
    );
  }
}
