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
  console.log("[stripe webhook] invoice update", {
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

async function safelyHandleEvent(
  event: Stripe.Event,
  handler: () => Promise<void>,
) {
  try {
    await handler();
  } catch (err: any) {
    console.error("[stripe webhook] handler failed (ignored)", {
      eventType: event.type,
      eventId: event.id,
      eventAccount: event.account ?? null,
      message: err?.message ?? String(err),
    });
  }
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 },
    );
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
  } catch (err: any) {
    return NextResponse.json(
      { error: `Webhook signature verify failed: ${err?.message}` },
      { status: 400 },
    );
  }

  const eventObject = event.data.object as {
    id?: string | null;
    payment_intent?: string | { id?: string | null } | null;
  };
  const eventObjectId =
    typeof eventObject?.id === "string" ? eventObject.id : null;
  const eventPaymentIntentId =
    typeof eventObject?.payment_intent === "string"
      ? eventObject.payment_intent
      : typeof eventObject?.payment_intent?.id === "string"
        ? eventObject.payment_intent.id
        : null;
  console.log("[stripe webhook] event", {
    eventType: event.type,
    eventId: event.id,
    eventAccount: event.account ?? null,
    objectId: eventObjectId,
    paymentIntentId: eventPaymentIntentId,
  });
  let resolvedInvoiceId: string | null = null;
  let invoiceUpdateRows = 0;

  if (event.type === "checkout.session.completed") {
    await safelyHandleEvent(event, async () => {
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
          console.log(
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
          console.log(
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

      console.log("[stripe webhook] invoice resolution", {
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
    });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    await safelyHandleEvent(event, async () => {
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

      console.log("customer.subscription upsert", {
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
          console.log("customer.subscription fallback upsert", {
            metaUserId,
            rows: updated2.length,
            user: updated2[0] ?? null,
          });
        }
      }
    });
  }

  if (event.type === "customer.subscription.deleted") {
    await safelyHandleEvent(event, async () => {
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

      console.log("customer.subscription.deleted", {
        subscriptionId: sub.id,
        rows: updated.length,
        user: updated[0] ?? null,
      });
    });
  }

  if (event.type === "payment_intent.succeeded") {
    await safelyHandleEvent(event, async () => {
      const intent = event.data.object as Stripe.PaymentIntent;
      const eventStripeAccount = event.account ?? undefined;
      const paymentIntentId = intent.id ?? null;
      let checkoutSessionId: string | null = null;
      let invoiceId =
        paymentIntentId
          ? await findInvoiceIdByPaymentIntentId(paymentIntentId)
          : null;

      if (!invoiceId && paymentIntentId) {
        const session = await retrieveCheckoutSessionByPaymentIntentWithAccountContext(
          paymentIntentId,
          eventStripeAccount,
        );
        if (session) {
          checkoutSessionId = session.id ?? null;
          if (checkoutSessionId) {
            invoiceId = await findInvoiceIdByCheckoutSessionId(checkoutSessionId);
          }
        }
      }

      if (!invoiceId) {
        invoiceId = readInvoiceIdFromMetadata(intent.metadata);
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

      console.log("[stripe webhook] invoice resolution", {
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
    });
  }

  if (event.type === "charge.succeeded") {
    await safelyHandleEvent(event, async () => {
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
    });
  }

  if (event.type === "account.updated") {
    await safelyHandleEvent(event, async () => {
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

      console.log("[connect webhook] account.updated user sync", {
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
    });
  }

  console.log("[stripe webhook] reconcile debug", {
    eventType: event.type,
    eventId: event.id,
    eventAccount: event.account ?? null,
    resolvedInvoiceId: resolvedInvoiceId ?? "none",
    updateRows: invoiceUpdateRows,
  });

  return NextResponse.json({ received: true });
}
