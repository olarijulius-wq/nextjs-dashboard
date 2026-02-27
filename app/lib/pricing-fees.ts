import postgres from 'postgres';
import { PLAN_CONFIG, resolveEffectivePlan, type PlanId } from './config.ts';
import { resolveBillingContext } from './workspace-billing.ts';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const PRICING_FEES_MIGRATION_REQUIRED_CODE =
  'PRICING_FEES_MIGRATION_REQUIRED';

export type PricingFeeConfig = {
  processingUplift: {
    enabledByDefault: boolean;
    fixedCents: number;
    percent: number;
    payerLabel: string;
  };
};

export type WorkspacePricingSettings = {
  processingUpliftEnabled: boolean;
};

export type InvoiceFeeBreakdown = {
  baseAmount: number;
  processingUpliftAmount: number;
  payableAmount: number;
  platformFeeAmount: number;
  merchantNetAmount: number;
  processingUpliftEnabled: boolean;
  plan: PlanId;
};

function readNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function normalizeCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export const PRICING_FEE_CONFIG: PricingFeeConfig = {
  processingUplift: {
    enabledByDefault: readBooleanEnv('PROCESSING_UPLIFT_ENABLED_DEFAULT', true),
    fixedCents: normalizeCents(
      readNumberEnv('PROCESSING_UPLIFT_FIXED_CENTS', 30),
    ),
    percent: normalizePercent(
      readNumberEnv('PROCESSING_UPLIFT_PERCENT', 2.9),
    ),
    payerLabel: 'Payment processing included',
  },
};

function buildPricingFeesMigrationRequiredError() {
  const error = new Error(PRICING_FEES_MIGRATION_REQUIRED_CODE) as Error & {
    code: string;
  };
  error.code = PRICING_FEES_MIGRATION_REQUIRED_CODE;
  return error;
}

export function isPricingFeesMigrationRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === PRICING_FEES_MIGRATION_REQUIRED_CODE ||
      error.message === PRICING_FEES_MIGRATION_REQUIRED_CODE)
  );
}

let pricingFeesSchemaReadyPromise: Promise<void> | null = null;

export async function assertPricingFeesSchemaReady(): Promise<void> {
  if (!pricingFeesSchemaReadyPromise) {
    pricingFeesSchemaReadyPromise = (async () => {
      const [result] = await sql<{
        workspace_pricing_settings: string | null;
        has_processing_uplift_amount: boolean;
        has_payable_amount: boolean;
        has_platform_fee_amount: boolean;
      }[]>`
        select
          to_regclass('public.workspace_pricing_settings') as workspace_pricing_settings,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'invoices'
              and column_name = 'processing_uplift_amount'
          ) as has_processing_uplift_amount,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'invoices'
              and column_name = 'payable_amount'
          ) as has_payable_amount,
          exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'invoices'
              and column_name = 'platform_fee_amount'
          ) as has_platform_fee_amount
      `;

      if (
        !result?.workspace_pricing_settings ||
        !result.has_processing_uplift_amount ||
        !result.has_payable_amount ||
        !result.has_platform_fee_amount
      ) {
        throw buildPricingFeesMigrationRequiredError();
      }
    })();
  }

  return pricingFeesSchemaReadyPromise;
}

function computePlatformFeeAmount(baseAmount: number, plan: PlanId): number {
  const normalizedBaseAmount = normalizeCents(baseAmount);
  const { platformFeeFixedCents, platformFeePercent, platformFeeCapCents } =
    PLAN_CONFIG[plan];
  const fixedCents = normalizeCents(platformFeeFixedCents);
  const percent = normalizePercent(platformFeePercent);
  const capCents = normalizeCents(platformFeeCapCents);
  const percentAmount = Math.round((normalizedBaseAmount * percent) / 100);
  return Math.max(0, Math.min(fixedCents + percentAmount, capCents));
}

function computeProcessingUpliftAmount(baseAmount: number): number {
  const normalizedBaseAmount = normalizeCents(baseAmount);
  const { fixedCents, percent } = PRICING_FEE_CONFIG.processingUplift;
  const rate = percent / 100;

  if (rate <= 0) {
    return fixedCents;
  }

  if (rate >= 1) {
    return fixedCents;
  }

  // Gross-up: target payable so processor fee on payable still leaves base amount.
  const payableAmount = Math.ceil((normalizedBaseAmount + fixedCents) / (1 - rate));
  return Math.max(0, payableAmount - normalizedBaseAmount);
}

