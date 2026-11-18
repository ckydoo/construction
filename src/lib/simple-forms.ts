import type { Field } from './resources';

// Only move known secondary fields. Unlisted resources, required inputs and
// financial amounts stay in the main form; this never changes the save payload.
const SECONDARY: Record<string, readonly string[]> = {
  clients: ['type', 'registrationNo', 'industry', 'accountManager', 'creditLimit', 'paymentTerms', 'tags'],
  contacts: ['jobTitle', 'mobile', 'category'],
  leads: ['probability', 'owner', 'source'],
  projects: ['code', 'contractFlavour', 'proposedEstimateCost', 'actualCompletion', 'health'],
  vendors: ['registrationNo', 'paymentTerms', 'complianceExpiry', 'rating', 'tags'],
  arInvoices: ['taxInvoiceNo'],
  purchaseOrders: ['requisitionId', 'approvedBy'],
};
export function splitFormFields(resource: string, fields: Field[]) {
  const secondary = new Set(SECONDARY[resource] || []);
  const editable = fields.filter(f => !f.readOnly);
  return {
    main: editable.filter(f => f.required || !secondary.has(f.key)),
    more: editable.filter(f => !f.required && secondary.has(f.key)),
  };
}
