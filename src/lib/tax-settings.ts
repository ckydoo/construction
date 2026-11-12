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
