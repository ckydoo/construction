import { notFound } from 'next/navigation';
import { requirePageModule } from '@/lib/page-modules';
import { buildScope } from '@/lib/access';
import { getRecord } from '@/lib/records';
import { getResource } from '@/lib/resources';
import { financialDocConfig, documentLines, financialTotals, isFinancialDocument } from '@/lib/financial';
import { normaliseCompanyProfile, companyInitials } from '@/lib/company';
import { normaliseCurrencyConfig, toBase, hasRate } from '@/lib/currency';
import { visibleFields, resourceFullyEnabled } from '@/lib/module-visibility';
import { money, date, num } from '@/lib/format';
import { BRAND } from '@/lib/brand';
import { isPreviewableResource } from '@/lib/document-preview';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ org: string; resource: string; id: string }> };

const css = `
  :root { color-scheme: light; }
  .fp-page { min-height: 100vh; padding: 20px 0 32px; background: #E9EEF4; color: #03203F; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .fp-sheet { width: min(794px, calc(100% - 24px)); min-height: 1123px; margin: 0 auto; padding: 48px; background: #fff; box-sizing: border-box; box-shadow: 0 24px 64px -40px rgba(3,32,63,.45); }
  .fp-top-rule { height: 3px; margin: -48px -48px 0; background: #01172D; }
  .fp-header { display: grid; grid-template-columns: minmax(0,1fr) 210px; gap: 24px; align-items: start; padding-bottom: 18px; }
  .fp-company { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
  .fp-logo { width: 110px; height: 52px; object-fit: contain; flex: none; }
  .fp-logo-fallback { display: grid; place-items: center; width: 54px; height: 44px; flex: none; background: #01172D; color: #fff; font-size: 16px; font-weight: 800; }
  .fp-company-name { font-size: 13px; font-weight: 800; line-height: 1.2; color: #01172D; overflow-wrap: anywhere; }
  .fp-company-line { margin-top: 3px; color: #51697B; font-size: 7.4px; line-height: 1.45; overflow-wrap: anywhere; }
  .fp-doc-id { text-align: right; }
  .fp-doc-type { color: #01172D; font-size: 11px; font-weight: 800; letter-spacing: .02em; }
  .fp-doc-meta { margin-top: 7px; color: #51697B; font-size: 8px; line-height: 1.5; }
  .fp-orange-rule { height: 2px; margin: 0 -48px 22px; background: #F58712; }
  .fp-title-kicker { color: #F58712; font-size: 8px; font-weight: 800; letter-spacing: .12em; }
  .fp-title { margin: 8px 0 10px; color: #01172D; font-size: 20px; font-weight: 800; line-height: 1.2; letter-spacing: -.025em; text-transform: uppercase; }
  .fp-title-line { color: #51697B; font-size: 9px; line-height: 1.6; }
  .fp-hr { height: 1px; margin: 16px 0; background: #DEE5EC; }
  .fp-meta { display: grid; grid-template-columns: 120px minmax(0,1fr); border-top: 1px solid #DEE5EC; }
  .fp-meta-row { display: contents; }
  .fp-meta-label { padding: 7px 8px 7px 0; border-bottom: 1px solid #DEE5EC; color: #51697B; font-size: 7.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .fp-meta-value { padding: 7px 0; border-bottom: 1px solid #DEE5EC; color: #03203F; font-size: 9px; line-height: 1.45; overflow-wrap: anywhere; }
  .fp-intro { margin: 18px 0 14px; color: #03203F; font-size: 9.5px; line-height: 1.65; white-space: pre-wrap; }
  .fp-notice { display: flex; gap: 12px; margin: 0 0 16px; padding: 12px 14px; border-left: 4px solid #F58712; background: #F7FAFD; }
  .fp-notice-label { flex: none; color: #D9740B; font-size: 8px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .fp-notice-text { color: #03203F; font-size: 9px; line-height: 1.55; }
  .fp-items { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5px; }
  .fp-items th { padding: 7px 8px; background: #01172D; color: #fff; font-size: 8px; font-weight: 800; text-align: left; }
  .fp-items th:nth-child(1) { width: 6%; }
  .fp-items th:nth-child(2) { width: 52%; }
  .fp-items th:nth-child(3) { width: 10%; text-align: right; }
  .fp-items th:nth-child(4) { width: 15%; text-align: right; }
  .fp-items th:nth-child(5) { width: 17%; text-align: right; }
  .fp-items td { padding: 8px; border-bottom: 1px solid #DEE5EC; vertical-align: top; line-height: 1.45; overflow-wrap: anywhere; }
  .fp-items td:nth-child(n+3) { text-align: right; font-variant-numeric: tabular-nums; }
  .fp-items tr:nth-child(even) td { background: #F8FAFC; }
  .fp-item-detail { display: block; margin-top: 2px; color: #51697B; font-size: 8px; }
  .fp-totals-wrap { display: flex; justify-content: flex-end; margin: 14px 0 6px; }
  .fp-totals { width: 280px; border: 1px solid #E3E9F0; background: #F8FAFC; }
  .fp-total-row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 12px; color: #415A72; font-size: 8.5px; font-weight: 700; text-transform: uppercase; }
  .fp-total-row span:last-child { color: #03203F; font-variant-numeric: tabular-nums; text-transform: none; }
  .fp-total-row.final { background: #01172D; color: #fff; font-size: 10px; }
  .fp-total-row.final span:last-child { color: #fff; font-size: 11px; }
  .fp-totals-note { color: #51697B; font-size: 8px; line-height: 1.5; }
  .fp-section { margin-top: 18px; break-inside: avoid; }
  .fp-section-title { color: #51697B; font-size: 8px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .fp-section-text { margin-top: 5px; color: #03203F; font-size: 9px; line-height: 1.6; white-space: pre-wrap; }
  .fp-extra { margin-top: 18px; }
  .fp-signature { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; break-inside: avoid; }
  .fp-sign-line { height: 1px; margin-top: 18px; background: #9FB0C0; }
  .fp-sign-label { margin-top: 6px; color: #51697B; font-size: 8px; }
  .fp-sign-name { color: #03203F; font-size: 8.5px; font-weight: 800; }
  .fp-footer { display: flex; justify-content: space-between; gap: 20px; margin-top: 32px; padding-top: 10px; border-top: 1px solid #DEE5EC; color: #51697B; font-size: 7.5px; }
  @media (max-width: 820px) {
    .fp-page { padding: 12px 0 20px; }
    .fp-sheet { width: calc(100% - 16px); min-height: 0; padding: 24px; }
    .fp-top-rule { margin: -24px -24px 0; }
    .fp-header { grid-template-columns: 1fr; gap: 14px; }
    .fp-doc-id { text-align: left; }
    .fp-orange-rule { margin: 0 -24px 18px; }
    .fp-meta { grid-template-columns: 92px minmax(0,1fr); }
    .fp-items { font-size: 7.5px; }
    .fp-items th, .fp-items td { padding: 6px 4px; }
    .fp-totals { width: 100%; }
    .fp-signature { gap: 20px; }
  }
  @media print {
    @page { size: A4; margin: 0; }
    body { margin: 0; background: #fff; }
    .fp-page { padding: 0; background: #fff; }
    .fp-sheet { width: 100%; min-height: 0; padding: 14mm; box-shadow: none; }
    .fp-top-rule { margin: -14mm -14mm 0; }
    .fp-orange-rule { margin: 0 -14mm 8mm; }
    .fp-section, .fp-signature, .fp-items tr { break-inside: avoid; }
  }
`;

