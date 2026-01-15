// app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import postgres from "postgres";
import {
  normalizePlan,
  planFromStripePriceId,
  isActiveSubscription,
} from "@/app/lib/config";

export const runtime = "nodejs";

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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
  // Stripe.Customer or Stripe.DeletedCustomer
  // Both should have `id` when expanded; DeletedCustomer also has id.
  // But type-wise, keep it safe:
  
  return typeof customer.id === "string" ? customer.id : null;
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

  try {
    // 1) Checkout session completed -> initial linkage (userId preferred, fallback to email)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

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

    // 2) Subscription created/updated -> authoritative subscription data (cancel/current_period_end etc)
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

      console.log("WEBHOOK_EVENT", event.id, event.type);
      console.log("sub.id:", subscriptionId);
      console.log("status:", status);
      console.log(
        "cancel_at:",
        sub.cancel_at,
        "cancel_at_period_end:",
        sub.cancel_at_period_end,
      );
      console.log("computed cancelRequested:", cancelRequested);
      console.log("computed currentPeriodEndUnix:", currentPeriodEndUnix);
      console.log("computed isPro:", isPro);

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

      console.log("updated rows:", updated.length, updated[0]);

      // Fallback: if subscription_id isn't set yet, try metadata.userId
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
          console.log("fallback updated rows:", updated2.length, updated2[0]);
        }
      }
    }

    // 3) Subscription deleted -> mark user as non-pro (use subscription_id to target the right row)
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

      console.log(
        "customer.subscription.deleted -> sub:",
        sub.id,
        "rows:",
        updated.length,
        updated[0],
      );
    }

    // 4) Invoice payment succeeded -> mark invoice as paid
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const invoiceId = intent.metadata?.invoice_id;
      const userEmail = intent.metadata?.user_email;

      if (!invoiceId || !userEmail) {
        console.warn(
          "payment_intent.succeeded -> missing metadata",
          intent.id,
          intent.metadata,
        );
      } else {
        const normalizedEmail = normalizeEmail(userEmail);
        const updated = await sql`
          update invoices
          set
            status = 'paid',
            paid_at = now(),
            stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${intent.id})
          where id = ${invoiceId}
            and lower(user_email) = ${normalizedEmail}
          returning id, status, paid_at
        `;
        console.log(
          "payment_intent.succeeded -> invoice:",
          invoiceId,
          "rows:",
          updated.length,
          updated[0],
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Webhook handler error" },
      { status: 500 },
    );
  }
}
