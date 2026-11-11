/* Phase 1 action inbox + approval guardrails.
 *
 * Rules are intentionally built-in and conservative: only records sitting in a
 * "waiting for someone" state are locked to explicit next actions. Drafts and
 * ordinary edits keep working exactly as before. No new database table is
 * needed — work items are derived from the existing record registers.
 */
export type WorkflowTone = 'green' | 'red' | 'amber' | 'blue' | 'slate';
export type WorkflowAction = {
  id: string;
  label: string;
  to: string;
  tone: WorkflowTone;
  roles: string[];
  /** Short explanation used in the audit log and confirmation toast. */
  note: string;
};
export type WorkflowRule = {
  resource: string;
  label: string;
  singular: string;
  icon: string;
  pending: string[];
  dateKeys: string[];
  amountKey?: string;
  slaDays: number;
  reason: string;
  actions: WorkflowAction[];
};
export type WorkItem = {
  key: string;
  resource: string;
  resourceLabel: string;
  singular: string;
  icon: string;
  id: string;
  number: string;
  title: string;
  status: string;
  reason: string;
  amount: number | null;
  currency: string;
  dueAt: string | null;
  ageDays: number;
  overdue: boolean;
  dueSoon: boolean;
  escalated: boolean;
  priority: 'high' | 'medium' | 'low';
  tone: WorkflowTone;
  href: string;
  projectName: string | null;
  assignedRole: string;
  canAct: boolean;
  actions: { id: string; label: string; to: string; tone: WorkflowTone }[];
};

const OA = ['OWNER', 'ADMIN'];
const roles = (...extra: string[]) => Array.from(new Set([...OA, ...extra]));
const PROJECT = roles('PROJECT_MANAGER', 'SITE_ENGINEER', 'ESTIMATOR');
const COMMERCIAL = roles('PROJECT_MANAGER', 'FINANCE_MANAGER', 'ESTIMATOR');
const PROCUREMENT = roles('PROJECT_MANAGER', 'PROCUREMENT', 'FINANCE_MANAGER');
const FINANCE = roles('FINANCE_MANAGER', 'ACCOUNTANT');
const HR = roles('HR_MANAGER', 'PROJECT_MANAGER');
const SITE = roles('PROJECT_MANAGER', 'SITE_ENGINEER', 'SAFETY_OFFICER');

const act = (
  id: string, label: string, to: string, tone: WorkflowTone, allowed: string[], note: string,
): WorkflowAction => ({ id, label, to, tone, roles: allowed, note });