export function computeInvoiceFeeBreakdown(
  baseAmount: number,
  processingUpliftEnabled: boolean,
  plan: PlanId = 'free',
): InvoiceFeeBreakdown {
  const normalizedBaseAmount = normalizeCents(baseAmount);
  const processingUpliftAmount = processingUpliftEnabled
    ? computeProcessingUpliftAmount(normalizedBaseAmount)
    : 0;
  const payableAmount = normalizedBaseAmount + processingUpliftAmount;
  const platformFeeAmount = computePlatformFeeAmount(normalizedBaseAmount, plan);
  const merchantNetAmount = Math.max(0, normalizedBaseAmount - platformFeeAmount);

  return {
    baseAmount: normalizedBaseAmount,
    processingUpliftAmount,
    payableAmount,
    platformFeeAmount,
    merchantNetAmount,
    processingUpliftEnabled,
    plan,
  };
}

export async function fetchWorkspacePricingSettings(
  workspaceId: string,
): Promise<WorkspacePricingSettings> {
  await assertPricingFeesSchemaReady();

  const [row] = await sql<{
    processing_uplift_enabled: boolean;
  }[]>`
    select processing_uplift_enabled
    from public.workspace_pricing_settings
    where workspace_id = ${workspaceId}
    limit 1
  `;

  return {
    processingUpliftEnabled:
      row?.processing_uplift_enabled ??
      PRICING_FEE_CONFIG.processingUplift.enabledByDefault,
  };
}

export async function upsertWorkspacePricingSettings(
  workspaceId: string,
  input: WorkspacePricingSettings,
): Promise<WorkspacePricingSettings> {
  await assertPricingFeesSchemaReady();

  const [saved] = await sql<{
    processing_uplift_enabled: boolean;
  }[]>`
    insert into public.workspace_pricing_settings (
      workspace_id,
      processing_uplift_enabled
    )
    values (
      ${workspaceId},
      ${input.processingUpliftEnabled}
    )
    on conflict (workspace_id)
    do update set
      processing_uplift_enabled = excluded.processing_uplift_enabled,
      updated_at = now()
    returning processing_uplift_enabled
  `;

  return {
    processingUpliftEnabled:
      saved?.processing_uplift_enabled ??
      PRICING_FEE_CONFIG.processingUplift.enabledByDefault,
  };
}

export async function fetchWorkspacePricingSettingsForUserEmail(
  userEmail: string,
): Promise<WorkspacePricingSettings> {
  await assertPricingFeesSchemaReady();

  const [row] = await sql<{
    processing_uplift_enabled: boolean | null;
  }[]>`
    select
      wps.processing_uplift_enabled
    from public.users u
    left join public.workspaces w_active
      on w_active.id = u.active_workspace_id
    left join public.workspaces w_owner
      on w_owner.owner_user_id = u.id
    left join public.workspace_pricing_settings wps
      on wps.workspace_id = coalesce(w_active.id, w_owner.id, u.active_workspace_id)
    where lower(u.email) = lower(${userEmail})
    limit 1
  `;

  return {
    processingUpliftEnabled:
      row?.processing_uplift_enabled ??
      PRICING_FEE_CONFIG.processingUplift.enabledByDefault,
  };
}

async function resolveWorkspaceIdForUserEmail(userEmail: string): Promise<string | null> {
  const [row] = await sql<{ workspace_id: string | null }[]>`
    select coalesce(w_active.id, w_owner.id, u.active_workspace_id) as workspace_id
    from public.users u
    left join public.workspaces w_active
      on w_active.id = u.active_workspace_id
    left join public.workspaces w_owner
      on w_owner.owner_user_id = u.id
    where lower(u.email) = lower(${userEmail})
    limit 1
  `;

  return row?.workspace_id ?? null;
}

export async function computeInvoiceFeeBreakdownForUser(
  userEmail: string,
  baseAmount: number,
): Promise<InvoiceFeeBreakdown> {
  const normalizedEmail = userEmail.trim().toLowerCase();
  const [settings, workspaceId] = await Promise.all([
    fetchWorkspacePricingSettingsForUserEmail(normalizedEmail),
    resolveWorkspaceIdForUserEmail(normalizedEmail),
  ]);
  const billing = workspaceId
    ? await resolveBillingContext({
      workspaceId,
      userEmail: normalizedEmail,
    })
    : {
      plan: 'free',
      subscriptionStatus: null,
    };

  const effectivePlan = resolveEffectivePlan(
    billing.plan,
    billing.subscriptionStatus,
  );
  return computeInvoiceFeeBreakdown(
    baseAmount,
    settings.processingUpliftEnabled,
    effectivePlan,
  );
}
