import assert from 'node:assert/strict';
import { RESOURCES, RESOURCE_MAP } from '../src/lib/resources';
import { visibleFields, visibleColumns } from '../src/lib/module-visibility';
import { taxEnabled, taxVisibleFields } from '../src/lib/tax-settings';
import { documentLines, financialDocConfig, financialTotals } from '../src/lib/financial';
import { normaliseCompanyProfile } from '../src/lib/company';
import { buildContext, buildPreview, CONVERSION_RULES } from '../src/lib/conversions';

const on = { enabled: true, rate: 15 };
const off = { enabled: false, rate: 15 };
const config = { modules: [...new Set(RESOURCES.map(r => r.module))], resources: RESOURCES.map(r => r.id) };
for (const tax of [undefined, off]) {
  assert.equal(taxEnabled(tax), false);
  for (const def of RESOURCES) {
    const fields = visibleFields(def, { ...config, tax });
    assert.ok(fields.every(f => !/^(tax|vat)/i.test(f.key)), def.id);
    assert.ok(fields.every(f => !/\b(tax|vat)\b/i.test(f.label)), def.id);
    assert.ok(visibleColumns(def, { ...config, tax }).every(k => !/^(tax|vat)/i.test(k)), def.id);
  }
}
for (const def of RESOURCES) {
  assert.deepEqual(taxVisibleFields(def.fields, on), def.fields, `enabled fields unchanged: ${def.id}`);
}
assert.equal(financialDocConfig('arInvoices', false).title, 'INVOICE');
assert.equal(financialDocConfig('arInvoices', true).title, 'TAX INVOICE');
for (const id of ['arInvoices', 'apBills', 'paymentApps']) {
  const row = { amount: 100, vatPct: 15, vatAmount: 15, total: 115, netCertified: 100 };
  const before = JSON.stringify(row);
  const def = RESOURCE_MAP[id];
  const lines = documentLines(row, def, false);
  assert.ok(lines.every(l => !/\b(tax|vat)\b/i.test(l.description)));
  assert.ok(documentLines(row, def, true).some(l => /VAT/.test(l.description)));
  // Hiding a breakdown must not change historic balances or stored values.
  assert.equal(financialTotals(row, def, lines, normaliseCompanyProfile({})).total,
    financialTotals(row, def, documentLines(row, def, true), normaliseCompanyProfile({})).total);
  assert.equal(JSON.stringify(row), before);
}
for (const rule of CONVERSION_RULES.filter(r => r.to === 'arInvoices')) {
  const source = { id: 'job', name: 'Test job', contractValue: 100, netCertified: 100 };
  const payload = rule.build(source, buildContext(off));
  assert.equal(payload.vatPct, 0);
  assert.ok(buildPreview(rule.to, payload, off).every(f => !/\b(tax|vat)\b/i.test(f.label)));
  assert.ok(!/tax/i.test(payload.name));
  const enabledPayload = rule.build(source, buildContext(on));
  assert.equal(enabledPayload.vatPct, 15);
  assert.ok(buildPreview(rule.to, enabledPayload, on).some(f => /VAT/.test(f.label)));
}
console.log('Tax visibility QA passed: all resource fields, columns, legacy documents, preserved totals, and conversions in both modes.');
