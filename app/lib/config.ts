export const PLAN_IDS = ['free', 'solo', 'pro', 'studio'] as const;

export type PlanId = (typeof PLAN_IDS)[number];
export const PAID_PLAN_IDS = ['solo', 'pro', 'studio'] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];
export const BILLING_INTERVALS = ['monthly', 'annual'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export const SOLO_ANNUAL_MONTHS = 11;
export const PRO_ANNUAL_MONTHS = 10;
export const STUDIO_ANNUAL_MONTHS = 10;

export type PlanConfig = {
  id: PlanId;
  name: string;
  maxPerMonth: number;
  priceMonthlyEuro: number;
  platformFeeFixedCents: number;
  platformFeePercent: number;
  platformFeeCapCents: number;
  canExportCsv: boolean;
  hasReminders: boolean;
  hasLatePayerAnalytics: boolean;
};

export const TEAM_SEAT_LIMIT_BY_PLAN: Record<PlanId, number> = {
  free: 1,
  solo: 1,
  pro: 3,
  studio: 10,
};

export const COMPANY_LIMIT_BY_PLAN: Record<PlanId, number> = {
  free: 1,
  solo: 1,
  pro: 3,
  studio: Number.POSITIVE_INFINITY,
};

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    maxPerMonth: 3,
    priceMonthlyEuro: 0,
    platformFeeFixedCents: 60,
    platformFeePercent: 1.5,
    platformFeeCapCents: 1500,
    canExportCsv: false,
    hasReminders: false,
    hasLatePayerAnalytics: false,
  },
  solo: {
    id: 'solo',
    name: 'Solo',
    maxPerMonth: 50,
    priceMonthlyEuro: 29,
    platformFeeFixedCents: 45,
    platformFeePercent: 1.0,
    platformFeeCapCents: 1000,
    canExportCsv: true,
    hasReminders: true,
    hasLatePayerAnalytics: true,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    maxPerMonth: 250,
    priceMonthlyEuro: 59,
    platformFeeFixedCents: 30,
    platformFeePercent: 0.7,
    platformFeeCapCents: 700,
    canExportCsv: true,
    hasReminders: true,
    hasLatePayerAnalytics: true,
  },
  studio: {
    id: 'studio',
    name: 'Studio',
    maxPerMonth: Number.POSITIVE_INFINITY,
    priceMonthlyEuro: 199,
    platformFeeFixedCents: 20,
    platformFeePercent: 0.4,
    platformFeeCapCents: 500,
    canExportCsv: true,
    hasReminders: true,
    hasLatePayerAnalytics: true,
  },
};

export const STRIPE_PRICE_ID_BY_PLAN: Record<
  Exclude<PlanId, 'free'>,
  string | undefined
> = {
  solo: process.env.STRIPE_PRICE_SOLO,
  pro: process.env.STRIPE_PRICE_PRO,
  // Studio is €199/month; keep Stripe Checkout mapped to STRIPE_PRICE_STUDIO.
  studio: process.env.STRIPE_PRICE_STUDIO,
};

export const STRIPE_PRICE_ID_BY_PLAN_AND_INTERVAL: Record<
  Exclude<PlanId, 'free'>,
  Record<BillingInterval, string | undefined>
> = {
  solo: {
    monthly: process.env.STRIPE_PRICE_SOLO,
    annual: process.env.STRIPE_PRICE_SOLO_ANNUAL,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO,
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
  },
  studio: {
    monthly: process.env.STRIPE_PRICE_STUDIO,
    annual: process.env.STRIPE_PRICE_STUDIO_ANNUAL,
  },
};

export const STRIPE_PRODUCT_ID_BY_PLAN: Record<PaidPlanId, string | undefined> = {
  solo: process.env.STRIPE_PRODUCT_SOLO,
  pro: process.env.STRIPE_PRODUCT_PRO,
  studio: process.env.STRIPE_PRODUCT_STUDIO,
};

export function normalizePlan(plan: string | null | undefined): PlanId {
  if (!plan) return 'free';
  return PLAN_IDS.includes(plan as PlanId) ? (plan as PlanId) : 'free';
}

export function normalizePaidPlan(plan: string | null | undefined): PaidPlanId | null {
  if (!plan) return null;
  const normalized = normalizePlan(plan);
  return normalized === 'free' ? null : normalized;
}

export function planFromStripePriceLookupKey(
  lookupKey: string | null | undefined,
): PaidPlanId | null {
  if (!lookupKey) return null;
  const normalized = lookupKey.trim().toLowerCase();
  if (!normalized) return null;

  if (/(^|[^a-z])solo([^a-z]|$)/.test(normalized)) return 'solo';
  if (/(^|[^a-z])pro([^a-z]|$)/.test(normalized)) return 'pro';
  if (/(^|[^a-z])studio([^a-z]|$)/.test(normalized)) return 'studio';
  return null;
}

export function isActiveSubscription(status: string | null | undefined) {
  return status === 'active' || status === 'trialing';
}

export function resolveEffectivePlan(
  plan: string | null | undefined,
  status: string | null | undefined,
) {
  const normalized = normalizePlan(plan);
  if (normalized === 'free') return 'free';
  return isActiveSubscription(status) ? normalized : 'free';
}

export function planFromStripePriceId(
  priceId: string | null | undefined,
): PlanId | null {
  if (!priceId) return null;

  const match = (
    Object.entries(STRIPE_PRICE_ID_BY_PLAN_AND_INTERVAL) as Array<
      [Exclude<PlanId, 'free'>, Record<BillingInterval, string | undefined>]
    >
  ).find(([, byInterval]) =>
    Object.values(byInterval).some((id) => id && id === priceId),
  );

  return match ? match[0] : null;
}

export function planFromStripeProductId(
  productId: string | null | undefined,
): PaidPlanId | null {
  if (!productId) return null;

  const match = (Object.entries(STRIPE_PRODUCT_ID_BY_PLAN) as Array<
    [PaidPlanId, string | undefined]
  >).find(([, configuredProductId]) => configuredProductId && configuredProductId === productId);

  return match ? match[0] : null;
}

export function resolvePaidPlanFromStripe(input: {
  metadataPlan?: string | null;
  priceId?: string | null;
  priceLookupKey?: string | null;
  productId?: string | null;
  productMetadataPlan?: string | null;
}): PaidPlanId | null {
  const metadataPlan = normalizePaidPlan(input.metadataPlan);
  if (metadataPlan) return metadataPlan;

  const planFromProductMetadata = normalizePaidPlan(input.productMetadataPlan);
  if (planFromProductMetadata) return planFromProductMetadata;

  const planFromLookupKey = planFromStripePriceLookupKey(input.priceLookupKey);
  if (planFromLookupKey) return planFromLookupKey;

  const planFromPrice = planFromStripePriceId(input.priceId);
  if (planFromPrice && planFromPrice !== 'free') return planFromPrice;

  return planFromStripeProductId(input.productId);
}

export function getAnnualPriceDisplay(planId: PlanId): number {
  const monthlyPrice = PLAN_CONFIG[planId].priceMonthlyEuro;
  if (planId === 'solo') return monthlyPrice * SOLO_ANNUAL_MONTHS;
  if (planId === 'pro') return monthlyPrice * PRO_ANNUAL_MONTHS;
  if (planId === 'studio') return monthlyPrice * STUDIO_ANNUAL_MONTHS;
  return monthlyPrice;
}

export function getAnnualSavingsLabel(planId: PlanId): string {
  if (planId === 'solo') return 'Save 1 month';
  if (planId === 'pro' || planId === 'studio') return 'Save 2 months';
  return '';
}
