/* Static QA for the five findings from the tester self-run.
 *
 * This script is credential-free and does not touch Supabase or create records.
 * It checks the source contracts plus the in-memory conversion/catalogue
 * definitions, so it is safe to run before a production deployment.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  CONVERSION_RULES, buildContext, buildPreview,
} from '../src/lib/conversions';
import { CHAIN_STAGES, CONVERTIBLE_RESOURCE_IDS } from '../src/lib/conversion-chain';
import { resolveWorkspace } from '../src/lib/catalog';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0;
const ok = (name: string, fn: () => void | string) => {
  try {
    const detail = fn();
    pass++;
    console.log(`PASS ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${(error as Error).message}`);
    process.exitCode = 1;
  }
};

ok('starter dashboard gates optional analytics APIs', () => {
  const s = read('src/app/[org]/dashboard/page.tsx');
  assert.match(s, /enabled:showProfitability/);
  assert.match(s, /enabled:showThreeWay/);
  assert.match(s, /const showThreeWay=.*on\('purchaseOrders'\).*on\('apBills'\)/);
  return 'profitability + three-way match + apBills';
});

ok('quotes use an explicit Quote Studio action', () => {
  const s = read('src/components/ResourceTable.tsx');
  assert.match(s, /const newLabel=quoteStudio\?'Open Quote Studio':/);
  assert.equal((s.match(/>\{newLabel\}<\/Button>/g) || []).length, 2, 'header and empty-state buttons');
  assert.ok(!/>New \{def\.singular\}<\/Button>/.test(s), 'ambiguous New Quote label remains');
  return 'Open Quote Studio';
});

ok('Convert to… buttons name their destination', () => {
  const s = read('src/components/ConvertFlow.tsx');
  assert.match(s, /onClick=\{\(\) => submit\(o\.id\)\}>\{o\.label\}<\/Button>/);
  assert.ok(!/>Create<\/Button>/.test(s), 'generic Create button remains');
  return 'explicit option labels';
});

ok('invoice form keeps ref fields while settings load', () => {
  const s = read('src/components/RecordForm.tsx');
  assert.match(s, /config\?visibleFields\(def,config\):def\.fields\.filter\(f=>!f\.hidden\)/);
  assert.ok(!/config:ConfigLike=meta\?\.config\|\|/.test(s), 'blank fallback config remains');
  return 'non-hidden fields fallback';
});

ok('direct job → invoice rule exists and builds a valid payload', () => {
  const rule = CONVERSION_RULES.find(r => r.id === 'job-to-invoice');
  assert.ok(rule, 'job-to-invoice missing');
  assert.equal(rule.from, 'projects');
  assert.equal(rule.to, 'arInvoices');
  assert.equal(rule.label, 'Create tax invoice directly');
  assert.ok(CONVERTIBLE_RESOURCE_IDS.has('projects'));
  const payload = rule.build({
    id: 'job-1', number: 'PRJ-1', name: 'Test job', clientId: 'client-1',
    contractValue: 12500, currency: 'USD',
  }, buildContext());
  assert.equal(payload.projectId, 'job-1');
  assert.equal(payload.clientId, 'client-1');
  assert.equal(payload.vatPct, 15);
  assert.equal(payload.status, 'DRAFT');
  assert.equal(payload.currency, 'USD');
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].total, 12500);
  assert.ok(buildPreview('arInvoices', payload).length > 0);
  return `${rule.label} · USD 12,500.00`;
});

ok('payment certificates are optional in the nine-stage chain', () => {
  assert.equal(CHAIN_STAGES.length, 9);
  const stage = CHAIN_STAGES.find(s => s.id === 'paymentApps');
  assert.ok(stage, 'certificate stage missing');
  assert.equal(stage.optional, true);
  return 'certificate = optional';
});

ok('starter pack stays at 13 sections / 19 lists', () => {
  const starter = resolveWorkspace({
    companyType: 'GENERAL_CONTRACTOR', size: 'MICRO', headcount: 5,
    qualifiers: [], addons: [],
  });
  assert.equal(starter.modules.length, 13);
  assert.equal(starter.resources.length, 19);
  assert.ok(starter.resources.includes('arInvoices'));
  assert.ok(!starter.resources.includes('paymentApps'), 'payment certificates leaked into starter pack');
  return '13 / 19 · no paymentApps';
});

ok('local tester credentials are gitignored', () => {
  const s = read('.gitignore');
  for (const entry of ['TESTER_ACCOUNT.json', 'TEST_HERE.md', 'TESTER_FEEDBACK.md', 'scripts/tester-here-*.mjs']) {
    assert.ok(s.includes(entry), `${entry} not ignored`);
  }
  return 'credentials stay local';
});

console.log(`\nTest-fix audit: ${pass}/8 passed`);
