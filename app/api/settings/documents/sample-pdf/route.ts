import { NextResponse } from 'next/server';
import type PDFDocumentType from 'pdfkit';
import {
  DOCUMENTS_MIGRATION_REQUIRED_CODE,
  fetchWorkspaceDocumentSettings,
  formatInvoiceNumber,
  isDocumentsMigrationRequiredError,
} from '@/app/lib/documents';
import {
  ensureWorkspaceContextForCurrentUser,
  isTeamMigrationRequiredError,
} from '@/app/lib/workspaces';

export const runtime = 'nodejs';

const PDFDocument = require('pdfkit/js/pdfkit.standalone') as typeof PDFDocumentType;

const migrationMessage =
  'Documents requires DB migrations 007_add_workspaces_and_team.sql and 010_add_documents_settings.sql. Run migrations and retry.';

function decodeDataUrlImage(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/(png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;

  return {
    contentType: match[1],
    buffer: Buffer.from(match[3], 'base64'),
  };
}

async function buildSamplePdf(settings: {
  invoicePrefix: string;
  nextInvoiceNumber: number;
  numberPadding: number;
  footerNote: string;
  logoDataUrl: string | null;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (settings.logoDataUrl) {
      const logo = decodeDataUrlImage(settings.logoDataUrl);
      if (logo) {
        try {
          doc.image(logo.buffer, 50, 45, { fit: [120, 60] });
        } catch {
          // Ignore invalid image bytes and continue PDF generation.
        }
      }
    }

    doc.fontSize(24).text('Sample Invoice', 50, 120);
    doc.moveDown();

    doc
      .fontSize(12)
      .text(`Invoice number: ${formatInvoiceNumber(settings)}`)
      .moveDown(0.5)
      .text('Amount: EUR 150.00')
      .moveDown(0.5)
      .text('Date: 2026-02-09')
      .moveDown(0.5)
      .text('Customer: Sample Customer');

    if (settings.footerNote) {
      doc.moveDown(2);
      doc.fontSize(10).fillColor('#444444').text(settings.footerNote, {
        width: 500,
      });
    }

    doc.end();
  });
}

export async function GET() {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();

    if (context.userRole !== 'owner') {
      return NextResponse.json(
        { ok: false, message: 'Only owners can download sample PDF.' },
        { status: 403 },
      );
    }

    const settings = await fetchWorkspaceDocumentSettings(context.workspaceId);
    const pdfBuffer = await buildSamplePdf(settings);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="sample-invoice.pdf"',
      },
    });
  } catch (error) {
    if (isTeamMigrationRequiredError(error) || isDocumentsMigrationRequiredError(error)) {
      return NextResponse.json(
        {
          ok: false,
          code: DOCUMENTS_MIGRATION_REQUIRED_CODE,
          message: migrationMessage,
        },
        { status: 503 },
      );
    }

    console.error('Sample PDF generation failed:', error);
    return NextResponse.json(
      { ok: false, message: 'Failed to generate sample PDF.' },
      { status: 500 },
    );
  }
}
