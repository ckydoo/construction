import { RESOURCES } from '../src/lib/resources';
import fs from 'node:fs';
const esc=(v:unknown)=>`"${String(v ?? '').replace(/"/g,'""')}"`;
const rows=[['Resource','Field key','Label','Type','Required in current definition','Read only','Options / referenced resource']];
for (const r of RESOURCES) for (const f of r.fields) rows.push([r.label,f.key,f.label,f.type,f.required?'Yes':'No',f.readOnly?'Yes':'No',f.ref || (f.options||[]).join(' | ')]);
fs.writeFileSync('/home/user/MYLA-FIELD-MATRIX.csv', rows.map(row=>row.map(esc).join(',')).join('\n')+'\n');
console.log(`${RESOURCES.length} resources, ${rows.length-1} fields`);