export const WORKFLOW_RULES: WorkflowRule[] = [
  {
    resource: 'timesheets', label: 'Time sheets', singular: 'Time sheet', icon: 'Clock',
    pending: ['SUBMITTED'], dateKeys: ['weekEnd', 'weekStart'], amountKey: 'labourCost', slaDays: 2,
    reason: 'Waiting for approval before labour cost is posted',
    actions: [
      act('approve', 'Approve', 'APPROVED', 'green', PROJECT, 'Timesheet approved for job costing'),
      act('reject', 'Send back', 'REJECTED', 'red', PROJECT, 'Timesheet sent back for correction'),
      act('return', 'Return to draft', 'DRAFT', 'slate', PROJECT, 'Timesheet returned to draft'),
    ],
  },
  {
    resource: 'changeOrders', label: 'Variations & extras', singular: 'Variation', icon: 'GitPullRequestArrow',
    pending: ['SUBMITTED', 'UNDER_REVIEW'], dateKeys: ['submittedDate', 'decisionDate'], amountKey: 'amount', slaDays: 3,
    reason: 'Variation is awaiting a commercial decision',
    actions: [
      act('approve', 'Approve', 'APPROVED', 'green', COMMERCIAL, 'Variation approved'),
      act('reject', 'Reject', 'REJECTED', 'red', COMMERCIAL, 'Variation rejected'),
      act('return', 'Return to draft', 'DRAFT', 'slate', COMMERCIAL, 'Variation returned to draft'),
    ],
  },
  {
    resource: 'requisitions', label: 'Material requests', singular: 'Material request', icon: 'ClipboardList',
    pending: ['SUBMITTED'], dateKeys: ['requiredDate'], amountKey: 'estimatedValue', slaDays: 2,
    reason: 'Site request needs approval before an order can be raised',
    actions: [
      act('approve', 'Approve', 'APPROVED', 'green', PROCUREMENT, 'Material request approved'),
      act('reject', 'Reject', 'REJECTED', 'red', PROCUREMENT, 'Material request rejected'),
      act('return', 'Return to draft', 'DRAFT', 'slate', PROCUREMENT, 'Material request returned to draft'),
    ],
  },
  {
    resource: 'purchaseOrders', label: 'Orders to suppliers', singular: 'Purchase order', icon: 'ShoppingCart',
    pending: ['PENDING_APPROVAL'], dateKeys: ['deliveryDate', 'orderDate'], amountKey: 'amount', slaDays: 2,
    reason: 'Purchase order is waiting for approval',
    actions: [
      act('approve', 'Approve order', 'APPROVED', 'green', PROCUREMENT, 'Purchase order approved'),
      act('cancel', 'Cancel order', 'CANCELLED', 'red', PROCUREMENT, 'Purchase order cancelled'),
      act('return', 'Return to draft', 'DRAFT', 'slate', PROCUREMENT, 'Purchase order returned to draft'),
    ],
  },
  {
    resource: 'expenses', label: 'Expense claims', singular: 'Expense claim', icon: 'Receipt',
    pending: ['SUBMITTED'], dateKeys: ['expenseDate'], amountKey: 'amount', slaDays: 7,
    reason: 'Expense claim needs approval before reimbursement',
    actions: [
      act('approve', 'Approve', 'APPROVED', 'green', FINANCE, 'Expense claim approved'),
      act('reject', 'Reject', 'REJECTED', 'red', FINANCE, 'Expense claim rejected'),
      act('return', 'Return to draft', 'DRAFT', 'slate', FINANCE, 'Expense claim returned to draft'),
    ],
  },
  {
    resource: 'leaveRequests', label: 'Leave requests', singular: 'Leave request', icon: 'Palmtree',
    pending: ['PENDING'], dateKeys: ['startDate'], slaDays: 2,
    reason: 'Leave application is waiting for a decision',
    actions: [
      act('approve', 'Approve leave', 'APPROVED', 'green', HR, 'Leave request approved'),
      act('reject', 'Reject', 'REJECTED', 'red', HR, 'Leave request rejected'),
      act('cancel', 'Cancel', 'CANCELLED', 'slate', HR, 'Leave request cancelled'),
    ],
  },
  {
    resource: 'submittals', label: 'Drawing approvals', singular: 'Approval package', icon: 'Send',
    pending: ['PENDING', 'UNDER_REVIEW'], dateKeys: ['requiredDate', 'submittedDate'], slaDays: 3,
    reason: 'Shop drawing or material submission needs a review outcome',
    actions: [
      act('approve', 'Approve', 'APPROVED', 'green', PROJECT, 'Submission approved'),
      act('noted', 'Approve as noted', 'APPROVE_AS_NOTED', 'blue', PROJECT, 'Submission approved as noted'),
      act('resubmit', 'Request resubmission', 'RESUBMIT', 'amber', PROJECT, 'Resubmission requested'),
      act('reject', 'Reject', 'REJECTED', 'red', PROJECT, 'Submission rejected'),
    ],
  },
  {
    resource: 'paymentApps', label: 'Payment certificates', singular: 'Payment certificate', icon: 'Receipt',
    pending: ['SUBMITTED'], dateKeys: ['periodEnd'], amountKey: 'netCertified', slaDays: 5,
    reason: 'Interim application is waiting to be certified',
    actions: [
      act('certify', 'Certify', 'CERTIFIED', 'green', FINANCE, 'Payment certificate certified'),
      act('return', 'Return to draft', 'DRAFT', 'slate', FINANCE, 'Payment certificate returned to draft'),
    ],
  },
  {
    resource: 'rfis', label: 'Site queries', singular: 'Site query', icon: 'MessageCircleQuestion',
    pending: ['OPEN', 'OVERDUE'], dateKeys: ['dueDate'], slaDays: 3,
    reason: 'Site query needs an answer before work is held up',
    actions: [
      act('answer', 'Mark answered', 'ANSWERED', 'blue', PROJECT, 'Site query marked answered'),
      act('close', 'Close', 'CLOSED', 'green', PROJECT, 'Site query closed'),
    ],
  },
  {
    resource: 'punchLists', label: 'Snag lists', singular: 'Snag item', icon: 'ListChecks',
    pending: ['OPEN', 'IN_PROGRESS', 'REWORK', 'REINSPECTION'], dateKeys: ['dueDate'], slaDays: 3,
    reason: 'Defect is waiting for rework or sign-off',
    actions: [
      act('close', 'Close snag', 'CLOSED', 'green', SITE, 'Snag item closed'),
      act('rework', 'Send for rework', 'REWORK', 'amber', SITE, 'Snag item sent for rework'),
    ],
  },
  {
    resource: 'incidents', label: 'Incidents & near misses', singular: 'Incident', icon: 'TriangleAlert',
    pending: ['REPORTED', 'UNDER_INVESTIGATION', 'ACTION_OPEN'], dateKeys: ['dateTime'], slaDays: 2,
    reason: 'Safety action is still open',
    actions: [
      act('investigate', 'Start investigation', 'UNDER_INVESTIGATION', 'amber', SITE, 'Incident investigation started'),
      act('close', 'Close incident', 'CLOSED', 'green', SITE, 'Incident closed'),
    ],
  },
  {
    resource: 'ncrs', label: 'Faults & rework', singular: 'Fault', icon: 'CircleSlash',
    pending: ['OPEN', 'INVESTIGATING', 'REWORK'], dateKeys: ['raisedDate'], slaDays: 3,
    reason: 'Quality fault needs corrective action close-out',
    actions: [
      act('rework', 'Send for rework', 'REWORK', 'amber', SITE, 'Fault sent for rework'),
      act('close', 'Close fault', 'CLOSED', 'green', SITE, 'Fault closed'),
    ],
  },
];