export default async function DocumentPreviewPage({ params }: Ctx) {
  const { org, resource, id } = await params;
  if (!isPreviewableResource(resource)) notFound();
  const a = await requirePageModule(org, { resourceId: resource });
  const def = getResource(resource);
  if (!def) notFound();
  const defn = def as NonNullable<typeof def>;
  const scope = await buildScope(a);
  const row: any = await getRecord(a.orgId, resource, id, scope);
  if (!row) notFound();

  const company = normaliseCompanyProfile(a.config.company, a.org);
  const currencyConfig = normaliseCurrencyConfig(a.config.currency, a.org.baseCurrency);
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

  const refCache = new Map<string, string>();
  async function refLabel(target: string, value: any): Promise<string> {
    const v = String(value || '');
    const key = `${target}:${v}`;
    if (refCache.has(key)) return refCache.get(key)!;
    const rec: any = getResource(target) ? await getRecord(a.orgId, target, v, scope) : null;
    const label = String(rec?.name || rec?.title || rec?.number || v.slice(-8));
    refCache.set(key, label);
    return label;
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

  const partyField = defn.fields.find(f => f.key === docCfg.partyKey);
  const partyResource = partyField?.ref || 'clients';
  const partyId = row[docCfg.partyKey] || row.clientId || row.vendorId || row.employeeId || row.accountId || row.parent || row.preparedBy || row.requestedBy || null;
  const party: any = partyId && getResource(partyResource)
    ? await getRecord(a.orgId, partyResource, String(partyId), scope) : null;
  const projectId = row.projectId ? String(row.projectId) : null;
  const project: any = projectId && resourceFullyEnabled(a.config, 'projects')
    ? await getRecord(a.orgId, 'projects', projectId, scope) : null;
  const partyName = String(party?.name || party?.title || (partyId ? String(partyId).slice(-8) : 'Valued client'));
  const organisation = String(party?.name || party?.title || company.displayName);
  const partyAddress = [party?.address, party?.city].filter(Boolean).join(', ') || project?.location || company.address;
  const projectName = String(project?.name || project?.title || (projectId ? String(projectId).slice(-8) : '—'));
  const projectSite = String(project?.location || '');
  const projectCode = String(project?.code || '');
  const notes = [row.scope, row.notes, row.justification, row.description, row.narration, row.discrepancies]
    .find(x => typeof x === 'string' && x.trim()) || '';

  const skip = new Set<string>([
    'items', 'status', 'currency', 'number', 'projectId', 'clientId', 'vendorId', 'requestedBy', 'preparedBy',
    'date', 'periodEnd', 'dueDate', 'invoiceDate', 'billDate', 'paymentDate', 'orderDate', 'submittedDate',
    'closingDate', 'signedDate', 'requiredDate', 'receivedDate', 'expenseDate', 'periodStart', 'deliveryDate',
    'reference', 'taxInvoiceNo', 'tenderNo', 'certificateNo', 'vendorInvoiceNo', 'deliveryNote', 'bankAccount',
    docCfg.dateKey || '', docCfg.amountKey || '', docCfg.netKey || '', docCfg.vatKey || '', docCfg.paidKey || '',
    docCfg.markupKey || '', defn.amountKey || '', defn.dateKey || '', ...docCfg.fallbackKeys,
  ]);
  const extraEntries: [string, string][] = [];
  for (const f of visibleFields(defn, a.config)) {
    if (f.type === 'items' || skip.has(f.key)) continue;
    const v = row[f.key];
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    extraEntries.push([f.label, await displayValue(f, v)]);
    if (extraEntries.length >= 18) break;
  }

  const metadata: [string, string][] = [
    [docCfg.numberLabel, docNo], ['Date', docDate], [docCfg.partyLabel, partyName],
    ['Organisation', organisation], ['Address', String(partyAddress)], ['Project', projectName],
    ['Project code', projectCode], ['Site / location', projectSite], ['Due date', dueDate],
    ['Period ending', periodEnd], ['Reference', reference], ['Status', status],
    ['Currency', docCurrency], ['Email', String(party?.email || company.email)], ['Phone', String(party?.phone || company.phone)],
  ].filter(([, v]) => !!v) as [string, string][];

  const paymentNoticeParts: string[] = [];
  if (isFinancial) {
    if (docCfg.showDeposit && totals.deposit > 0) {
      paymentNoticeParts.push(`A ${company.depositPct}% deposit of ${money(totals.deposit, docCurrency)} is required before commencement. The balance after deposit is ${money(totals.depositBalance, docCurrency)}.`);
    }
    if (company.paymentTerms) paymentNoticeParts.push(company.paymentTerms);
    else if (docCfg.showPaid) paymentNoticeParts.push(`Please settle by ${dueDate || 'the due date'} and quote ${docNo} on all remittances.`);
    else paymentNoticeParts.push(`Please quote ${docNo} on all correspondence and remittances.`);
  }

  const totalRows: [string, string, boolean][] = [['Subtotal', money(totals.subtotal, docCurrency), false]];
  if (resource === 'estimates' && Math.abs(totals.total - totals.subtotal - totals.tax) >= 0.005) totalRows.push(['Markup / adjustment', money(totals.total - totals.subtotal - totals.tax, docCurrency), false]);
  if (totals.tax) totalRows.push(['VAT', money(totals.tax, docCurrency), false]);
  if (docCfg.showDeposit && totals.deposit > 0) {
    totalRows.push([`Deposit (${company.depositPct}%)`, money(totals.deposit, docCurrency), false]);
    totalRows.push(['Balance after deposit', money(totals.depositBalance, docCurrency), false]);
  }
  if (docCfg.showPaid && totals.paid > 0) {
    totalRows.push(['Paid to date', money(totals.paid, docCurrency), false]);
    totalRows.push(['Balance due', money(totals.balance, docCurrency), false]);
  }
  totalRows.push(['TOTAL', money(totals.total, docCurrency), true]);

  const reportingTotal = docCurrency !== currencyConfig.base && hasRate(docCurrency, currencyConfig)
    ? `Reporting total: ${money(toBase(totals.total, docCurrency, currencyConfig), currencyConfig.base)} (1 ${currencyConfig.base} = ${currencyConfig.rates[docCurrency]} ${docCurrency})`
    : '';

  const sections: [string, string][] = [
    ['Payment terms', company.paymentTerms || 'Payment is due by the date shown above. Please quote the document number on all remittances.'],
    ['Materials / client responsibilities', company.clientMaterials || 'Unless otherwise stated, materials, access and approvals are to be provided as agreed in writing.'],
    ...(docCfg.showBank ? [['Banking details', company.bankDetails || 'Please contact our finance department for current banking details.']] as [string, string][] : []),
    ...(docCfg.showWarranty ? [['Warranty & delivery', company.warrantyDelivery || 'Workmanship is warranted as agreed in the contract. Delivery dates are subject to site access and timely approvals.']] as [string, string][] : []),
    ...(notes ? [['Notes / scope', String(notes)]] as [string, string][] : []),
    ['Footer', company.footerNote],
  ].filter(([, text]) => !!text) as [string, string][];

  return <div className="fp-page">
    <style>{css}</style>
    <article className="fp-sheet">
      <div className="fp-top-rule" />
      <header className="fp-header">
        <div className="fp-company">
          {company.logoDataUrl
            ? <img className="fp-logo" src={company.logoDataUrl} alt={`${company.displayName} logo`} />
            : <div className="fp-logo-fallback">{companyInitials(company.displayName)}</div>}
          <div>
            <div className="fp-company-name">{company.displayName}</div>
            {[company.legalName, company.registrationNo ? `Reg: ${company.registrationNo}` : ''].filter(Boolean).join(' | ') && <div className="fp-company-line">{[company.legalName, company.registrationNo ? `Reg: ${company.registrationNo}` : ''].filter(Boolean).join(' | ')}</div>}
            {[company.taxNo ? `VAT: ${company.taxNo}` : '', company.address].filter(Boolean).join(' | ') && <div className="fp-company-line">{[company.taxNo ? `VAT: ${company.taxNo}` : '', company.address].filter(Boolean).join(' | ')}</div>}
            {[company.email, company.phone].filter(Boolean).join(' | ') && <div className="fp-company-line">{[company.email, company.phone].filter(Boolean).join(' | ')}</div>}
            {company.website && <div className="fp-company-line">{company.website}</div>}
          </div>
        </div>
        <div className="fp-doc-id">
          <div className="fp-doc-type">{docCfg.title}</div>
          <div className="fp-doc-meta">{docCfg.numberLabel} {docNo}</div>
          <div className="fp-doc-meta">{docDate}</div>
        </div>
      </header>
      <div className="fp-orange-rule" />

      <div className="fp-title-kicker">{docCfg.title}</div>
      <h1 className="fp-title">{String(row.title || row.name || defn.singular)}</h1>
      <div className="fp-title-line">{docCfg.numberLabel}: {docNo} · Date: {docDate} · Status: {status} · Currency: {docCurrency}</div>
      <div className="fp-hr" />

      <div className="fp-meta">
        {metadata.map(([label, value]) => <div className="fp-meta-row" key={label}>
          <div className="fp-meta-label">{label}</div>
          <div className="fp-meta-value">{value}</div>
        </div>)}
      </div>

      <p className="fp-intro">Dear {partyName}, {resource === 'arInvoices' ? 'Please find your tax invoice below.' : company.quoteIntro}</p>

      {isFinancial && <div className="fp-notice">
        <div className="fp-notice-label">Payment notice</div>
        <div className="fp-notice-text">{paymentNoticeParts.join(' ')}</div>
      </div>}

      <table className="fp-items">
        <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Unit price</th><th>Subtotal</th></tr></thead>
        <tbody>
          {lines.map((l, i) => <tr key={`${i}-${l.description}`}>
            <td>{i + 1}</td>
            <td>{l.description}{l.detail && <span className="fp-item-detail">{l.detail}</span>}</td>
            <td>{num(l.qty, 2)}</td>
            <td>{money(l.unitPrice, docCurrency)}</td>
            <td><strong>{money(l.total, docCurrency)}</strong></td>
          </tr>)}
        </tbody>
      </table>

      <div className="fp-totals-wrap"><div className="fp-totals">
        {totalRows.map(([label, value, final]) => <div className={`fp-total-row${final ? ' final' : ''}`} key={label}>
          <span>{label}</span><span>{value}</span>
        </div>)}
      </div></div>
      <div className="fp-totals-note">
        {totals.explicitItems ? 'Totals calculated from the itemised lines above.' : "Totals from this record's stored amounts."}
        {reportingTotal && <span> · {reportingTotal}</span>}
      </div>

      {sections.map(([title, text]) => <section className="fp-section" key={title}>
        <div className="fp-section-title">{title}</div>
        <div className="fp-section-text">{text}</div>
      </section>)}

      {extraEntries.length > 0 && <div className="fp-extra fp-section">
        <div className="fp-section-title">Additional details</div>
        <div className="fp-meta" style={{ marginTop: 8 }}>
          {extraEntries.map(([label, value]) => <div className="fp-meta-row" key={label}>
            <div className="fp-meta-label">{label}</div>
            <div className="fp-meta-value">{value}</div>
          </div>)}
        </div>
      </div>}

      <div className="fp-signature">
        <div>
          <div className="fp-sign-label">For and on behalf of</div>
          <div className="fp-sign-line" />
          <div className="fp-sign-name">{company.preparedBy || company.displayName}</div>
        </div>
        <div>
          <div className="fp-sign-label">Authorised signatory</div>
          <div className="fp-sign-line" />
          <div className="fp-sign-label">Name / date</div>
        </div>
      </div>

      <footer className="fp-footer">
        <span>Generated by {BRAND.name}</span>
        <span>{docCfg.shortTitle} {docNo}</span>
      </footer>
    </article>
  </div>;
}
