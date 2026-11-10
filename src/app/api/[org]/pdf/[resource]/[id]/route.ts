import { NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { apiAuth } from '@/lib/auth';
import { getResource } from '@/lib/resources';
import { getRecord } from '@/lib/records';
import { readGuard, capabilityGuard } from '@/lib/guard';
import { buildScope } from '@/lib/access';
import { money, date } from '@/lib/format';
import { normaliseCurrencyConfig, toBase, hasRate } from '@/lib/currency';
import { BRAND } from '@/lib/brand';
import { normaliseCompanyProfile, companyInitials } from '@/lib/company';
import { financialDocConfig, documentLines, financialTotals, isFinancialDocument } from '@/lib/financial';
import { visibleFields, resourceFullyEnabled } from '@/lib/module-visibility';

const A4W = 595.28, A4H = 841.89, M = 42;
const TABLE_W = A4W - 2 * M;
const CONTENT_BOTTOM = M + 30;
const NAVY = rgb(0.012, 0.125, 0.247), INK = rgb(0.012, 0.125, 0.247);
const MUTED = rgb(0.32, 0.41, 0.48), ORANGE = rgb(0.961, 0.529, 0.071);
const LINE = rgb(0.87, 0.90, 0.93), LIGHT = rgb(0.972, 0.980, 0.992), WHITE = rgb(1, 1, 1);

const safe = (v: unknown) => String(v ?? '')
  .replace(/[\u2010-\u2015]/g, '-')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201C\u201D]/g, '"')
  .replace(/\u2022/g, '*')
  .replace(/\u00A0/g, ' ')
  .replace(/[^\x20-\x7E\n]/g, '');

