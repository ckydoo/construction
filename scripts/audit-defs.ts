/* Dumps the declarative resource/module registry as JSON for scripts/audit.py.
   Run: npx tsx scripts/audit-defs.ts > /tmp/defs.json */
import { RESOURCES } from '../src/lib/resources';
import { MODULES } from '../src/lib/catalog';

const out = {
  resources: RESOURCES.map(r => ({
    id: r.id, label: r.label, prefix: r.prefix, titleKey: r.titleKey, module: r.module,
    fields: r.fields.map(f => ({
      key: f.key, type: f.type, required: !!f.required,
      options: f.options || null, ref: f.ref || null,
    })),
    statusOptions: r.statusOptions || null,
    columns: r.columns,
    amountKey: r.amountKey || null,
    projectScoped: !!r.projectScoped,
  })),
  modules: MODULES.map(m => ({ id: m.id, label: m.label, resources: m.resources })),
};
console.log(JSON.stringify(out));
