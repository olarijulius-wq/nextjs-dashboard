import { NextResponse } from 'next/server';
import { sql } from '@/app/lib/db';
import { createInvoiceCheckoutSession } from '@/app/lib/invoice-checkout';
import { canPayInvoiceStatus } from '@/app/lib/invoice-status';
import { verifyPayToken } from '@/app/lib/pay-link';
import { fetchStripeConnectStatusForUser } from '@/app/lib/data';
import {
  PRICING_FEES_MIGRATION_REQUIRED_CODE,
  isPricingFeesMigrationRequiredError,
} from '@/app/lib/pricing-fees';
import {
  checkConnectedAccountAccess,
  CONNECT_MODE_MISMATCH_MESSAGE,
  getConnectChargeCapabilityStatus,
  isStripePermissionOrNoAccessError,
} from '@/app/lib/stripe-connect';
import {
  assertStripeConfig,
  normalizeStripeConfigError,
} from '@/app/lib/stripe-guard';
import {
  enforceRateLimit,
  parseRouteParams,
  routeTokenParamsSchema,
} from '@/app/lib/security/api-guard';

export const runtime = 'nodejs';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(
  req: Request,
  props: { params: Promise<{ token: string }> },
) {
  const rateLimitResponse = await enforceRateLimit(
    req,
    {
      bucket: 'public_invoice_pay',
      windowSec: 60,
      ipLimit: 20,
    },
    {
      failClosed: true,
    },
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const rawParams = await props.params;
  const parsedParams = parseRouteParams(routeTokenParamsSchema, rawParams);
  if (!parsedParams.ok) {
    return parsedParams.response;
  }
  const params = parsedParams.data;
  const verification = verifyPayToken(params.token);

  if (!verification.ok) {
    const error =
      verification.reason === 'expired'
        ? 'Payment link expired'
        : 'Invalid payment link';
    return NextResponse.json({ error, code: verification.reason }, { status: 401 });
  }

  const [invoice] = await sql<{
    id: string;
    amount: number;
    status: string;
    invoice_number: string | null;
    customer_email: string | null;
    user_email: string;
    workspace_id: string | null;
  }[]>`
    SELECT
      invoices.id,
      invoices.amount,
      invoices.status,
      invoices.invoice_number,
      customers.email AS customer_email,
      invoices.user_email,
      invoices.workspace_id
    FROM invoices
    JOIN customers
      ON customers.id = invoices.customer_id
    WHERE invoices.id = ${verification.payload.invoiceId}
    LIMIT 1
  `;

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (!canPayInvoiceStatus(invoice.status)) {
    return NextResponse.json(
      {
        error: 'Invoice status does not allow payment',
        code: 'INVOICE_STATUS_NOT_PAYABLE',
        status: invoice.status,
      },
      { status: 409 },
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');
  const isTest = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ?? false;
  const payPageUrl = `${baseUrl}/pay/${params.token}`;
  const payoutsSetupUrl = '/dashboard/settings/payouts';

  try {
    assertStripeConfig();

    const ownerEmail = normalizeEmail(invoice.user_email);
    const connectStatus = await fetchStripeConnectStatusForUser(ownerEmail);
    const connectedAccountId = connectStatus.accountId;
    if (!connectedAccountId) {
      return NextResponse.json(
        {
          ok: false,
          code: 'CONNECT_REQUIRED',
          message: "Payments aren't enabled for this merchant yet.",
        },
        { status: 409 },
      );
    }

    const accessCheck = await checkConnectedAccountAccess(connectedAccountId);
    if (!accessCheck.ok && accessCheck.isModeMismatch) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[public invoice checkout blocked] Stripe Connect mode mismatch', {
          connectedAccountId,
          mode: isTest ? 'test' : 'live',
        });
      }
      return NextResponse.json(
        {
          ok: false,
          code: 'CONNECT_MODE_MISMATCH',
          message: CONNECT_MODE_MISMATCH_MESSAGE,
          actionUrl: payoutsSetupUrl,
        },
        { status: 409 },
      );
    }
    if (!accessCheck.ok) {
      throw new Error(accessCheck.message);
    }

    const capabilityStatus = await getConnectChargeCapabilityStatus(
      connectedAccountId,
    );
    if (!capabilityStatus.ok) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[public invoice checkout blocked] Stripe Connect not ready', {
          connectedAccountId,
          card_payments: capabilityStatus.cardPayments,
          charges_enabled: capabilityStatus.chargesEnabled,
          details_submitted: capabilityStatus.detailsSubmitted,
        });
      }
      return NextResponse.json(
        {
          ok: false,
          code: 'CONNECT_CARD_PAYMENTS_REQUIRED',
          message:
            'Card payments are not enabled on your connected Stripe account. Complete Stripe onboarding to enable card payments.',
          actionUrl: payoutsSetupUrl,
        },
        { status: 409 },
      );
    }

    const { checkoutSession, feeBreakdown } = await createInvoiceCheckoutSession(
      {
        id: invoice.id,
        amount: invoice.amount,
        invoice_number: invoice.invoice_number,
        customer_email: invoice.customer_email,
        user_email: ownerEmail,
        workspace_id: invoice.workspace_id,
      },
      baseUrl,
      {
        successUrl: `${payPageUrl}?paid=1`,
        cancelUrl: `${payPageUrl}?canceled=1`,
      },
    );

    const paymentIntentId =
      typeof checkoutSession.payment_intent === 'string'
        ? checkoutSession.payment_intent
        : typeof checkoutSession.payment_intent?.id === 'string'
          ? checkoutSession.payment_intent.id
          : null;
    const updated = await sql<{ id: string }[]>`
      UPDATE invoices
      SET
        processing_uplift_amount = ${feeBreakdown.processingUpliftAmount},
        payable_amount = ${feeBreakdown.payableAmount},
        platform_fee_amount = ${feeBreakdown.platformFeeAmount},
        stripe_checkout_session_id = ${checkoutSession.id},
        stripe_payment_intent_id = coalesce(${paymentIntentId}, stripe_payment_intent_id)
      WHERE id = ${invoice.id}
      RETURNING id
    `;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[public invoice checkout] persisted stripe ids', {
        invoiceId: invoice.id,
        checkoutSessionId: checkoutSession.id,
        paymentIntentId,
        feeBreakdown,
        rows: updated.length,
      });
    }

    if (!checkoutSession.url) {
      return NextResponse.json(
        { error: 'Missing Stripe Checkout URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: unknown) {
    if (isPricingFeesMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: PRICING_FEES_MIGRATION_REQUIRED_CODE,
          message:
            'Pricing and fees require DB migration 022_add_pricing_fee_fields.sql. Run migrations and retry.',
        },
        { status: 503 },
      );
    }
    if (isStripePermissionOrNoAccessError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: 'CONNECT_MODE_MISMATCH',
          message:
            'Check Stripe secret key + Connect account, re-authorize Connect if needed.',
          actionUrl: payoutsSetupUrl,
        },
        { status: 409 },
      );
    }
    const normalized = normalizeStripeConfigError(error);
    return NextResponse.json(
      {
        error: normalized.message,
        guidance: normalized.guidance,
        code: normalized.code,
      },
      { status: 500 },
    );
  }
}
