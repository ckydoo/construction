/* Dumps the declarative resource/module registry as JSON for scripts/audit.py.
   Run: npx tsx scripts/audit-defs.ts > /tmp/defs.json */
import { RESOURCES } from '../src/lib/resources';
import { MODULES, ROLES, canRead, canWrite, canDelete, ruleFor, capabilitiesFor } from '../src/lib/catalog';

const out = {
  resources: RESOURCES.map(r => ({
    id: r.id, label: r.label, prefix: r.prefix, titleKey: r.titleKey, module: r.module,
    fields: r.fields.map(f => ({
      key: f.key, type: f.type, required: !!f.required, readOnly: !!f.readOnly,
      options: f.options || null, ref: f.ref || null,
    })),
    statusOptions: r.statusOptions || null,
    columns: r.columns,
    amountKey: r.amountKey || null,
    projectScoped: !!r.projectScoped,
  })),
  modules: MODULES.map(m => ({ id: m.id, label: m.label, resources: m.resources })),
  roles: ROLES.map(r => ({ id: r.id, label: r.label })),
  roleRules: Object.fromEntries(ROLES.map(r => [r.id, {
    read: RESOURCES.filter(x => canRead(r.id, x.id)).map(x => x.id),
    write: RESOURCES.filter(x => canWrite(r.id, x.id)).map(x => x.id),
    delete: canDelete(r.id),
    scoped: ruleFor(r.id).scoped,
    capabilities: capabilitiesFor(r.id),
  }])),
};
console.log(JSON.stringify(out));
