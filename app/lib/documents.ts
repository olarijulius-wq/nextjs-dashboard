import crypto from 'crypto';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL!, { ssl: 'require' });

export const DOCUMENTS_MIGRATION_REQUIRED_CODE = 'DOCUMENTS_MIGRATION_REQUIRED';

export type WorkspaceDocumentSettings = {
  invoicePrefix: string;
  nextInvoiceNumber: number;
  numberPadding: number;
  footerNote: string;
  logoDataUrl: string | null;
};

type WorkspaceDocumentSettingsRow = {
  invoice_prefix: string;
  next_invoice_number: number;
  number_padding: number;
  footer_note: string | null;
  logo_object_key: string | null;
};

function buildDocumentsMigrationRequiredError() {
  const error = new Error(DOCUMENTS_MIGRATION_REQUIRED_CODE) as Error & {
    code: string;
  };
  error.code = DOCUMENTS_MIGRATION_REQUIRED_CODE;
  return error;
}

export function isDocumentsMigrationRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === DOCUMENTS_MIGRATION_REQUIRED_CODE ||
      error.message === DOCUMENTS_MIGRATION_REQUIRED_CODE)
  );
}

let documentsSchemaReadyPromise: Promise<void> | null = null;

function toDocumentSettings(row?: WorkspaceDocumentSettingsRow): WorkspaceDocumentSettings {
  if (!row) {
    return {
      invoicePrefix: 'INV',
      nextInvoiceNumber: 1,
      numberPadding: 4,
      footerNote: '',
      logoDataUrl: null,
    };
  }

  return {
    invoicePrefix: row.invoice_prefix,
    nextInvoiceNumber: row.next_invoice_number,
    numberPadding: row.number_padding,
    footerNote: row.footer_note ?? '',
    logoDataUrl: row.logo_object_key ?? null,
  };
}

export async function assertDocumentsSchemaReady(): Promise<void> {
  if (!documentsSchemaReadyPromise) {
    documentsSchemaReadyPromise = (async () => {
      const [result] = await sql<{
        settings: string | null;
        files: string | null;
      }[]>`
        select
          to_regclass('public.workspace_document_settings') as settings,
          to_regclass('public.workspace_files') as files
      `;

      if (!result?.settings || !result?.files) {
        throw buildDocumentsMigrationRequiredError();
      }
    })();
  }

  return documentsSchemaReadyPromise;
}

export async function fetchWorkspaceDocumentSettings(
  workspaceId: string,
): Promise<WorkspaceDocumentSettings> {
  await assertDocumentsSchemaReady();

  const [row] = await sql<WorkspaceDocumentSettingsRow[]>`
    select
      invoice_prefix,
      next_invoice_number,
      number_padding,
      footer_note,
      logo_object_key
    from public.workspace_document_settings
    where workspace_id = ${workspaceId}
    limit 1
  `;

  return toDocumentSettings(row);
}

function validateInvoicePrefix(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('invoicePrefix');
  }

  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 12) {
    throw new Error('invoicePrefix');
  }

  if (!/^[A-Z0-9-]+$/.test(trimmed)) {
    throw new Error('invoicePrefix');
  }

  return trimmed;
}

function validateNextInvoiceNumber(value: unknown) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('nextInvoiceNumber');
  }
  return n;
}

function validateNumberPadding(value: unknown) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2 || n > 8) {
    throw new Error('numberPadding');
  }
  return n;
}

function validateFooterNote(value: unknown) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.length > 500) {
    throw new Error('footerNote');
  }
  return trimmed;
}

