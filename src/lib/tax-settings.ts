export type TaxSettings = { enabled: boolean; rate: number };
/** No statutory rate is implied. Existing records retain their own tax values. */
export function normaliseTaxSettings(raw: unknown): TaxSettings {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rate = typeof value.rate === 'number' ? value.rate : 0;
  return { enabled: value.enabled === true && Number.isFinite(rate) && rate > 0 && rate <= 100,
    rate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 0 };
}
export function taxDefault(raw: unknown): number {
  const settings = normaliseTaxSettings(raw);
  return settings.enabled ? settings.rate : 0;
}

/** Presentation only: never clears stored transaction or company values. */
export function taxEnabled(raw: unknown): boolean {
  return normaliseTaxSettings(raw).enabled;
}
export function isTaxField(key: string): boolean {
  return /^(vat|tax)/i.test(key);
}
export function taxVisibleFields<T extends { key: string; label: string; options?: string[] }>(fields: T[], tax: unknown): T[] {
  if (taxEnabled(tax)) return fields;
  return fields.filter(f => !isTaxField(f.key)).map(f => ({
    ...f,
    label: f.label.replace(/\s+incl\. VAT/i, ''),
    ...(f.options ? { options: f.options.filter(o => !/^(tax|vat)$/i.test(o)) } : {}),
  }));
}
