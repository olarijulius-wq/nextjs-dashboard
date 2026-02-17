import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

const SAMPLE_LIMIT = 50;
const MIN_SAMPLE_COUNT = 10;
const MIN_GROSS_FOR_PERCENT_CENTS = 5000;

export type StripeProcessingEstimatorScope =
  | { type: 'user_email'; userEmail: string };

export type StripeProcessingFeeEstimate = {
  ok: boolean;
  feeEstimateCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  sampleCount: number;
  model: {
    percentBp: number;
    fixedCents: number;
  } | null;
};

type StripeFeeSample = {
  stripe_fee_cents: number;
  stripe_gross_cents: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeCurrency(currency: string) {
  return currency.trim().toLowerCase();
}

function clampToNonNegativeInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[index];
}

async function fetchUserEmailSamples(
  userEmail: string,
  currency: string,
): Promise<StripeFeeSample[]> {
  const normalizedEmail = normalizeEmail(userEmail);
  return sql<StripeFeeSample[]>`
    select
      i.stripe_processing_fee_amount as stripe_fee_cents,
      i.payable_amount as stripe_gross_cents
    from public.invoices i
    where lower(i.user_email) = ${normalizedEmail}
      and i.status = 'paid'
      and i.paid_at >= now() - interval '90 days'
      and lower(i.currency) = ${currency}
      and i.stripe_processing_fee_amount is not null
      and i.payable_amount is not null
    order by i.paid_at desc
    limit ${SAMPLE_LIMIT}
  `;
}

function getNotEnoughDataResult(sampleCount: number): StripeProcessingFeeEstimate {
  return {
    ok: false,
    feeEstimateCents: null,
    lowCents: null,
    highCents: null,
    sampleCount,
    model: null,
  };
}

export async function resolveStripeProcessingEstimatorScopeForUser(
  userEmail: string,
): Promise<StripeProcessingEstimatorScope> {
  const normalizedEmail = normalizeEmail(userEmail);
  return { type: 'user_email', userEmail: normalizedEmail };
}

export async function estimateStripeProcessingFee({
  scope,
  currency,
  chargeAmountCents,
}: {
  scope: StripeProcessingEstimatorScope;
  currency: string;
  chargeAmountCents: number;
}): Promise<StripeProcessingFeeEstimate> {
  const normalizedCurrency = normalizeCurrency(currency);
  const normalizedChargeAmountCents = clampToNonNegativeInteger(chargeAmountCents);

  if (!normalizedCurrency || normalizedChargeAmountCents <= 0) {
    return getNotEnoughDataResult(0);
  }

  const rawSamples = await fetchUserEmailSamples(
    scope.userEmail,
    normalizedCurrency,
  );

  const samples = rawSamples.filter(
    (sample) =>
      Number.isFinite(sample.stripe_fee_cents) &&
      Number.isFinite(sample.stripe_gross_cents) &&
      sample.stripe_gross_cents > 0,
  );
  const sampleCount = samples.length;

  if (sampleCount < MIN_SAMPLE_COUNT) {
    return getNotEnoughDataResult(sampleCount);
  }

  const percentBpCandidates = samples
    .filter((sample) => sample.stripe_gross_cents >= MIN_GROSS_FOR_PERCENT_CENTS)
    .map((sample) =>
      Math.round((sample.stripe_fee_cents * 10000) / sample.stripe_gross_cents),
    );

  const percentMedian = median(percentBpCandidates);
  if (percentMedian === null) {
    return getNotEnoughDataResult(sampleCount);
  }
  const percentBp = Math.round(percentMedian);

  const fixedCandidates = samples.map((sample) => {
    const variablePart = Math.round(
      (sample.stripe_gross_cents * percentBp) / 10000,
    );
    return sample.stripe_fee_cents - variablePart;
  });
  const fixedMedian = median(fixedCandidates);
  if (fixedMedian === null) {
    return getNotEnoughDataResult(sampleCount);
  }
  const fixedCents = Math.round(fixedMedian);

  const residuals = samples.map((sample) => {
    const predicted =
      fixedCents + Math.round((sample.stripe_gross_cents * percentBp) / 10000);
    return sample.stripe_fee_cents - predicted;
  });

  const feeEstimateCents =
    fixedCents + Math.round((normalizedChargeAmountCents * percentBp) / 10000);
  const p10Residual = percentile(residuals, 0.1);
  const p90Residual = percentile(residuals, 0.9);
  const lowCents = clampToNonNegativeInteger(feeEstimateCents + p10Residual);
  const highCents = Math.max(
    lowCents,
    clampToNonNegativeInteger(feeEstimateCents + p90Residual),
  );

  return {
    ok: true,
    feeEstimateCents: clampToNonNegativeInteger(feeEstimateCents),
    lowCents,
    highCents,
    sampleCount,
    model: {
      percentBp,
      fixedCents,
    },
  };
}
