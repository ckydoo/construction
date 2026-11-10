/* Multi-currency settings and base-currency reporting.
 *
 * A record keeps the currency it was entered in. Reporting totals are converted
 * to the workspace base currency with manual exchange rates set in Settings.
 * `rates[currency]` means "how many units of this currency equal 1 unit of the
 * base currency" — e.g. with a USD base, 1 USD = 26 ZWG, so rates.ZWG = 26.
 * These are manual reporting rates, never live market data.
 */
export type CurrencyConfig = {
  base: string;
  enabled: string[];
  rates: Record<string, number>;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export const CURRENCY_CODES = ['USD', 'ZWG', 'ZAR', 'EUR', 'GBP'] as const;
export const CURRENCY_LABELS: Record<string, string> = {
  USD: 'US dollar', ZWG: 'Zimbabwe Gold', ZAR: 'South African rand',
  EUR: 'Euro', GBP: 'Pound sterling',
};

/** Indicative starter rates expressed as units per 1 USD. */
export const DEFAULT_USD_RATES: Record<string, number> = {
  USD: 1, ZWG: 26, ZAR: 18, EUR: 0.92, GBP: 0.78,
};
/** Backwards-compatible alias for the original USD-based starter rates. */
export const DEFAULT_RATES = DEFAULT_USD_RATES;

function cleanBase(base: unknown): string {
  const code = String(base || 'USD').toUpperCase();
  return (CURRENCY_CODES as readonly string[]).includes(code) ? code : 'USD';
}

/** Convert the starter rates so `rates[code]` is units of code per 1 base unit. */
function ratesForBase(base: string): Record<string, number> {
  const b = cleanBase(base);
  const factor = DEFAULT_USD_RATES[b] || 1;
  return Object.fromEntries((CURRENCY_CODES as readonly string[])
    .map(c => [c, DEFAULT_USD_RATES[c] / factor])) as Record<string, number>;
}

export function defaultCurrencyConfig(base = 'USD'): CurrencyConfig {
  const b = cleanBase(base);
  return { base: b, enabled: [...CURRENCY_CODES], rates: ratesForBase(b), updatedAt: null, updatedBy: null };
}

/** Re-express an existing rate table when the reporting currency changes. */
export function normaliseCurrencyConfig(raw: any, baseCurrency = 'USD'): CurrencyConfig {
  const requestedBase = cleanBase(baseCurrency);
  const source = raw && typeof raw === 'object' ? raw : {};
  const codes = CURRENCY_CODES as readonly string[];
  const sourceBase = source.base && codes.includes(String(source.base).toUpperCase())
    ? String(source.base).toUpperCase()
    : requestedBase;

  // Rates in the stored config are expressed against sourceBase. Start with
  // sensible defaults for that base, then accept only positive manual rates.
  const sourceRates: Record<string, number> = { ...ratesForBase(sourceBase), [sourceBase]: 1 };
  for (const code of codes) {
    if (code === sourceBase) continue;
    const n = Number(source.rates?.[code]);
    if (isFinite(n) && n > 0) sourceRates[code] = n;
  }

  let rates = sourceRates;
  if (sourceBase !== requestedBase) {
    const factor = sourceRates[requestedBase];
    rates = isFinite(factor) && factor > 0
      ? Object.fromEntries(codes.map(c => [c, sourceRates[c] / factor])) as Record<string, number>
      : ratesForBase(requestedBase);
    rates[requestedBase] = 1;
  }

  const enabled = Array.isArray(source.enabled)
    ? Array.from(new Set([requestedBase, sourceBase, ...source.enabled
      .map((c: any) => String(c).toUpperCase()).filter((c: string) => codes.includes(c))]))
    : [...CURRENCY_CODES];

  return {
    base: requestedBase, enabled, rates,
    updatedAt: source.updatedAt ? String(source.updatedAt) : null,
    updatedBy: source.updatedBy ? String(source.updatedBy) : null,
  };
}

/** Settings helper: change the base without losing the meaning of saved rates. */
export function switchCurrencyBase(raw: any, newBase: string): CurrencyConfig {
  const source = raw && typeof raw === 'object' ? { ...raw } : {};
  return normaliseCurrencyConfig(source, newBase);
}

/** Convert an amount into the workspace base currency. */
export function toBase(amount: unknown, currency: unknown, cfg: CurrencyConfig): number {
  const n = Number(amount || 0);
  if (!isFinite(n) || n === 0) return 0;
  const code = String(currency || cfg.base).toUpperCase();
  if (code === cfg.base) return n;
  const rate = Number(cfg.rates[code]);
  if (!isFinite(rate) || rate <= 0) return n; // no manual rate: keep original and flag it in the UI
  return n / rate;
}

export function hasRate(currency: unknown, cfg: CurrencyConfig): boolean {
  const code = String(currency || cfg.base).toUpperCase();
  if (code === cfg.base) return true;
  const rate = Number(cfg.rates[code]);
  return isFinite(rate) && rate > 0;
}

/** Sum a money field across rows, converted into base currency. */
export function sumInBase(rows: any[], key: string, cfg: CurrencyConfig): number {
  return rows.reduce((t, r) => t + toBase(r[key], r.currency || cfg.base, cfg), 0);
}

/** Per-currency breakdown used by the dashboard / reports FX cards.
 *  `key` may be a field name or a selector, because different registers name
 *  their money field differently (`total`, `contractValue`, `actualToDate`…). */
export function currencyBreakdown(rows: any[], key: string | ((row: any) => unknown), cfg: CurrencyConfig) {
  const valueOf = typeof key === 'function' ? key : (r: any) => r[key];
  const byCode: Record<string, { currency: string; amount: number; baseAmount: number; rate: number | null }> = {};
  for (const r of rows) {
    const code = String(r.currency || cfg.base).toUpperCase();
    const amount = Number(valueOf(r)) || 0;
    const rawRate = Number(cfg.rates[code]);
    const entry = byCode[code] || (byCode[code] = {
      currency: code, amount: 0, baseAmount: 0,
      rate: code === cfg.base ? 1 : (isFinite(rawRate) && rawRate > 0 ? rawRate : null),
    });
    entry.amount += amount;
    entry.baseAmount += toBase(amount, code, cfg);
  }
  return Object.values(byCode).sort((a, b) => b.baseAmount - a.baseAmount);
}
