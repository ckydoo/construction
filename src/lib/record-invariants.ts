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
  if (resource === 'journals' && status === 'POSTED') {
    errors.status = 'Journal posting is unavailable until balanced ledger entries and accounting periods are supported. Save as draft.';
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
      errors.status = 'Payment status cannot be set manually until payment reconciliation is supported.';
    }
  }
  return errors;
}
