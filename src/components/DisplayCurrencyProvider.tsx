'use client';
/* A personal, browser-only display currency. It never writes a workspace
 * setting or a business record: the chosen code is kept in localStorage and
 * used only to format amounts in the current browser. Reports, dashboards,
 * PDFs, CSV exports and the workspace base currency keep their own rules. */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { money } from '@/lib/format';
import {
  CURRENCY_CODES, normaliseCurrencyConfig, toBase, hasRate, type CurrencyConfig,
} from '@/lib/currency';

const STORAGE_KEY = 'buildops-display-currency';
const CODES = CURRENCY_CODES as readonly string[];
const cleanCode = (value: unknown, fallback = 'USD') => {
  const code = String(value || '').toUpperCase();
  return CODES.includes(code) ? code : fallback;
};

type DisplayCurrencyContext = {
  /** null = show each amount in its own original currency. */
  preference: string | null;
  /** The currency currently used for display (preference, or workspace base). */
  currency: string;
  baseCurrency: string;
  config: CurrencyConfig | null;
  options: string[];
  setPreference: (code: string | null) => void;
  setWorkspaceConfig: (raw: unknown, baseCurrency?: string) => void;
  formatMoney: (value: unknown, sourceCurrency?: string, compact?: boolean) => string;
};

const fallbackContext: DisplayCurrencyContext = {
  preference: null, currency: 'USD', baseCurrency: 'USD', config: null,
  options: [...CURRENCY_CODES], setPreference: () => {}, setWorkspaceConfig: () => {},
  formatMoney: (value, sourceCurrency = 'USD', compact = false) => money(value, cleanCode(sourceCurrency), compact),
};
const Ctx = createContext<DisplayCurrencyContext>(fallbackContext);

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<string | null>(null);
  const [config, setConfig] = useState<CurrencyConfig | null>(null);
  const configSignature = useRef('');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && CODES.includes(saved.toUpperCase())) setPreferenceState(saved.toUpperCase());
  }, []);

  const setPreference = useCallback((code: string | null) => {
    const next = code ? cleanCode(code) : null;
    setPreferenceState(next && CODES.includes(next) ? next : null);
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const setWorkspaceConfig = useCallback((raw: unknown, baseCurrency = 'USD') => {
    const signature = JSON.stringify([raw ?? null, cleanCode(baseCurrency)]);
    if (configSignature.current === signature) return;
    configSignature.current = signature;
    setConfig(normaliseCurrencyConfig(raw, cleanCode(baseCurrency)));
  }, []);

  const baseCurrency = config?.base || 'USD';
  // A saved code that an administrator later disabled behaves like Workspace
  // default: it must not silently keep converting or show an unselected menu.
  const activePreference = useMemo(() => {
    if (!preference) return null;
    if (config && !config.enabled.includes(preference)) return null;
    return preference;
  }, [preference, config]);
  const currency = activePreference || baseCurrency;
  const options = useMemo(() => config?.enabled?.length
    ? Array.from(new Set([baseCurrency, ...config.enabled]))
    : [...CURRENCY_CODES], [config, baseCurrency]);

  const formatMoney = useCallback((value: unknown, sourceCurrency?: string, compact = false) => {
    const source = cleanCode(sourceCurrency, baseCurrency);
    // No active preference means: respect each record's own currency, exactly as before.
    if (!activePreference || !config || source === currency) return money(value, source, compact);
    if (!config.enabled.includes(source) || !config.enabled.includes(currency)) return money(value, source, compact);
    if (!hasRate(source, config) || !hasRate(currency, config)) return money(value, source, compact);
    const rate = Number(config.rates[currency]);
    if (!isFinite(rate) || rate <= 0) return money(value, source, compact);
    const inBase = toBase(Number(value || 0), source, config);
    return `≈ ${money(inBase * rate, currency, compact)}`;
  }, [activePreference, config, currency, baseCurrency]);

  const value = useMemo<DisplayCurrencyContext>(() => ({
    preference: activePreference, currency, baseCurrency, config, options,
    setPreference, setWorkspaceConfig, formatMoney,
  }), [activePreference, currency, baseCurrency, config, options, setPreference, setWorkspaceConfig, formatMoney]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useDisplayCurrency = () => useContext(Ctx);
export const useDisplayMoney = () => useContext(Ctx).formatMoney;
