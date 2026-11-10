/* Dumps the internal staff row-scope matrix for scripts/gen-staff-scope.py.
   Run: npx tsx scripts/staff-defs.ts > /tmp/staff-defs.json */
import { ROLES, FULL_ACCESS_ROLES, STAFF_SHARED_RESOURCES, staffDepartments } from '../src/lib/catalog';

const out = {
  roles: ROLES.map(r => r.id),
  fullAccess: FULL_ACCESS_ROLES,
  shared: STAFF_SHARED_RESOURCES,
  departments: Object.fromEntries(ROLES.map(r => [r.id, staffDepartments(r.id)])),
};
console.log(JSON.stringify(out));
