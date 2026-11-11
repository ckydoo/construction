/* Client-safe description of the commercial "continuous flow".
 * Pure data only — the field mapping rules live server-side in conversions.ts.
 * Keeping this file free of server imports lets the Documentation page, the
 * record drawer and the list toolbar all draw the same chain. */
export type ChainStage = {
  id: string;
  label: string;
  short: string;
  singular: string;
  icon: string;
  /** A tender is optional: a quote can be awarded straight to a job. */
  optional?: boolean;
};

/** Client → enquiry → quote → tender → job → contract → certificate → invoice → receipt. */
export const CHAIN_STAGES: ChainStage[] = [
  { id: 'clients', label: 'Client', short: 'Client', singular: 'Client', icon: 'Handshake' },
  { id: 'leads', label: 'Enquiry', short: 'Enquiry', singular: 'Enquiry', icon: 'Target' },
  { id: 'estimates', label: 'Quote', short: 'Quote', singular: 'Quote', icon: 'Calculator' },
  { id: 'bids', label: 'Tender', short: 'Tender', singular: 'Tender', icon: 'FileText', optional: true },
  { id: 'projects', label: 'Job', short: 'Job', singular: 'Job', icon: 'HardHat' },
  { id: 'contracts', label: 'Contract', short: 'Contract', singular: 'Contract', icon: 'FileSignature' },
  { id: 'paymentApps', label: 'Certificate', short: 'Certificate', singular: 'Payment certificate', icon: 'Receipt' },
  { id: 'arInvoices', label: 'Tax invoice', short: 'Invoice', singular: 'Tax invoice', icon: 'FileText' },
  { id: 'payments', label: 'Receipt', short: 'Receipt', singular: 'Payment / receipt', icon: 'Banknote' },
];

export const CHAIN_RESOURCE_IDS: string[] = CHAIN_STAGES.map(s => s.id);
export const CHAIN_RESOURCE_SET = new Set(CHAIN_RESOURCE_IDS);

/** Resources that show a "Convert to…" action. */
export const CONVERTIBLE_RESOURCE_IDS = new Set([
  'clients', 'leads', 'estimates', 'bids', 'projects', 'contracts', 'paymentApps', 'arInvoices',
]);

/** Hidden provenance fields written into a converted record's data JSON. */
export const SOURCE_KEYS = {
  resource: 'sourceResource',
  id: 'sourceId',
  number: 'sourceNumber',
  label: 'sourceLabel',
} as const;