export async function updateWorkspaceDocumentSettings(
  workspaceId: string,
  patch: {
    invoicePrefix: unknown;
    nextInvoiceNumber: unknown;
    numberPadding: unknown;
    footerNote: unknown;
  },
): Promise<WorkspaceDocumentSettings> {
  await assertDocumentsSchemaReady();

  const invoicePrefix = validateInvoicePrefix(patch.invoicePrefix);
  const nextInvoiceNumber = validateNextInvoiceNumber(patch.nextInvoiceNumber);
  const numberPadding = validateNumberPadding(patch.numberPadding);
  const footerNote = validateFooterNote(patch.footerNote);

  await sql`
    insert into public.workspace_document_settings (
      workspace_id,
      invoice_prefix,
      next_invoice_number,
      number_padding,
      footer_note,
      updated_at
    )
    values (
      ${workspaceId},
      ${invoicePrefix},
      ${nextInvoiceNumber},
      ${numberPadding},
      ${footerNote || null},
      now()
    )
    on conflict (workspace_id)
    do update set
      invoice_prefix = excluded.invoice_prefix,
      next_invoice_number = excluded.next_invoice_number,
      number_padding = excluded.number_padding,
      footer_note = excluded.footer_note,
      updated_at = now()
  `;

  return fetchWorkspaceDocumentSettings(workspaceId);
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('logoDataUrl');
  }

  const contentType = match[1];
  const base64 = match[3];
  const buffer = Buffer.from(base64, 'base64');

  return {
    contentType,
    buffer,
  };
}

export async function setWorkspaceLogo(
  workspaceId: string,
  input: {
    dataUrl: unknown;
    filename: unknown;
    contentType: unknown;
    sizeBytes?: unknown;
  },
): Promise<void> {
  await assertDocumentsSchemaReady();

  if (typeof input.dataUrl !== 'string' || input.dataUrl.trim() === '') {
    throw new Error('logoDataUrl');
  }
  const dataUrl = input.dataUrl;

  if (typeof input.filename !== 'string' || input.filename.trim() === '') {
    throw new Error('logoFilename');
  }
  const filename = input.filename.trim();

  if (typeof input.contentType !== 'string') {
    throw new Error('logoContentType');
  }
  const contentType = input.contentType;

  if (contentType !== 'image/png' && contentType !== 'image/jpeg') {
    throw new Error('logoContentType');
  }

  const parsed = parseDataUrl(input.dataUrl);
  if (parsed.contentType !== contentType) {
    throw new Error('logoContentType');
  }

  const sizeBytes = Number(input.sizeBytes ?? parsed.buffer.byteLength);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 250 * 1024) {
    throw new Error('logoSize');
  }

  await sql.begin(async (tx) => {
    await tx.unsafe(
      `
      delete from public.workspace_files
      where workspace_id = $1
        and kind = 'logo'
      `,
      [workspaceId],
    );

    const objectKey = `logo:${workspaceId}:${Date.now()}:${crypto.randomUUID()}`;

    await tx.unsafe(
      `
      insert into public.workspace_files (
        workspace_id,
        kind,
        object_key,
        filename,
        content_type,
        size_bytes
      )
      values ($1, 'logo', $2, $3, $4, $5)
      `,
      [workspaceId, objectKey, filename, contentType, sizeBytes],
    );

    await tx.unsafe(
      `
      insert into public.workspace_document_settings (
        workspace_id,
        logo_object_key,
        updated_at
      )
      values ($1, $2, now())
      on conflict (workspace_id)
      do update set
        logo_object_key = excluded.logo_object_key,
        updated_at = now()
      `,
      [workspaceId, dataUrl],
    );
  });
}

export async function clearWorkspaceLogo(workspaceId: string): Promise<void> {
  await assertDocumentsSchemaReady();

  await sql.begin(async (tx) => {
    await tx.unsafe(
      `
      delete from public.workspace_files
      where workspace_id = $1
        and kind = 'logo'
      `,
      [workspaceId],
    );

    await tx.unsafe(
      `
      insert into public.workspace_document_settings (
        workspace_id,
        logo_object_key,
        updated_at
      )
      values ($1, null, now())
      on conflict (workspace_id)
      do update set
        logo_object_key = null,
        updated_at = now()
      `,
      [workspaceId],
    );
  });
}

export function formatInvoiceNumber(settings: WorkspaceDocumentSettings): string {
  const padded = String(settings.nextInvoiceNumber).padStart(
    settings.numberPadding,
    '0',
  );
  return `${settings.invoicePrefix}-${padded}`;
}
