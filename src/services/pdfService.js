import PDFDocument from 'pdfkit';

// ─── Layout constants ────────────────────────────────────────────────────────
const MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const COL = {
  description: MARGIN,
  qty: 310,
  unitPrice: 370,
  taxRate: 440,
  amount: 500,
};
const TABLE_RIGHT = PAGE_WIDTH - MARGIN;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(currency, amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 2,
  }).format(amount ?? 0);
}

function fmtDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function drawHRule(doc, y, color = '#CCCCCC') {
  doc
    .moveTo(MARGIN, y)
    .lineTo(TABLE_RIGHT, y)
    .strokeColor(color)
    .lineWidth(0.5)
    .stroke()
    .strokeColor('#000000')
    .lineWidth(1);
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Generates an invoice PDF and resolves with a Buffer.
 *
 * @param {object} invoice      - Invoice document from DB
 * @param {object} client       - Client document from DB
 * @param {object} organization - Organization document from DB
 * @returns {Promise<Buffer>}
 */
export function generateInvoicePdf(invoice, client, organization) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const currency = invoice.currency || 'INR';

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#1A1A2E')
      .text(organization.name || 'Organization', MARGIN, MARGIN, { width: 280 });

    doc
      .fontSize(28)
      .fillColor('#4A90D9')
      .text('INVOICE', 0, MARGIN, { align: 'right' });

    doc.moveDown(0.3);

    // ── Invoice meta (right-aligned block) ──────────────────────────────────
    const metaY = doc.y;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#555555')
      .text(`Invoice No:`, PAGE_WIDTH - 200, metaY, { width: 80, align: 'left' })
      .font('Helvetica-Bold')
      .text(invoice.invoiceNumber || '—', PAGE_WIDTH - 120, metaY, {
        width: 70,
        align: 'right',
      });

    doc
      .font('Helvetica')
      .fillColor('#555555')
      .text('Issue Date:', PAGE_WIDTH - 200, metaY + 16, { width: 80 })
      .font('Helvetica-Bold')
      .text(fmtDate(invoice.issueDate), PAGE_WIDTH - 120, metaY + 16, {
        width: 70,
        align: 'right',
      });

    doc
      .font('Helvetica')
      .fillColor('#555555')
      .text('Due Date:', PAGE_WIDTH - 200, metaY + 32, { width: 80 })
      .font('Helvetica-Bold')
      .fillColor(invoice.status === 'overdue' ? '#D9534F' : '#1A1A2E')
      .text(fmtDate(invoice.dueDate), PAGE_WIDTH - 120, metaY + 32, {
        width: 70,
        align: 'right',
      });

    // ── Bill To ─────────────────────────────────────────────────────────────
    doc.fillColor('#555555').font('Helvetica').fontSize(9).text('BILL TO', MARGIN, metaY);

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#1A1A2E')
      .text(client.name || '—', MARGIN, metaY + 14);

    let billY = metaY + 28;
    if (client.company) {
      doc.font('Helvetica').fontSize(9).fillColor('#555555').text(client.company, MARGIN, billY);
      billY += 13;
    }
    if (client.billingAddress) {
      doc.font('Helvetica').fontSize(9).fillColor('#555555').text(client.billingAddress, MARGIN, billY, { width: 240 });
      billY += 13;
    }
    if (client.taxId) {
      doc.font('Helvetica').fontSize(9).fillColor('#555555').text(`Tax ID: ${client.taxId}`, MARGIN, billY);
      billY += 13;
    }

    // ── Divider ─────────────────────────────────────────────────────────────
    const dividerY = Math.max(billY, metaY + 60) + 16;
    drawHRule(doc, dividerY, '#1A1A2E');

    // ── Table header ────────────────────────────────────────────────────────
    const headerY = dividerY + 8;
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#FFFFFF');

    doc
      .rect(MARGIN, headerY - 4, TABLE_RIGHT - MARGIN, 18)
      .fill('#1A1A2E');

    doc
      .fillColor('#FFFFFF')
      .text('DESCRIPTION', COL.description + 4, headerY)
      .text('QTY', COL.qty, headerY, { width: 55, align: 'right' })
      .text('UNIT PRICE', COL.unitPrice, headerY, { width: 65, align: 'right' })
      .text('TAX %', COL.taxRate, headerY, { width: 55, align: 'right' })
      .text('AMOUNT', COL.amount, headerY, { width: TABLE_RIGHT - COL.amount, align: 'right' });

    // ── Line items ───────────────────────────────────────────────────────────
    let rowY = headerY + 20;
    const lineItems = invoice.lineItems || [];

    lineItems.forEach((item, idx) => {
      const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);
      const taxAmount = lineTotal * ((item.taxRate || 0) / 100);
      const rowTotal = lineTotal + taxAmount;

      // Alternate row shading
      if (idx % 2 === 0) {
        doc.rect(MARGIN, rowY - 3, TABLE_RIGHT - MARGIN, 16).fill('#F7F9FC');
      }

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#333333')
        .text(item.description || '—', COL.description + 4, rowY, { width: 250 })
        .text(String(item.quantity ?? ''), COL.qty, rowY, { width: 55, align: 'right' })
        .text(fmt(currency, item.unitPrice), COL.unitPrice, rowY, { width: 65, align: 'right' })
        .text(`${item.taxRate ?? 0}%`, COL.taxRate, rowY, { width: 55, align: 'right' })
        .text(fmt(currency, rowTotal), COL.amount, rowY, {
          width: TABLE_RIGHT - COL.amount,
          align: 'right',
        });

      rowY += 18;
    });

    drawHRule(doc, rowY + 2);

    // ── Totals ───────────────────────────────────────────────────────────────
    rowY += 14;
    const labelX = COL.taxRate - 20;
    const valueWidth = TABLE_RIGHT - COL.amount;

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#555555')
      .text('Subtotal', labelX, rowY, { width: 75, align: 'right' })
      .font('Helvetica')
      .fillColor('#1A1A2E')
      .text(fmt(currency, invoice.subtotal), COL.amount, rowY, {
        width: valueWidth,
        align: 'right',
      });

    rowY += 16;
    doc
      .font('Helvetica')
      .fillColor('#555555')
      .text('Tax', labelX, rowY, { width: 75, align: 'right' })
      .fillColor('#1A1A2E')
      .text(fmt(currency, invoice.taxTotal), COL.amount, rowY, {
        width: valueWidth,
        align: 'right',
      });

    rowY += 8;
    drawHRule(doc, rowY + 4, '#1A1A2E');
    rowY += 12;

    // Total row with background
    doc.rect(labelX - 8, rowY - 4, TABLE_RIGHT - labelX + 8, 22).fill('#1A1A2E');

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#FFFFFF')
      .text('TOTAL', labelX, rowY, { width: 75, align: 'right' })
      .text(fmt(currency, invoice.total), COL.amount, rowY, {
        width: valueWidth,
        align: 'right',
      });

    // ── Notes ────────────────────────────────────────────────────────────────
    if (invoice.notes) {
      rowY += 36;
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#555555')
        .text('NOTES', MARGIN, rowY);

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#333333')
        .text(invoice.notes, MARGIN, rowY + 13, { width: PAGE_WIDTH - MARGIN * 2 });
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#AAAAAA')
        .text(
          `${organization.name || ''} · Page ${i + 1} of ${pageCount}`,
          MARGIN,
          doc.page.height - 40,
          { align: 'center', width: PAGE_WIDTH - MARGIN * 2 }
        );
    }

    doc.end();
  });
}
