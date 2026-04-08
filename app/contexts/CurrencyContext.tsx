"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export const CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CHF",
  "HKD", "MXN", "AED", "NGN", "ARS", "BRL",
] as const;

export type Currency = typeof CURRENCIES[number];

// Locale tags that produce the best number formatting for each currency
const LOCALE_FOR: Record<Currency, string> = {
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
  CHF: "de-CH",
  HKD: "zh-HK",
  MXN: "es-MX",
  AED: "ar-AE",
  NGN: "en-NG",
  ARS: "es-AR",
  BRL: "pt-BR",
};

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  formatPrice: (usd: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  setCurrency: () => {},
  formatPrice: (usd) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(usd),
});

const LS_CURRENCY = "maritime-currency";
const LS_FX_RATES = "maritime-fx-rates";
const LS_FX_TS    = "maritime-fx-ts";
const FX_TTL_MS   = 24 * 60 * 60 * 1000; // 24 h

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("USD");
  const [rates, setRates] = useState<Record<string, number>>({});

  // Rehydrate stored currency on mount
  useEffect(() => {
    const stored = localStorage.getItem(LS_CURRENCY) as Currency | null;
    if (stored && (CURRENCIES as readonly string[]).includes(stored)) {
      setCurrencyState(stored);
    }
  }, []);

  // Fetch exchange rates (USD-base), with 24 h localStorage cache
  useEffect(() => {
    const cached    = localStorage.getItem(LS_FX_RATES);
    const cachedTs  = localStorage.getItem(LS_FX_TS);
    const now       = Date.now();

    if (cached && cachedTs && now - Number(cachedTs) < FX_TTL_MS) {
      try { setRates(JSON.parse(cached)); return; } catch { /* fall through */ }
    }

    fetch(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json"
    )
      .then(r => r.json())
      .then((data: { usd: Record<string, number> }) => {
        const r = data.usd ?? {};
        setRates(r);
        localStorage.setItem(LS_FX_RATES, JSON.stringify(r));
        localStorage.setItem(LS_FX_TS,    String(Date.now()));
      })
      .catch(() => { /* keep rates at {} — USD pass-through */ });
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem(LS_CURRENCY, c);
  }, []);

  const formatPrice = useCallback(
    (usd: number): string => {
      const key       = currency.toLowerCase();
      const rate      = currency === "USD" ? 1 : (rates[key] ?? 1);
      const converted = usd * rate;
      const isJpy     = currency === "JPY";
      return new Intl.NumberFormat(LOCALE_FOR[currency] ?? "en-US", {
        style:                 "currency",
        currency,
        minimumFractionDigits: isJpy ? 0 : 2,
        maximumFractionDigits: isJpy ? 0 : 2,
      }).format(converted);
    },
    [currency, rates]
  );

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
