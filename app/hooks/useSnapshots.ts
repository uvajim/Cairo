"use client";

import { useState, useEffect } from "react";
import { BACKEND_URL } from "../lib/config";

export interface Quote {
  price: number;
  change: number;
  changePercent: number;
}

/**
 * Polls /api/market/snapshots for a list of US-equity symbols every `intervalMs`
 * milliseconds (default 15 s). Returns a map keyed by uppercase symbol.
 */
export function useSnapshots(
  symbols: string[],
  intervalMs = 15_000
): Record<string, Quote> {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const key = symbols.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res  = await fetch(`${BACKEND_URL}/api/market/snapshots?symbols=${encodeURIComponent(key)}`);
        const data = await res.json();
        if (!cancelled && !data.error) setQuotes(data);
      } catch {}
    };

    load();
    const id = setInterval(load, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [key, intervalMs]);

  return quotes;
}

/**
 * Polls /api/market/crypto (CoinGecko) for one or more coin IDs every
 * `intervalMs` milliseconds. Returns a map keyed by CoinGecko coin ID.
 */
export function useCryptoQuotes(
  ids: string[],
  intervalMs = 15_000
): Record<string, Quote> {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const key = ids.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res  = await fetch(`${BACKEND_URL}/api/market/crypto?ids=${encodeURIComponent(key)}`);
        const data = await res.json();
        if (!cancelled && !data.error) setQuotes(data);
      } catch {}
    };

    load();
    const id = setInterval(load, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [key, intervalMs]);

  return quotes;
}
