/* Server-side guardrails for record writes. These checks are not a ledger or a
 * reconciliation engine: where those systems don't exist, fail closed. */
export function recordInvariantErrors(resource: string, row: Record<string, any>, previousStatus?: string | null): Record<string, string> {
  const errors: Record<string, string> = {};
  const status = String(row.status || 'DRAFT').toUpperCase();
  const oldStatus = String(previousStatus || '').toUpperCase();
  if ((resource === 'projects' || resource === 'tasks') && row.progress != null && row.progress !== '') {
    const progress = Number(row.progress);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) errors.progress = 'Progress must be between 0 and 100.';
  }
  if (resource === 'tasks') {
    const valid = (value: any) => {
      const v = String(value || '');
      if (!v) return true; // pairs may be partial; only order is enforced
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
    };
    if (!valid(row.plannedStart) || !valid(row.plannedEnd) || !valid(row.actualStart) || !valid(row.actualEnd)) {
      errors.plannedStart = 'Enter valid dates (YYYY-MM-DD).';
    } else {
      const d = (v: any) => new Date(`${String(v)}T00:00:00Z`).valueOf();
      if (row.plannedStart && row.plannedEnd && d(row.plannedEnd) < d(row.plannedStart)) {
        errors.plannedEnd = 'Planned finish cannot be before planned start.';
      }
      if (row.actualStart && row.actualEnd && d(row.actualEnd) < d(row.actualStart)) {
        errors.actualEnd = 'Actual finish cannot be before actual start.';
      }
      // Both planned dates set: duration must agree with them (derived elsewhere).
      if (row.plannedStart && row.plannedEnd && row.duration != null && row.duration !== '') {
        const days = Math.round((d(row.plannedEnd) - d(row.plannedStart)) / 86400000) + 1;
        if (days >= 1 && Number(row.duration) !== days) errors.duration = `Duration must equal the planned dates (${days} days inclusive).`;
        else if (days < 1) { const n = Number(row.duration); if (!Number.isInteger(n) || n < 1) errors.duration = 'Duration must be a whole number of days, at least 1.'; }
      } else if (row.duration != null && row.duration !== '') {
        const n = Number(row.duration);
        if (!Number.isInteger(n) || n < 1) errors.duration = 'Duration must be a whole number of days, at least 1.';
      }
    }
  }
  if (resource === 'timesheets') {
    for (const key of ['regularHours','overtimeHours']) {
      if (row[key] != null && row[key] !== '' && (!Number.isFinite(Number(row[key])) || Number(row[key]) < 0)) errors[key] = 'Enter non-negative hours.';
    }
    if (status === 'APPROVED' && oldStatus !== 'APPROVED') {
      if (!row.employeeId) errors.employeeId = 'Select an employee before approval.';
      if (!row.projectId) errors.projectId = 'Select a project before approval.';
      if ((row.regularHours == null || row.regularHours === '') && (row.overtimeHours == null || row.overtimeHours === '')) errors.regularHours = 'Enter hours before approval.';
      const valid = (value: any) => { const v=String(value||''); if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10)===v; };
      if (!valid(row.weekStart)) errors.weekStart = 'Enter a valid start date before approval.';
      if (!valid(row.weekEnd)) errors.weekEnd = 'Enter a valid end date before approval.';
      if (!errors.weekStart && !errors.weekEnd && row.weekEnd < row.weekStart) errors.weekEnd = 'End date cannot be before start date.';
    }
  }
  if (resource === 'clients') {
    const cl = row.creditLimit;
    if (cl != null && cl !== '' && (!Number.isFinite(Number(cl)) || Number(cl) < 0)) errors.creditLimit = 'Credit limit cannot be negative.';
    const pt = row.paymentTerms;
    if (pt != null && pt !== '' && (!Number.isFinite(Number(pt)) || !Number.isInteger(Number(pt)) || Number(pt) < 0)) errors.paymentTerms = 'Payment terms must be a whole number of days (0 or more).';
  }
  if (resource === 'vendors') {
    const pt = row.paymentTerms;
    if (pt != null && pt !== '' && (!Number.isFinite(Number(pt)) || !Number.isInteger(Number(pt)) || Number(pt) < 0)) errors.paymentTerms = 'Payment terms must be a whole number of days (0 or more).';
    const rt = row.rating;
    if (rt != null && rt !== '' && (!Number.isFinite(Number(rt)) || Number(rt) < 1 || Number(rt) > 5)) errors.rating = 'Supplier rating must be between 1 and 5.';
  }
  if (resource === 'subcontractors') {
    const cl = row.creditLimit;
    if (cl != null && cl !== '' && (!Number.isFinite(Number(cl)) || Number(cl) < 0)) errors.creditLimit = 'Jobs in hand limit cannot be negative.';
    const rt = row.rating;
    if (rt != null && rt !== '' && (!Number.isFinite(Number(rt)) || Number(rt) < 1 || Number(rt) > 5)) errors.rating = 'Supplier rating must be between 1 and 5.';
  }
  if (resource === 'journals' && status === 'POSTED') {
    errors.status = 'Journal posting is unavailable until balanced ledger entries and accounting periods are supported. Save as draft.';
  }
  if (resource === 'journals' && status === 'REVERSED' && oldStatus !== 'REVERSED') {
    errors.status = 'Journal reversal is not a supported action yet. Save as draft.';
  }
  if (resource === 'arInvoices') {
    if (['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'].includes(status)) {
      if (!String(row.clientId || '').trim()) errors.clientId = 'Select a client before issuing this invoice.';
      const validDate = (value: any) => {
        const s = String(value || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const d = new Date(`${s}T00:00:00Z`);
        return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === s;
      };
      if (!validDate(row.invoiceDate)) errors.invoiceDate = 'Enter a valid invoice date before issuing.';
      if (!validDate(row.dueDate)) errors.dueDate = 'Enter a valid due date before issuing.';
      if (!errors.invoiceDate && !errors.dueDate && row.dueDate < row.invoiceDate) errors.dueDate = 'Due date cannot be before the invoice date.';
    }
    if (['PAID', 'PARTIALLY_PAID'].includes(status) && status !== oldStatus) {
      errors.status = 'Use “Record and allocate receipt” on this invoice to settle it. Paid-to-date updates automatically when receipts are allocated — it cannot be set by hand.';
    }
  }
  if (resource === 'payments') {
    if (status === 'REVERSED' && oldStatus !== 'REVERSED') {
      errors.status = 'A receipt can only be reversed with the “Reverse receipt” action on its detail view.';
    }
    if (status === 'RECONCILED' && oldStatus !== 'RECONCILED' && oldStatus !== 'CLEARED') {
      errors.status = 'Only a cleared receipt can be marked reconciled.';
    }
  }
  return errors;
}
