// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import postgres from "postgres";
import {
  normalizePlan,
  planFromStripePriceId,
  isActiveSubscription,
} from "@/app/lib/config";
import { stripe } from "@/app/lib/stripe";

export const runtime = "nodejs";

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });

const DEBUG = process.env.DEBUG_STRIPE_WEBHOOK === "true";

function debugLog(...args: unknown[]) {
  if (DEBUG) console.log(...args);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseCustomerId(
  customer:
    | Stripe.Subscription["customer"]
    | Stripe.Checkout.Session["customer"]
    | null
    | undefined,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return typeof customer.id === "string" ? customer.id : null;
}

function isStripeResourceMissing404(err: any): boolean {
  return (
    err?.statusCode === 404 &&
    err?.code === "resource_missing" &&
    typeof err?.message === "string"
  );
}

function isUniqueViolation(err: any): boolean {
  return err?.code === "23505";
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
      console.warn(
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
      console.warn("[stripe webhook] charge retrieve resource_missing (ignored)", {
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

async function findInvoiceStatusById(invoiceId: string): Promise<string | null> {
  const rows = await sql<{ status: string }[]>`
    select status
    from invoices
    where id = ${invoiceId}
    limit 1
  `;
  return rows[0]?.status ?? null;
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
  const updated = await sql`
    update invoices
    set
      status = 'paid',
      paid_at = coalesce(paid_at, now()),
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${paymentIntentId ?? null}),
      stripe_checkout_session_id = coalesce(stripe_checkout_session_id, ${checkoutSessionId ?? null})
    where id = ${invoiceId}
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
    console.warn("[stripe webhook] invoice update affected 0 rows", {
      eventType,
      eventId,
      eventAccount: eventAccount ?? null,
      invoiceId,
      checkoutSessionId: checkoutSessionId ?? null,
      paymentIntentId: paymentIntentId ?? null,
    });
  }

  return rowCount;
}

async function processEvent(event: Stripe.Event): Promise<void> {
  let resolvedInvoiceId: string | null = null;
  let invoiceUpdateRows = 0;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode === "subscription") {
      const rawPlan = session.metadata?.plan ?? null;
      const normalizedPlan = rawPlan ? normalizePlan(rawPlan) : null;
      const isPro = normalizedPlan ? normalizedPlan !== "free" : true;

      const metadataUserId = session.metadata?.userId || null;
      const email =
        session.customer_email ||
        session.customer_details?.email ||
        session.metadata?.userEmail ||
        null;

      const customerId = parseCustomerId(session.customer);
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : null;

      if (metadataUserId) {
        const updated = await sql`
          update public.users
          set
            plan = coalesce(${normalizedPlan}, plan),
            is_pro = ${isPro},
            stripe_customer_id = coalesce(${customerId}, stripe_customer_id),
            stripe_subscription_id = coalesce(${subscriptionId}, stripe_subscription_id),
            subscription_status = coalesce(subscription_status, 'active')
          where id = ${metadataUserId}
          returning id, email, stripe_customer_id, stripe_subscription_id, is_pro, subscription_status
        `;
        debugLog(
          "checkout.session.completed -> by userId:",
          metadataUserId,
          "rows:",
          updated.length,
          updated[0],
        );
      } else if (email) {
        const updated = await sql`
          update public.users
          set
            plan = coalesce(${normalizedPlan}, plan),
            is_pro = ${isPro},
            stripe_customer_id = coalesce(${customerId}, stripe_customer_id),
            stripe_subscription_id = coalesce(${subscriptionId}, stripe_subscription_id),
            subscription_status = coalesce(subscription_status, 'active')
          where lower(email) = ${normalizeEmail(email)}
          returning id, email, stripe_customer_id, stripe_subscription_id, is_pro, subscription_status
        `;
        debugLog(
          "checkout.session.completed -> by email:",
          normalizeEmail(email),
          "rows:",
          updated.length,
          updated[0],
        );
      } else {
        console.warn(
          "checkout.session.completed -> no userId and no email found in session",
        );
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
      console.warn(
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

    const subscriptionId = sub.id;
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
    const status = String(sub.status).trim().toLowerCase();
    const cancelRequested = !!sub.cancel_at_period_end || sub.cancel_at != null;
    const currentPeriodEndUnix =
      (sub as any).current_period_end ??
      sub.cancel_at ??
      sub.items?.data?.[0]?.current_period_end ??
      null;
    const currentPeriodEnd =
      typeof currentPeriodEndUnix === "number"
        ? new Date(currentPeriodEndUnix * 1000)
        : null;
    const priceId = sub.items?.data?.[0]?.price?.id ?? null;
    const planFromPrice = planFromStripePriceId(priceId);
    const planFromMetadata = sub.metadata?.plan
      ? normalizePlan(sub.metadata.plan)
      : null;
    const plan = planFromPrice ?? planFromMetadata;
    const isPro = isActiveSubscription(status) && (plan ? plan !== "free" : true);

    const updated = await sql`
      update public.users
      set
        plan = coalesce(${plan}, plan),
        stripe_customer_id = coalesce(${customerId}, stripe_customer_id),
        stripe_subscription_id = ${subscriptionId},
        subscription_status = ${status},
        cancel_at_period_end = ${cancelRequested},
        current_period_end = ${currentPeriodEnd},
        is_pro = ${isPro}
      where stripe_subscription_id = ${subscriptionId}
      returning id, email, stripe_subscription_id, subscription_status, cancel_at_period_end, current_period_end, is_pro
    `;

    debugLog("customer.subscription upsert", {
      subscriptionId,
      status,
      rows: updated.length,
      user: updated[0] ?? null,
    });

    if (updated.length === 0) {
      const metaUserId = (sub.metadata?.userId as string | undefined) || undefined;
      if (metaUserId) {
        const updated2 = await sql`
          update public.users
          set
            plan = coalesce(${plan}, plan),
            stripe_customer_id = coalesce(${customerId}, stripe_customer_id),
            stripe_subscription_id = ${subscriptionId},
            subscription_status = ${status},
            cancel_at_period_end = ${cancelRequested},
            current_period_end = ${currentPeriodEnd},
            is_pro = ${isPro}
          where id = ${metaUserId}
          returning id, email, stripe_subscription_id, cancel_at_period_end, current_period_end, is_pro
        `;
        debugLog("customer.subscription fallback upsert", {
          metaUserId,
          rows: updated2.length,
          user: updated2[0] ?? null,
        });
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;

    const updated = await sql`
      update public.users
      set
        plan = 'free',
        is_pro = false,
        subscription_status = 'canceled',
        cancel_at_period_end = false,
        current_period_end = null
      where stripe_subscription_id = ${sub.id}
      returning id, email, stripe_subscription_id, is_pro, subscription_status
    `;

    debugLog("customer.subscription.deleted", {
      subscriptionId: sub.id,
      rows: updated.length,
      user: updated[0] ?? null,
    });
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
      console.warn(
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
      console.warn(
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

    resolvedInvoiceId = invoiceId;
    if (currentStatus === "pending") {
      debugLog(
        "[stripe webhook] payment_intent.payment_failed keeps invoice pending",
        {
          eventId: event.id,
          eventAccount: event.account ?? null,
          invoiceId,
          paymentIntentId,
        },
      );
    } else {
      debugLog(
        "[stripe webhook] payment_intent.payment_failed does not change non-pending invoice",
        {
          eventId: event.id,
          eventAccount: event.account ?? null,
          invoiceId,
          paymentIntentId,
          currentStatus,
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
      console.warn("[stripe webhook] charge.succeeded missing invoiceId (ignored)", {
        chargeId: charge.id,
        paymentIntentId,
      });
      return;
    }

    await markInvoicePaid({
      invoiceId,
      paymentIntentId,
      checkoutSessionId,
      eventId: event.id,
      eventAccount: event.account ?? null,
      eventType: event.type,
    });
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const eventStripeAccount = event.account ?? undefined;
    const chargeId = charge.id ?? null;
    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : null;
    let checkoutSessionId: string | null = null;
    let invoiceId: string | null = readInvoiceIdFromMetadata(charge.metadata);

    if (!invoiceId && paymentIntentId) {
      const resolved = await resolveInvoiceIdFromPaymentIntent({
        paymentIntentId,
        eventAccount: eventStripeAccount,
      });
      invoiceId = resolved.invoiceId;
      checkoutSessionId = resolved.checkoutSessionId;
    }

    if (!invoiceId) {
      console.warn("[stripe webhook] charge.refunded missing invoiceId (ignored)", {
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

    if (isPartialRefund) {
      debugLog(
        "[stripe webhook] charge.refunded partial refund keeps invoice paid",
        {
          eventId: event.id,
          eventAccount: event.account ?? null,
          invoiceId,
          chargeId,
          amount,
          amountRefunded,
        },
      );
    } else {
      const updated = await sql`
        update invoices
        set status = 'refunded'
        where id = ${invoiceId}
          and status = 'paid'
        returning id, status, paid_at
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
      });
      if (updated.length === 0) {
        const currentStatus = await findInvoiceStatusById(invoiceId);
        debugLog(
          "[stripe webhook] charge.refunded skipped status change because invoice not paid",
          {
            eventId: event.id,
            eventAccount: event.account ?? null,
            invoiceId,
            currentStatus,
          },
        );
      }
    }
  }

  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const eventStripeAccount = event.account ?? undefined;
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : null;
    let paymentIntentId =
      typeof (dispute as any).payment_intent === "string"
        ? ((dispute as any).payment_intent as string)
        : null;
    let checkoutSessionId: string | null = null;
    let invoiceId: string | null = null;

    if (!paymentIntentId && chargeId) {
      const charge = await retrieveChargeWithAccountContext(chargeId, eventStripeAccount);
      if (charge && typeof charge.payment_intent === "string") {
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
      console.warn(
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
    const updated = await sql`
      update invoices
      set status = 'disputed'
      where id = ${invoiceId}
        and status = 'paid'
      returning id, status, paid_at
    `;
    invoiceUpdateRows = updated.length;
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
      const currentStatus = await findInvoiceStatusById(invoiceId);
      debugLog(
        "[stripe webhook] charge.dispute.created skipped status change because invoice not paid",
        {
          eventId: event.id,
          eventAccount: event.account ?? null,
          invoiceId,
          currentStatus,
        },
      );
    }
  }

  if (event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    const eventStripeAccount = event.account ?? undefined;
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : null;
    const disputeStatus = String(dispute.status ?? "").trim().toLowerCase();
    let paymentIntentId =
      typeof (dispute as any).payment_intent === "string"
        ? ((dispute as any).payment_intent as string)
        : null;
    let checkoutSessionId: string | null = null;
    let invoiceId: string | null = null;

    if (!paymentIntentId && chargeId) {
      const charge = await retrieveChargeWithAccountContext(chargeId, eventStripeAccount);
      if (charge && typeof charge.payment_intent === "string") {
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
      console.warn(
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
    const targetStatus = disputeStatus === "lost" ? "dispute_lost" : "paid";
    const updated = await sql`
      update invoices
      set status = ${targetStatus}
      where id = ${invoiceId}
      returning id, status, paid_at
    `;
    invoiceUpdateRows = updated.length;
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
      rows: updated.length,
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
      console.warn("[connect webhook] account.updated no matching user row", {
        accountId: connectAccountId,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      });
    }
  }

  debugLog("[stripe webhook] reconcile debug", {
    eventType: event.type,
    eventId: event.id,
    eventAccount: event.account ?? null,
    resolvedInvoiceId: resolvedInvoiceId ?? "none",
    updateRows: invoiceUpdateRows,
  });
}

export async function POST(req: Request) {
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
    await sql`
      insert into public.stripe_webhook_events (event_id, event_type, account, livemode)
      values (${event.id}, ${event.type}, ${event.account ?? null}, ${event.livemode})
    `;
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }
    throw err;
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

    debugLog("[stripe webhook] processed", { id: event.id, type: event.type });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    const message = stringifyErrorMessage(err);

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

    console.error("[stripe webhook] failed", {
      id: event.id,
      type: event.type,
      message,
    });

    return NextResponse.json({ ok: false, error: "Webhook handler failed" }, { status: 500 });
  }
}
