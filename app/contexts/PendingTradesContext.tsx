"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

const TTL_MS = 3 * 60 * 1000; // auto-expire after 3 minutes

export interface PendingTrade {
  ticker:    string;
  side:      "buy" | "sell";
  shares:    number;
  expiresAt: number;
}

interface PendingTradesContextValue {
  pendingTrades: PendingTrade[];
  addPendingTrade: (ticker: string, side: "buy" | "sell", shares: number) => void;
  clearPendingTrade: (ticker: string) => void;
}

const STORAGE_KEY = "cairo_pending_trades";

function loadFromStorage(): PendingTrade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: PendingTrade[] = JSON.parse(raw);
    return parsed.filter(t => Date.now() < t.expiresAt);
  } catch {
    return [];
  }
}

function saveToStorage(trades: PendingTrade[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  } catch {}
}

const PendingTradesContext = createContext<PendingTradesContextValue | null>(null);

export function PendingTradesProvider({ children }: { children: ReactNode }) {
  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>([]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setPendingTrades(loadFromStorage());
  }, []);

  // Persist to localStorage whenever trades change
  useEffect(() => {
    saveToStorage(pendingTrades);
  }, [pendingTrades]);

  // Prune expired entries every 10 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setPendingTrades(prev => prev.filter(t => Date.now() < t.expiresAt));
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  const addPendingTrade = useCallback((ticker: string, side: "buy" | "sell", shares: number) => {
    setPendingTrades(prev => [
      ...prev.filter(t => t.ticker !== ticker),
      { ticker, side, shares, expiresAt: Date.now() + TTL_MS },
    ]);
  }, []);

  const clearPendingTrade = useCallback((ticker: string) => {
    setPendingTrades(prev => prev.filter(t => t.ticker !== ticker));
  }, []);

  return (
    <PendingTradesContext.Provider value={{ pendingTrades, addPendingTrade, clearPendingTrade }}>
      {children}
    </PendingTradesContext.Provider>
  );
}

export function usePendingTrades() {
  const ctx = useContext(PendingTradesContext);
  if (!ctx) throw new Error("usePendingTrades must be used inside <PendingTradesProvider>");
  return ctx;
}