export async function GET(_req: Request, { params }: { params: Promise<{ org: string; resource: string; id: string }> }) {
  const { org, resource, id } = await params;
  const a = await apiAuth(org); if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const def = getResource(resource);
  if (!def) return NextResponse.json({ error: 'Unknown or disabled resource' }, { status: 404 });
  const auth = a as NonNullable<typeof a>;
  const defn = def as NonNullable<typeof def>;
  const g = readGuard(auth.config, auth.role, resource) || capabilityGuard(auth.role, 'exports'); if (g) return g;
  const scope = await buildScope(a);
  const row: any = await getRecord(auth.orgId, resource, id, scope);
  if (!row) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

  const company = normaliseCompanyProfile(auth.config.company, auth.org);
  const cfg = normaliseCurrencyConfig(auth.config.currency, auth.org.baseCurrency);
  const docCfg = financialDocConfig(resource);
  const isFinancial = isFinancialDocument(resource);
  const lines = documentLines(row, defn);
  const totals = financialTotals(row, defn, lines, company);
  const docCurrency = totals.currency;
  const status = String(row.status || 'DRAFT').replace(/_/g, ' ');
  const docNo = String(row.number || row.taxInvoiceNo || row.tenderNo || row.certificateNo || row.vendorInvoiceNo || row.reference || '—');
  const docDate = docCfg.dateKey && row[docCfg.dateKey] ? date(row[docCfg.dateKey]) : date(row.createdAt);
  const dueDate = row.dueDate ? date(row.dueDate) : '';
  const periodEnd = row.periodEnd ? date(row.periodEnd) : '';
  const reference = String(row.reference || row.taxInvoiceNo || row.tenderNo || row.certificateNo || row.vendorInvoiceNo || row.deliveryNote || '');

  // Resolve the linked client / supplier / employee and project so the document
  // shows names and addresses rather than raw UUIDs.
  const partyField = defn.fields.find(f => f.key === docCfg.partyKey);
  const partyResource = partyField?.ref || 'clients';
  const partyId = row[docCfg.partyKey] || row.clientId || row.vendorId || row.employeeId || row.accountId || row.parent || row.preparedBy || row.requestedBy || null;
  const party = partyId && getResource(partyResource) ? await getRecord(auth.orgId, partyResource, String(partyId), scope) : null;
  const projectId = row.projectId ? String(row.projectId) : null;
  const project = projectId && resourceFullyEnabled(auth.config, 'projects') ? await getRecord(auth.orgId, 'projects', projectId, scope) : null;
  const partyName = String(party?.name || party?.title || (partyId ? String(partyId).slice(-8) : 'Valued client'));
  const organisation = String(party?.name || party?.title || company.displayName);
  const partyAddress = [party?.address, party?.city].filter(Boolean).join(', ') || project?.location || company.address;
  const projectName = String(project?.name || project?.title || (projectId ? String(projectId).slice(-8) : '—'));
  const projectSite = String(project?.location || '');
  const projectCode = String(project?.code || '');
  const notes = [row.scope, row.notes, row.justification, row.description, row.narration, row.discrepancies]
    .find(x => typeof x === 'string' && x.trim()) || '';

  // Additional fields, with references resolved and fields from disabled modules hidden.
  const refCache = new Map<string, string>();
  async function refLabel(target: string, value: any): Promise<string> {
    const v = String(value || ''); const key = `${target}:${v}`;
    if (refCache.has(key)) return refCache.get(key)!;
    const rec: any = await getRecord(auth.orgId, target, v, scope);
    const label = String(rec?.name || rec?.title || rec?.number || v.slice(-8));
    refCache.set(key, label); return label;
  }
  async function displayValue(f: any, v: any): Promise<string> {
    if (f.type === 'currency') return money(v, docCurrency);
    if (f.type === 'percent') return `${Number(v) || 0}%`;
    if (f.type === 'number') return Number(v).toLocaleString('en-US');
    if (f.type === 'date') return date(v);
    if (f.type === 'boolean') return v ? 'Yes' : 'No';
    if (f.type === 'tags') return Array.isArray(v) ? v.join(', ') : String(v);
    if (f.type === 'ref') return refLabel(f.ref || 'clients', v);
    if (f.type === 'select') return String(v).replace(/_/g, ' ');
    return String(v);
  }
  const skip = new Set<string>([
    'items', 'status', 'currency', 'number', 'projectId', 'clientId', 'vendorId', 'requestedBy', 'preparedBy',
    'date', 'periodEnd', 'dueDate', 'invoiceDate', 'billDate', 'paymentDate', 'orderDate', 'submittedDate',
    'closingDate', 'signedDate', 'requiredDate', 'receivedDate', 'expenseDate', 'periodStart', 'deliveryDate',
    'reference', 'taxInvoiceNo', 'tenderNo', 'certificateNo', 'vendorInvoiceNo', 'deliveryNote', 'bankAccount',
    docCfg.dateKey || '', docCfg.amountKey || '', docCfg.netKey || '', docCfg.vatKey || '', docCfg.paidKey || '',
    docCfg.markupKey || '', defn.amountKey || '', defn.dateKey || '', ...docCfg.fallbackKeys,
  ]);
  const extraEntries: [string, string][] = [];
  for (const f of visibleFields(defn, auth.config)) {
    if (f.type === 'items' || skip.has(f.key)) continue;
    const v = row[f.key];
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    extraEntries.push([f.label, safe(await displayValue(f, v))]);
    if (extraEntries.length >= 18) break;
  }
  const metadata: [string, string][] = [
    [docCfg.numberLabel, docNo], ['Date', docDate], [docCfg.partyLabel, partyName],
    ['Organisation', organisation], ['Address', String(partyAddress)], ['Project', projectName],
    ['Project code', projectCode], ['Site / location', projectSite], ['Due date', dueDate],
    ['Period ending', periodEnd], ['Reference', reference], ['Status', status],
    ['Currency', docCurrency], ['Email', String(party?.email || company.email)], ['Phone', String(party?.phone || company.phone)],
  ].filter(([, v]) => !!v) as [string, string][];

  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(`${company.displayName} ${docCfg.shortTitle} ${docNo}`));
  pdf.setAuthor(safe(company.displayName));
  pdf.setCreator(safe(company.displayName));
  pdf.setSubject(safe(`${docCfg.shortTitle} ${docNo}`));
  let logo: any = null;
  const logoMatch = /^data:image\/(png|jpeg);base64,(.+)$/.exec(company.logoDataUrl);
  if (logoMatch) {
    try {
      const bytes = Buffer.from(logoMatch[2], 'base64');
      logo = logoMatch[1] === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch { logo = null; }
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([A4W, A4H]);
  let y = A4H - M;
  let inTable = false;
  const cols = [24, 272, 48, 78, 89];
  const colX = [M];
  for (let i = 1; i < cols.length; i++) colX.push(colX[i - 1] + cols[i - 1]);

  const wrap = (text: string, max: number, size: number, f: any): string[] => {
    const out: string[] = [];
    for (const para of safe(text).split('\n')) {
      const words = para.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); continue; }
      let cur = '';
      for (const w of words) {
        const t = cur ? `${cur} ${w}` : w;
        if (f.widthOfTextAtSize(t, size) > max && cur) { out.push(cur); cur = w; } else cur = t;
      }
      if (cur) out.push(cur);
    }
    return out.length ? out.slice(0, 40) : [''];
  };
  const drawAt = (s: string, x: number, yPos: number, size: number, f: any, color = INK) => {
    page.drawText(safe(s), { x, y: yPos, size, font: f, color });
  };
  const drawRight = (s: string, xRight: number, yPos: number, size: number, f: any, color = INK) => {
    const text = safe(s); page.drawText(text, { x: xRight - f.widthOfTextAtSize(text, size), y: yPos, size, font: f, color });
  };
  // Keep the tenant identity inside its own column so long legal names, VAT
  // numbers and contact details never collide with the document number/date.
  const fitText = (s: string, max: number, size: number, f: any) => {
    const text = safe(s);
    if (f.widthOfTextAtSize(text, size) <= max) return text;
    let clipped = text;
    while (clipped && f.widthOfTextAtSize(`${clipped}...`, size) > max) clipped = clipped.slice(0, -1);
    return `${clipped.trimEnd()}...`;
  };
  const drawText = (s: string, size: number, f: any, color = INK) => drawAt(s, M, y, size, f, color);
  const drawWrapped = (text: string, x: number, max: number, size: number, f: any, color = INK, lineHeight = 13) => {
    const ls = wrap(text, max, size, f);
    ensureSpace(ls.length * lineHeight + 4);
    for (const l of ls) { drawAt(l, x, y, size, f, color); y -= lineHeight; }
    return y;
  };
  function ensureSpace(h: number) { if (y - h < CONTENT_BOTTOM) newPage(); }
  function newPage() {
    page = pdf.addPage([A4W, A4H]); y = A4H - M;
    header(false);
    if (inTable) drawTableHeader();
  }
  function header(first: boolean) {
    page.drawRectangle({ x: 0, y: A4H - 3, width: A4W, height: 3, color: NAVY });
    if (first) {
      const nameX = logo ? M + 125 : M + 70;
      const leftW = A4W - M - nameX - 100;
      if (logo) {
        const scale = Math.min(110 / logo.width, 52 / logo.height);
        const w = logo.width * scale, h = logo.height * scale;
        page.drawImage(logo, { x: M, y: A4H - 70, width: w, height: h });
      } else {
        page.drawRectangle({ x: M, y: A4H - 70, width: 54, height: 44, color: NAVY });
        drawAt(companyInitials(company.displayName), M + 10, A4H - 44, 16, bold, WHITE);
      }
      let nameSize = 13;
      while (nameSize > 10 && bold.widthOfTextAtSize(company.displayName, nameSize) > leftW) nameSize -= 0.5;
      drawAt(fitText(company.displayName, leftW, nameSize, bold), nameX, A4H - 28, nameSize, bold, NAVY);
      const identity = [company.legalName, company.registrationNo ? `Reg: ${company.registrationNo}` : ''].filter(Boolean).join(' | ');
      const registered = [company.taxNo ? `VAT: ${company.taxNo}` : '', company.address].filter(Boolean).join(' | ');
      const contact = [company.email, company.phone].filter(Boolean).join(' | ');
      drawAt(fitText(identity, leftW, 7.2, font), nameX, A4H - 42, 7.2, font, MUTED);
      drawAt(fitText(registered, leftW, 7, font), nameX, A4H - 52, 7, font, MUTED);
      drawAt(fitText(contact, leftW, 7, font), nameX, A4H - 62, 7, font, MUTED);
      if (company.website) drawAt(fitText(company.website, leftW, 7, font), nameX, A4H - 72, 7, font, MUTED);
      drawRight(docCfg.title, A4W - M, A4H - 28, 11, bold, NAVY);
      drawRight(`${docCfg.numberLabel} ${docNo}`, A4W - M, A4H - 44, 8, font, MUTED);
      drawRight(docDate, A4W - M, A4H - 56, 8, font, MUTED);
      page.drawRectangle({ x: M, y: A4H - 92, width: TABLE_W, height: 2, color: ORANGE });
      y = A4H - 112;
    } else {
      drawAt(company.displayName, M, A4H - 28, 10, bold, NAVY);
      drawRight(`${docCfg.shortTitle} ${docNo}`, A4W - M, A4H - 28, 9, bold, MUTED);
      page.drawLine({ start: { x: M, y: A4H - 42 }, end: { x: A4W - M, y: A4H - 42 }, thickness: 0.8, color: LINE });
      y = A4H - 58;
    }
  }
  function drawTableHeader() {
    ensureSpace(24);
    page.drawRectangle({ x: M, y: y - 20, width: TABLE_W, height: 20, color: NAVY });
    drawAt('#', M + 4, y - 13, 8, bold, WHITE);
    drawAt('Description', colX[1] + 4, y - 13, 8, bold, WHITE);
    drawRight('Qty', colX[2] + cols[2] - 4, y - 13, 8, bold, WHITE);
    drawRight('Unit price', colX[3] + cols[3] - 4, y - 13, 8, bold, WHITE);
    drawRight('Subtotal', colX[4] + cols[4] - 4, y - 13, 8, bold, WHITE);
    y -= 22;
  }
  function drawKeyValueGrid(entries: [string, string][]) {
    const labelW = 120, valX = M + labelW, valW = A4W - M - valX;
    for (const [label, value] of entries) {
      if (!value) continue;
      const ls = wrap(String(value), valW, 9, font).slice(0, 6);
      const h = Math.max(22, ls.length * 12 + 8);
      ensureSpace(h);
      drawAt(label.toUpperCase(), M, y - 9, 8, bold, MUTED);
      let ly = y - 9;
      for (const l of ls) { drawAt(l, valX, ly, 9, font, INK); ly -= 12; }
      y -= h;
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: A4W - M, y: y + 4 }, thickness: 0.5, color: LINE });
    }
  }
  function drawTitleBlock() {
    ensureSpace(80);
    drawText(docCfg.title, 9, bold, ORANGE); y -= 18;
    for (const l of wrap(safe(row.title || defn.singular).toUpperCase(), TABLE_W, 16, bold).slice(0, 2)) { drawText(l, 16, bold, NAVY); y -= 22; }
    y -= 4;
    drawText(`${docCfg.numberLabel}: ${docNo}`, 9, font, MUTED); y -= 14;
    drawText(`Date: ${docDate}   Status: ${status}   Currency: ${docCurrency}`, 9, font, MUTED); y -= 18;
    page.drawLine({ start: { x: M, y }, end: { x: A4W - M, y }, thickness: 0.8, color: LINE }); y -= 18;
  }
  function drawIntro() {
    y = drawWrapped(`Dear ${partyName},\n\n${company.quoteIntro}`, M, TABLE_W, 9.5, font, INK, 14);
    y -= 8;
  }
  function drawPaymentNotice() {
    if (!isFinancial) return;
    const parts: string[] = [];
    if (docCfg.showDeposit && totals.deposit > 0) parts.push(`A ${company.depositPct}% deposit of ${money(totals.deposit, docCurrency)} is required before commencement. The balance after deposit is ${money(totals.depositBalance, docCurrency)}.`);
    if (company.paymentTerms) parts.push(company.paymentTerms);
    else if (docCfg.showPaid) parts.push(`Please settle by ${dueDate || 'the due date'} and quote ${docNo} on all remittances.`);
    else parts.push(`Please quote ${docNo} on all correspondence and remittances.`);
    const ls = wrap(parts.join(' '), TABLE_W - 28, 9, font).slice(0, 8);
    const boxH = 32 + ls.length * 12;
    ensureSpace(boxH + 12);
    page.drawRectangle({ x: M, y: y - boxH, width: TABLE_W, height: boxH, color: LIGHT });
    page.drawRectangle({ x: M, y: y - boxH, width: 4, height: boxH, color: ORANGE });
    drawAt('PAYMENT NOTICE', M + 12, y - 16, 8, bold, ORANGE);
    let ly = y - 34;
    for (const l of ls) { drawAt(l, M + 12, ly, 9, font, INK); ly -= 12; }
    y -= boxH + 12;
  }
  function drawItemsTable() {
    inTable = true;
    drawTableHeader();
    lines.forEach((l, i) => {
      const descLines = wrap(l.description + (l.detail ? `\n${l.detail}` : ''), cols[1] - 8, 8.5, font).slice(0, 6);
      const rowH = Math.max(24, descLines.length * 11 + 10);
      ensureSpace(rowH + 2);
      if (i % 2) page.drawRectangle({ x: M, y: y - rowH, width: TABLE_W, height: rowH, color: LIGHT });
      drawAt(String(i + 1), M + 4, y - 14, 8, font, MUTED);
      let ly = y - 14;
      for (const dl of descLines) { drawAt(dl, colX[1] + 4, ly, 8.5, font, INK); ly -= 11; }
      drawRight(String(Math.round(l.qty * 100) / 100), colX[2] + cols[2] - 4, y - 14, 8.5, font, INK);
      drawRight(money(l.unitPrice, docCurrency), colX[3] + cols[3] - 4, y - 14, 8.5, font, INK);
      drawRight(money(l.total, docCurrency), colX[4] + cols[4] - 4, y - 14, 8.5, bold, INK);
      page.drawLine({ start: { x: M, y: y - rowH }, end: { x: A4W - M, y: y - rowH }, thickness: 0.4, color: LINE });
      y -= rowH;
    });
    inTable = false;
    y -= 8;
  }
  function drawTotals() {
    const rows: [string, string][] = [['Subtotal', money(totals.subtotal, docCurrency)]];
    if (totals.tax) rows.push(['VAT', money(totals.tax, docCurrency)]);
    if (docCfg.showDeposit && totals.deposit > 0) {
      rows.push([`Deposit (${company.depositPct}%)`, money(totals.deposit, docCurrency)]);
      rows.push(['Balance after deposit', money(totals.depositBalance, docCurrency)]);
    }
    if (docCfg.showPaid && totals.paid > 0) {
      rows.push(['Paid to date', money(totals.paid, docCurrency)]);
      rows.push(['Balance due', money(totals.balance, docCurrency)]);
    }
    rows.push(['TOTAL', money(totals.total, docCurrency)]);
    const boxW = 230, boxX = A4W - M - boxW, boxH = rows.length * 15 + 28;
    ensureSpace(boxH + 4);
    page.drawRectangle({ x: boxX, y: y - boxH, width: boxW, height: boxH, color: LIGHT });
    let ly = y - 20;
    for (const [label, value] of rows) {
      const isTotal = label === 'TOTAL';
      if (isTotal) page.drawRectangle({ x: boxX, y: ly - 14, width: boxW, height: 24, color: NAVY });
      drawAt(label.toUpperCase(), boxX + 12, ly, 8, bold, isTotal ? WHITE : MUTED);
      drawRight(value, boxX + boxW - 12, ly, isTotal ? 11 : 9, isTotal ? bold : font, isTotal ? WHITE : INK);
      ly -= 15;
    }
    y -= boxH + 6;
    drawAt(totals.explicitItems ? 'Totals calculated from the itemised lines above.' : 'Totals from this record\'s stored amounts.', M, y, 8, font, MUTED); y -= 12;
    if (docCurrency !== cfg.base && hasRate(docCurrency, cfg)) {
      ensureSpace(14);
      drawAt(`Reporting total: ${money(toBase(totals.total, docCurrency, cfg), cfg.base)} (1 ${cfg.base} = ${cfg.rates[docCurrency]} ${docCurrency})`, M, y, 8, font, MUTED); y -= 14;
    }
  }
  function drawSection(title: string, text: string) {
    if (!text) return;
    const ls = wrap(String(text), TABLE_W, 9, font).slice(0, 12);
    const h = 18 + ls.length * 13;
    ensureSpace(h + 8);
    drawText(title.toUpperCase(), 8, bold, MUTED); y -= 16;
    for (const l of ls) { drawAt(l, M, y, 9, font, INK); y -= 13; }
    y -= 10;
  }
  function drawAdditionalDetails() {
    if (!extraEntries.length) return;
    ensureSpace(24);
    drawText('ADDITIONAL DETAILS', 8, bold, MUTED); y -= 16;
    drawKeyValueGrid(extraEntries); y -= 6;
  }
  function drawSignature() {
    ensureSpace(62);
    const lineY = y - 26;
    drawAt('For and on behalf of', M, y - 8, 8, font, MUTED);
    page.drawLine({ start: { x: M, y: lineY }, end: { x: M + 190, y: lineY }, thickness: 0.6, color: LINE });
    page.drawLine({ start: { x: A4W - M - 190, y: lineY }, end: { x: A4W - M, y: lineY }, thickness: 0.6, color: LINE });
    drawAt(company.preparedBy || company.displayName, M, lineY - 14, 8, bold, INK);
    drawAt('Authorised signatory', A4W - M - 190, lineY - 14, 8, font, MUTED);
    y = lineY - 32;
  }
  function footer() {
    const pages = pdf.getPageCount();
    for (let i = 0; i < pages; i++) {
      const p = pdf.getPage(i);
      p.drawLine({ start: { x: M, y: M + 24 }, end: { x: A4W - M, y: M + 24 }, thickness: 0.5, color: LINE });
      p.drawText(safe(`Generated by ${BRAND.name}`), { x: M, y: M + 10, size: 7, font, color: MUTED });
      p.drawText(safe(`Page ${i + 1} of ${pages}`), { x: A4W - M - 52, y: M + 10, size: 7, font, color: MUTED });
    }
  }

  header(true);
  drawTitleBlock();
  drawKeyValueGrid(metadata); y -= 8;
  drawIntro();
  drawPaymentNotice();
  drawItemsTable();
  drawTotals();
  drawSection('Payment terms', company.paymentTerms || 'Payment is due by the date shown above. Please quote the document number on all remittances.');
  drawSection('Materials / client responsibilities', company.clientMaterials || 'Unless otherwise stated, materials, access and approvals are to be provided as agreed in writing.');
  if (docCfg.showBank) drawSection('Banking details', company.bankDetails || 'Please contact our finance department for current banking details.');
  if (docCfg.showWarranty) drawSection('Warranty & delivery', company.warrantyDelivery || 'Workmanship is warranted as agreed in the contract. Delivery dates are subject to site access and timely approvals.');
  if (notes) drawSection('Notes / scope', String(notes));
  drawAdditionalDetails();
  drawSection('Footer', company.footerNote);
  drawSignature();
  footer();

  const bytes = await pdf.save();
  const filename = `${defn.prefix}-${docCfg.shortTitle.replace(/[^a-zA-Z0-9]+/g, '-')}-${String(docNo).replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
  return new NextResponse(new Uint8Array(bytes), { headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  } });
}
