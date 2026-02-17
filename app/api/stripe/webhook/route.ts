// app/api/stripe/webhook/route.ts
// Local test note:
// stripe payment_intents create --amount 50 --currency eur --payment-method pm_card_visa --confirm true --metadata invoiceId=<invoice_id> --stripe-account <acct_id>
// Confirm the invoice stays pending when amount/currency does not match.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type Stripe from "stripe";
import postgres from "postgres";
import {
  normalizePlan,
  planFromStripePriceId,
  isActiveSubscription,
} from "@/app/lib/config";
import { allowedPayStatuses, canPayInvoiceStatus } from "@/app/lib/invoice-status";
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
        debugLog(
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
