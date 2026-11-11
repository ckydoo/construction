/* Static guardrail audit for Phase 1 workflow rules. No network or database. */
import assert from 'node:assert/strict';
import { RESOURCE_MAP } from '../src/lib/resources';
import { canCapability, canRead, canWrite, ROLES } from '../src/lib/catalog';
import {
  WORKFLOW_RULES, WORKFLOW_RESOURCE_IDS, resolveWorkflowAction,
  validateWorkflowTransition, allowedWorkflowActions, workflowAssignedRole,
} from '../src/lib/workflow';

const results: string[] = [];
function check(name: string, fn: () => string | void) {
  try {
    const detail = fn();
    results.push(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e: any) {
    results.push(`FAIL  ${name} — ${e.message}`);
    throw e;
  }
}
const roleIds = new Set(ROLES.map(r => r.id));

check('workflow rules are unique and non-empty', () => {
  assert.ok(WORKFLOW_RULES.length >= 10, 'expected the full first-phase rule set');
  assert.equal(new Set(WORKFLOW_RESOURCE_IDS).size, WORKFLOW_RULES.length, 'duplicate resource rule');
  return `${WORKFLOW_RULES.length} rules`;
});

for (const rule of WORKFLOW_RULES) {
  check(`${rule.resource}: resource, fields and statuses exist`, () => {
    const def: any = RESOURCE_MAP[rule.resource];
    assert.ok(def, 'unknown resource id');
    const options = (def.statusOptions || []).map((s: any) => typeof s === 'string' ? s : s.value);
    for (const status of [...rule.pending, ...rule.actions.map(a => a.to)]) {
      assert.ok(options.includes(status), `status ${status} is not a valid option`);
    }
    const fields = new Set((def.fields || []).map((f: any) => f.key));
    for (const key of rule.dateKeys) assert.ok(fields.has(key), `date field ${key} is missing`);
    if (rule.amountKey) assert.ok(fields.has(rule.amountKey), `amount field ${rule.amountKey} is missing`);
    assert.ok(rule.slaDays > 0, 'SLA must be positive');
    assert.ok(rule.reason.length > 10, 'reason must be plain language');
    assert.equal(new Set(rule.actions.map(a => a.id)).size, rule.actions.length, 'duplicate action id');
    assert.ok(rule.actions.some(a => a.id === 'approve' || a.id === 'close' || a.id === 'certify' || a.id === 'answer'), 'no positive close-out action');
    return `${rule.pending.length} pending → ${rule.actions.length} actions`;
  });
  check(`${rule.resource}: every approver can read, write and use records.update`, () => {
    const all = [...new Set(rule.actions.flatMap(a => a.roles))];
    for (const role of all) {
      assert.ok(roleIds.has(role as any), `unknown role ${role}`);
      assert.ok(canRead(role, rule.resource), `${role} cannot read`);
      assert.ok(canWrite(role, rule.resource), `${role} cannot write`);
      assert.ok(canCapability(role, 'records.update'), `${role} lacks records.update`);
    }
    return `${all.length} roles`;
  });
}

check('owner can resolve every declared action', () => {
  for (const rule of WORKFLOW_RULES) {
    for (const status of rule.pending) {
      const actions = allowedWorkflowActions(rule.resource, status, 'OWNER');
      assert.equal(actions.length, rule.actions.length, `${rule.resource}/${status} action list mismatch`);
      for (const action of actions) {
        const resolved = resolveWorkflowAction(rule.resource, status, action.id, 'OWNER');
        assert.equal(resolved.ok, true, `${rule.resource}/${action.id} did not resolve`);
      }
    }
  }
  return `${WORKFLOW_RULES.reduce((n, r) => n + r.pending.length * r.actions.length, 0)} combinations`;
});

check('unknown action and wrong role are refused', () => {
  const bad = resolveWorkflowAction('timesheets', 'SUBMITTED', 'delete-everything', 'OWNER');
  assert.equal(bad.ok, false);
  const wrong = resolveWorkflowAction('leaveRequests', 'PENDING', 'approve', 'FINANCE_MANAGER');
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.status, 403);
  return '400 unknown · 403 wrong role';
});

check('pending status transitions are guarded', () => {
  const blocked = validateWorkflowTransition('timesheets', 'SUBMITTED', 'POSTED', 'OWNER');
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /Use an action button in My work/);
  const allowed = validateWorkflowTransition('timesheets', 'SUBMITTED', 'APPROVED', 'OWNER');
  assert.equal(allowed.ok, true);
  const draft = validateWorkflowTransition('timesheets', 'DRAFT', 'POSTED', 'OWNER');
  assert.equal(draft.ok, true, 'draft states must remain flexible');
  if (draft.ok) assert.equal(draft.guarded, false);
  return 'blocked bypass · allowed decision · draft unchanged';
});

check('assignment wording is role-aware', () => {
  assert.equal(workflowAssignedRole('timesheets', 'OWNER'), 'you');
  assert.notEqual(workflowAssignedRole('leaveRequests', 'FINANCE_MANAGER'), 'you');
  return 'owner → you · non-approver → approver role';
});

console.log(results.join('\n'));
console.log(`\n${results.length} PASS / 0 FAIL`);