export const WORKFLOW_RESOURCE_IDS = WORKFLOW_RULES.map(r => r.resource);
export const WORKFLOW_RULE_MAP: Record<string, WorkflowRule> = Object.fromEntries(
  WORKFLOW_RULES.map(r => [r.resource, r]),
);

export function workflowRule(resource: string): WorkflowRule | undefined {
  return WORKFLOW_RULE_MAP[resource];
}

export function allowedWorkflowActions(resource: string, from: string, role: string): WorkflowAction[] {
  const rule = workflowRule(resource);
  if (!rule || !rule.pending.includes(String(from || ''))) return [];
  return rule.actions.filter(a => a.roles.includes(role));
}

export function canRunWorkflowAction(resource: string, from: string, actionId: string, role: string): boolean {
  return allowedWorkflowActions(resource, from, role).some(a => a.id === actionId);
}

/** Used by the dedicated action endpoint. */
export function resolveWorkflowAction(resource: string, from: string, actionId: string, role: string) {
  const rule = workflowRule(resource);
  if (!rule) return { ok: false as const, error: 'No workflow is defined for this register', status: 400 as const };
  if (!rule.pending.includes(String(from || ''))) {
    return { ok: false as const, error: 'This record is no longer waiting for an action', status: 409 as const };
  }
  const action = rule.actions.find(a => a.id === actionId);
  if (!action) return { ok: false as const, error: 'Unknown action', status: 400 as const };
  if (!action.roles.includes(role)) {
    return { ok: false as const, error: 'Your role is not permitted to take this action', status: 403 as const };
  }
  return { ok: true as const, rule, action };
}

/** Used by the generic PATCH route so a status dropdown cannot bypass approvals. */
export function validateWorkflowTransition(resource: string, from: string, to: string, role: string) {
  const rule = workflowRule(resource);
  if (!rule || !to || to === from) return { ok: true as const, guarded: false as const };
  if (!rule.pending.includes(String(from || ''))) return { ok: true as const, guarded: false as const };
  const action = rule.actions.find(a => a.to === to);
  if (!action) {
    return {
      ok: false as const, guarded: true as const, status: 400 as const,
      error: `A ${rule.singular.toLowerCase()} in ${from} can only move to ${rule.actions.map(a => a.to).join(', ')}. Use an action button in My work.`,
    };
  }
  if (!action.roles.includes(role)) {
    return {
      ok: false as const, guarded: true as const, status: 403 as const,
      error: 'Your role is not permitted to take this action. Use My work or ask an approver.',
    };
  }
  return { ok: true as const, guarded: true as const, action };
}

export function workflowAssignedRole(resource: string, role: string): string {
  const rule = workflowRule(resource);
  if (!rule) return 'your role';
  if (rule.actions[0]?.roles.includes(role)) return 'you';
  return rule.actions[0]?.roles.filter(r => r !== 'OWNER' && r !== 'ADMIN')[0]?.replace(/_/g, ' ').toLowerCase() || 'an approver';
}
