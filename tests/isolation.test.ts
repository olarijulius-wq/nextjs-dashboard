import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import postgres from 'postgres';

type WorkspaceContext = {
  userEmail: string;
  workspaceId: string;
};

type TestContext = {
  userId: string;
  userEmail: string;
  teammateUserId: string;
  teammateUserEmail: string;
  workspaceA: string;
  workspaceB: string;
  customerA: string;
  customerB: string;
  invoiceA: string;
  invoiceB: string;
};

function requireTestDatabaseUrl() {
  const url = process.env.POSTGRES_URL_TEST?.trim();
  if (!url) {
    throw new Error('Missing POSTGRES_URL_TEST.');
  }
  return url;
}

const testDbUrl = requireTestDatabaseUrl();
process.env.POSTGRES_URL = testDbUrl;
process.env.DATABASE_URL = testDbUrl;
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-auth-secret';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
process.env.PAY_LINK_SECRET = process.env.PAY_LINK_SECRET || 'test-pay-link-secret';
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.LATELLESS_TEST_MODE = '1';

const sql = postgres(testDbUrl, { ssl: 'require', prepare: false });
const sqlClients: Array<ReturnType<typeof postgres>> = [sql];

async function closeSqlClients() {
  await Promise.allSettled(
    sqlClients.map((client) => client.end({ timeout: 5 })),
  );
}

async function resetDb() {
  await sql`
    truncate table
      public.invoice_email_logs,
      public.company_profiles,
      public.invoices,
      public.customers,
      public.workspace_invites,
      public.workspace_members,
      public.workspaces,
      public.nextauth_sessions,
      public.nextauth_accounts,
      public.users
    restart identity cascade
  `;
}

async function seedFixtures(): Promise<TestContext> {
  const userId = '11111111-1111-4111-8111-111111111111';
  const teammateUserId = '22222222-2222-4222-8222-222222222222';
  const workspaceA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const workspaceB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const customerA = 'aaaaaaaa-1111-4111-8111-aaaaaaaa1111';
  const customerB = 'bbbbbbbb-2222-4222-8222-bbbbbbbb2222';
  const invoiceA = 'aaaaaaaa-3333-4333-8333-aaaaaaaa3333';
  const invoiceB = 'bbbbbbbb-4444-4444-8444-bbbbbbbb4444';
  const userEmail = 'isolation-owner@example.com';
  const teammateUserEmail = 'isolation-member@example.com';

  await sql`
    insert into public.users (
      id,
      name,
      email,
      password,
      is_verified,
      plan,
      subscription_status
    )
    values (
      ${userId},
      'Isolation Owner',
      ${userEmail},
      '$2b$10$uD50r8jflxRQQ6MShwbVVuAVrkMtk0iA0WIMRqjYOEoTP0TO.Zi5q',
      true,
      'solo',
      'active'
    )
  `;
  await sql`
    insert into public.users (
      id,
      name,
      email,
      password,
      is_verified,
      plan,
      subscription_status
    )
    values (
      ${teammateUserId},
      'Isolation Member',
      ${teammateUserEmail},
      '$2b$10$uD50r8jflxRQQ6MShwbVVuAVrkMtk0iA0WIMRqjYOEoTP0TO.Zi5q',
      true,
      'solo',
      'active'
    )
  `;

  await sql`
    insert into public.workspaces (id, name, owner_user_id)
    values
      (${workspaceA}, 'Workspace A', ${userId}),
      (${workspaceB}, 'Workspace B', ${userId})
  `;

  await sql`
    insert into public.workspace_members (workspace_id, user_id, role)
    values
      (${workspaceA}, ${userId}, 'owner'),
      (${workspaceA}, ${teammateUserId}, 'member'),
      (${workspaceB}, ${userId}, 'owner')
  `;

  await sql`
    update public.users
    set active_workspace_id = ${workspaceA}
    where id = ${userId}
  `;

  await sql`
    insert into public.customers (id, name, email, user_email, workspace_id)
    values
      (${customerA}, 'Customer A', 'a@example.com', ${userEmail}, ${workspaceA}),
      (${customerB}, 'Customer B', 'b@example.com', ${userEmail}, ${workspaceB})
  `;

  await sql`
    insert into public.invoices (
      id,
      customer_id,
      amount,
      status,
      date,
      due_date,
      user_email,
      invoice_number,
      workspace_id,
      created_at
    )
    values
      (
        ${invoiceA},
        ${customerA},
        15000,
        'pending',
        date '2026-01-10',
        date '2026-01-20',
        ${userEmail},
        'A-001',
        ${workspaceA},
        now()
      ),
      (
        ${invoiceB},
        ${customerB},
        27000,
        'pending',
        date '2026-01-11',
        date '2026-01-21',
        ${userEmail},
        'B-001',
        ${workspaceB},
        now()
      )
  `;

  return {
    userId,
    userEmail,
    teammateUserId,
    teammateUserEmail,
    workspaceA,
    workspaceB,
    customerA,
    customerB,
    invoiceA,
    invoiceB,
  };
}

