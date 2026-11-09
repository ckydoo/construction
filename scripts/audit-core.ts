/* Verifies the essentials-first onboarding derivation.
   Run: npx tsx scripts/audit-core.ts */
import { resolveWorkspace, MODULES, STARTER_MODULE_IDS, COMPANY_TYPES, COMPANY_SIZES } from '../src/lib/catalog';

const fails: string[] = [];
const check = (ok: boolean, label: string) => {
  if (!ok) fails.push(label);
  console.log(`${ok ? '  ok' : ' FAIL'}  ${label}`);
};

check(STARTER_MODULE_IDS.length === 12, `starter pack has 12 modules (got ${STARTER_MODULE_IDS.length})`);
check(new Set(STARTER_MODULE_IDS).size === STARTER_MODULE_IDS.length, 'starter pack has no duplicates');
check(STARTER_MODULE_IDS.every(id => MODULES.some(m => m.id === id)), 'all starter ids exist in the catalogue');

for (const size of COMPANY_SIZES) {
  const c = resolveWorkspace({ companyType: 'GENERAL_CONTRACTOR', size: size.id, qualifiers: [] });
  check(c.modules.length >= STARTER_MODULE_IDS.length, `${size.id} includes every essential (${c.modules.length})`);
  check(c.resources.length === new Set(MODULES.filter(m => c.modules.includes(m.id)).flatMap(m => m.resources)).size,
    `${size.id} resources exactly match enabled modules`);
}

const micro = resolveWorkspace({ companyType: 'GENERAL_CONTRACTOR', size: 'MICRO', qualifiers: [] });
check(micro.modules.length === 12, `MICRO starts with exactly 12 modules (got ${micro.modules.length})`);
check(micro.resources.includes('clients') && micro.resources.includes('projects') && micro.resources.includes('arInvoices') && micro.resources.includes('payments'),
  'core chain clients → projects → invoices → payments is present');
check(!micro.resources.includes('incidents') && !micro.resources.includes('equipment') && !micro.resources.includes('units'),
  'non-essentials are not enabled at MICRO');

const withAddons = resolveWorkspace({ companyType: 'GENERAL_CONTRACTOR', size: 'MICRO', addons: ['equipment', 'safety'] });
check(withAddons.modules.includes('equipment') && withAddons.modules.includes('safety'), 'explicit add-ons are honoured');

const rental = resolveWorkspace({ companyType: 'EQUIPMENT_RENTAL', size: 'MICRO' });
check(rental.modules.includes('rental'), 'company type derives its defining module even at MICRO');
const developer = resolveWorkspace({ companyType: 'RESIDENTIAL_DEVELOPER', size: 'SMALL' });
check(developer.modules.includes('unitSales'), 'residential developer gets unit sales');
const enterprise = resolveWorkspace({ companyType: 'MIXED_GROUP', size: 'ENTERPRISE' });
check(enterprise.modules.length >= 30, `enterprise still unlocks the broad pack (${enterprise.modules.length})`);

for (const t of COMPANY_TYPES) {
  const c = resolveWorkspace({ companyType: t.id, size: 'SMALL' });
  if (c.modules.length < 12) fails.push(`${t.id} lost an essential module`);
}
check(fails.length === 0, `${COMPANY_TYPES.length} company types all keep the essentials`);

console.log(fails.length ? `\nCORE AUDIT FAILED (${fails.length})` : '\nCORE AUDIT PASSED');
if (fails.length) process.exit(1);