async function run() {
  try {
    execSync('node scripts/assert-hooks-disabled.mjs', {
      stdio: 'inherit',
      env: {
        ...process.env,
        POSTGRES_URL: testDbUrl,
        DATABASE_URL: testDbUrl,
      },
    });

    execSync('pnpm db:migrate', {
      stdio: 'inherit',
      env: {
        ...process.env,
        POSTGRES_URL: testDbUrl,
        DATABASE_URL: testDbUrl,
      },
    });

    const dataModule = await import('@/app/lib/data');
    const publicBrandingModule = await import('@/app/lib/public-branding');
    const invoiceExportRoute = await import('@/app/api/invoices/export/route');
    const customerExportRoute = await import('@/app/api/customers/export/route');
    const sendInvoiceRoute = await import('@/app/api/invoices/[id]/send/route');

    let failures = 0;

    async function runCase(name: string, fn: () => Promise<void>) {
      try {
        await resetDb();
        await fn();
        console.log(`PASS ${name}`);
      } catch (error) {
        failures += 1;
        console.error(`FAIL ${name}`);
        console.error(error);
      } finally {
        dataModule.__testHooks.requireWorkspaceContextOverride = null;
        invoiceExportRoute.__testHooks.authOverride = null;
        invoiceExportRoute.__testHooks.requireWorkspaceContextOverride = null;
        invoiceExportRoute.__testHooks.enforceRateLimitOverride = null;
        customerExportRoute.__testHooks.authOverride = null;
        customerExportRoute.__testHooks.requireWorkspaceContextOverride = null;
        customerExportRoute.__testHooks.enforceRateLimitOverride = null;
        sendInvoiceRoute.__testHooks.authOverride = null;
        sendInvoiceRoute.__testHooks.enforceRateLimitOverride = null;
        sendInvoiceRoute.__testHooks.requireWorkspaceRoleOverride = null;
        sendInvoiceRoute.__testHooks.sendInvoiceEmailOverride = null;
        sendInvoiceRoute.__testHooks.revalidatePathOverride = null;
      }
    }

    await runCase('listing isolation (invoices + customers)', async () => {
      const fixtures = await seedFixtures();
      const workspaceAContext: WorkspaceContext = {
        userEmail: fixtures.userEmail,
        workspaceId: fixtures.workspaceA,
      };

      dataModule.__testHooks.requireWorkspaceContextOverride = async () => workspaceAContext;

      const invoices = await dataModule.fetchFilteredInvoices('', 1, 'all', 'created_at', 'desc', 25);
      const customers = await dataModule.fetchFilteredCustomers('', 1, 25, 'name', 'asc');

      assert.equal(invoices.length, 1, 'workspace A should only see one invoice');
      assert.equal(invoices[0].id, fixtures.invoiceA);
      assert.equal(customers.length, 1, 'workspace A should only see one customer');
      assert.equal(customers[0].id, fixtures.customerA);
    });

    await runCase('same-workspace members share listing + export visibility', async () => {
      const fixtures = await seedFixtures();
      const workspaceAOwnerContext: WorkspaceContext = {
        userEmail: fixtures.userEmail,
        workspaceId: fixtures.workspaceA,
      };
      const workspaceAMemberContext: WorkspaceContext = {
        userEmail: fixtures.teammateUserEmail,
        workspaceId: fixtures.workspaceA,
      };
      const noRateLimit = async () => null;

      dataModule.__testHooks.requireWorkspaceContextOverride = async () => workspaceAOwnerContext;
      const ownerInvoices = await dataModule.fetchFilteredInvoices('', 1, 'all', 'created_at', 'desc', 25);
      assert.equal(ownerInvoices.length, 1, 'owner should see workspace A invoice');
      assert.equal(ownerInvoices[0].id, fixtures.invoiceA);

      dataModule.__testHooks.requireWorkspaceContextOverride = async () => workspaceAMemberContext;
      const memberInvoices = await dataModule.fetchFilteredInvoices('', 1, 'all', 'created_at', 'desc', 25);
      assert.equal(memberInvoices.length, 1, 'member should see same workspace A invoice');
      assert.equal(memberInvoices[0].id, fixtures.invoiceA);

      const memberAuthSession = async () => ({ user: { email: fixtures.teammateUserEmail } });
      invoiceExportRoute.__testHooks.authOverride = memberAuthSession;
      invoiceExportRoute.__testHooks.requireWorkspaceContextOverride = async () => workspaceAMemberContext;
      invoiceExportRoute.__testHooks.enforceRateLimitOverride = noRateLimit;

      const invoiceExportRes = await invoiceExportRoute.GET(
        new Request('http://localhost/api/invoices/export'),
      );
      const invoiceExportCsv = await invoiceExportRes.text();
      assert.equal(invoiceExportRes.status, 200, 'member invoice export should succeed');
      assert.match(invoiceExportCsv, new RegExp(fixtures.invoiceA));
      assert.doesNotMatch(invoiceExportCsv, new RegExp(fixtures.invoiceB));
    });

    await runCase('public branding resolves by invoice workspace (not user email)', async () => {
      const fixtures = await seedFixtures();

      await sql`
        insert into public.company_profiles (
          user_email,
          workspace_id,
          company_name,
          billing_email
        )
        values
          (${fixtures.userEmail}, ${fixtures.workspaceA}, 'Workspace A Brand', 'billing-a@example.com'),
          (${fixtures.userEmail}, ${fixtures.workspaceB}, 'Workspace B Brand', 'billing-b@example.com')
      `;

      const workspaceABranding = await publicBrandingModule.getCompanyProfileForInvoiceWorkspace({
        invoiceId: fixtures.invoiceA,
        workspaceId: fixtures.workspaceA,
        userEmail: fixtures.userEmail,
      });

      assert.equal(workspaceABranding.companyName, 'Workspace A Brand');
      assert.equal(workspaceABranding.billingEmail, 'billing-a@example.com');
      assert.notEqual(workspaceABranding.companyName, 'Workspace B Brand');
    });

    await runCase('export isolation (invoices + customers)', async () => {
      const fixtures = await seedFixtures();
      const workspaceAContext: WorkspaceContext = {
        userEmail: fixtures.userEmail,
        workspaceId: fixtures.workspaceA,
      };

      const authSession = async () => ({ user: { email: fixtures.userEmail } });
      const noRateLimit = async () => null;

      invoiceExportRoute.__testHooks.authOverride = authSession;
      invoiceExportRoute.__testHooks.requireWorkspaceContextOverride = async () => workspaceAContext;
      invoiceExportRoute.__testHooks.enforceRateLimitOverride = noRateLimit;

      customerExportRoute.__testHooks.authOverride = authSession;
      customerExportRoute.__testHooks.requireWorkspaceContextOverride = async () => workspaceAContext;
      customerExportRoute.__testHooks.enforceRateLimitOverride = noRateLimit;

      const invoiceRes = await invoiceExportRoute.GET(
        new Request('http://localhost/api/invoices/export'),
      );
      const invoiceCsv = await invoiceRes.text();
      assert.equal(invoiceRes.status, 200, 'invoice export should succeed');
      assert.match(invoiceCsv, new RegExp(fixtures.invoiceA));
      assert.doesNotMatch(invoiceCsv, new RegExp(fixtures.invoiceB));

      const customerRes = await customerExportRoute.GET(
        new Request('http://localhost/api/customers/export'),
      );
      const customerCsv = await customerRes.text();
      assert.equal(customerRes.status, 200, 'customer export should succeed');
      assert.match(customerCsv, new RegExp(fixtures.customerA));
      assert.doesNotMatch(customerCsv, new RegExp(fixtures.customerB));
    });

    await runCase('send isolation blocks cross-workspace invoice send', async () => {
      const fixtures = await seedFixtures();
      let sendCalled = false;

      sendInvoiceRoute.__testHooks.authOverride = async () => ({ user: { email: fixtures.userEmail } });
      sendInvoiceRoute.__testHooks.requireWorkspaceRoleOverride = async () => ({
        workspaceId: fixtures.workspaceA,
        role: 'owner',
      });
      sendInvoiceRoute.__testHooks.enforceRateLimitOverride = async () => null;
      sendInvoiceRoute.__testHooks.sendInvoiceEmailOverride = async () => {
        sendCalled = true;
        return { provider: 'test', sentAt: new Date().toISOString() };
      };
      sendInvoiceRoute.__testHooks.revalidatePathOverride = () => {};

      const res = await sendInvoiceRoute.POST(
        new Request(`http://localhost/api/invoices/${fixtures.invoiceB}/send`, { method: 'POST' }),
        { params: Promise.resolve({ id: fixtures.invoiceB }) },
      );

      assert.ok(
        res.status === 403 || res.status === 404,
        `expected 403 or 404 for cross-workspace send, got ${res.status}`,
      );
      assert.equal(sendCalled, false, 'cross-workspace invoice must not trigger email send');
    });

    if (failures > 0) {
      process.exitCode = 1;
      throw new Error(`${failures} isolation test(s) failed.`);
    }

    console.log('All isolation tests passed.');

    if (process.env.NODE_ENV === 'test') {
      setTimeout(() => {
        const proc = process as NodeJS.Process & {
          _getActiveHandles?: () => unknown[];
          _getActiveRequests?: () => unknown[];
        };
        const handles = proc._getActiveHandles?.() ?? [];
        const requests = proc._getActiveRequests?.() ?? [];

        if (handles.length > 0 || requests.length > 0) {
          console.log('[isolation] Active handles before forced exit:', handles);
          console.log('[isolation] Active requests before forced exit:', requests);
        }

        process.exit(0);
      }, 1500);
    }
  } finally {
    await closeSqlClients();
  }
}

run().catch(async (error) => {
  console.error(error);
  await closeSqlClients().catch(() => {});
  process.exit(1);
});
