"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { PortfolioChart } from "./PortfolioChart";
import { Watchlist } from "./Watchlist";
import { usePublicClient } from "wagmi";
import { useWallet } from "../contexts/WalletContext";
import { BACKEND_URL, EQUITY_VAULT_ADDRESS, EQUITY_VAULT_ABI, CHAIN_ID, PORTFOLIO_BALANCE_API_URL } from "../lib/config";
import { DepositMethodModal } from "./DepositMethodModal";
import { holdingsCache } from "../lib/holdingsCache";

function HoldingRow({ ticker, qty, price, total }: { ticker: string; qty: number; price: number; total: number }) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  return (
      <Link to={`/stock/${ticker}`} className="flex items-center justify-between py-3 border-b border-default last:border-0 hover-surface -mx-1 px-1 rounded-lg transition-colors">
        <div className="flex items-center gap-3">
          {!imgError ? (
              <Image
                  src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                  alt={ticker}
                  width={36}
                  height={36}
                  unoptimized
                  className="rounded-full surface-3 object-cover"
                  onError={() => setImgError(true)}
              />
          ) : (
              <div className="w-9 h-9 rounded-full surface-3 flex items-center justify-center text-xs font-bold">
                {ticker[0]}
              </div>
          )}
          <div>
            <p className="text-sm font-bold">{ticker}</p>
            <p className="text-xs text-muted">{t("portfolio.shares", { count: qty })}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">
            {total > 0 ? `$${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
          </p>
          <p className="text-xs text-muted">
            {price > 0 ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t("portfolio.perShare")}` : "—"}
          </p>
        </div>
      </Link>
  );
}

const timeRanges = ["1D", "1W", "1M", "3M", "1Y"];

const RANGE_DAYS: Record<string, number> = {
  "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365,
};

// Chart cache keyed by wallet+range
const chartCache: Record<string, { time: string; value: number }[]> = {};

export function Portfolio() {
  const { t } = useTranslation();
  const [selectedRange, setSelectedRange] = useState("1D");
  const [hoveredPrice, setHoveredPrice]   = useState<number | null>(null);
  const [hoveredTime,  setHoveredTime]    = useState<string | null>(null);
  const [chartPoints,  setChartPoints]    = useState<{ time: string; value: number }[]>([]);
  const [chartLoading, setChartLoading]   = useState(false);

  // Rely strictly on the context!
  const { address, accountBalance } = useWallet();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });

  // Holdings — seed from shared cache instantly
  const [holdings,      setHoldings]      = useState<Record<string, number>>(holdingsCache.holdings);
  const [holdingPrices, setHoldingPrices] = useState<Record<string, number>>(holdingsCache.prices);

  useEffect(() => {
    if (!address || !publicClient) { setHoldings({}); setHoldingPrices({}); return; }
    let cancelled = false;

    const fetchHoldings = async () => {
      try {
        const count = await publicClient.readContract({
          address:      EQUITY_VAULT_ADDRESS,
          abi:          EQUITY_VAULT_ABI,
          functionName: 'tickerCount',
        }) as bigint;

        const tickerCalls = Array.from({ length: Number(count) }, (_, i) => ({
          address:      EQUITY_VAULT_ADDRESS,
          abi:          EQUITY_VAULT_ABI,
          functionName: 'allTickers' as const,
          args:         [BigInt(i)] as const,
        }));
        const tickerResults = count > 0n
          ? await publicClient.multicall({ contracts: tickerCalls })
          : [];
        const tickers = tickerResults
          .map(r => r.status === 'success' ? (r.result as string) : null)
          .filter((t): t is string => t !== null);

        const balanceCalls = tickers.map(ticker => ({
          address:      EQUITY_VAULT_ADDRESS,
          abi:          EQUITY_VAULT_ABI,
          functionName: 'balanceOfTicker' as const,
          args:         [address as `0x${string}`, ticker] as const,
        }));
        const balanceResults = tickers.length > 0
          ? await publicClient.multicall({ contracts: balanceCalls })
          : [];

        const h: Record<string, number> = {};
        balanceResults.forEach((r, i) => {
          if (r.status === 'success' && (r.result as bigint) > 0n)
            h[tickers[i]] = Number(r.result as bigint) / 1_000_000;
        });

        if (cancelled) return;
        setHoldings(h);

        const heldTickers = Object.keys(h);
        if (heldTickers.length === 0) return;

        const snapRes  = await fetch(`${BACKEND_URL}/api/market/snapshots?symbols=${heldTickers.join(",")}`);
        const snapData = await snapRes.json();
        if (cancelled) return;

        const prices: Record<string, number> = {};
        for (const ticker of heldTickers) {
          prices[ticker] = snapData[ticker]?.price ?? 0;
        }
        setHoldingPrices(prices);
        holdingsCache.address  = address;
        holdingsCache.holdings = h;
        holdingsCache.prices   = prices;
      } catch { /* keep previous */ }
    };

    fetchHoldings();
    const id = setInterval(fetchHoldings, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [address, publicClient]);

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [storedPortfolioBalance, setStoredPortfolioBalance] = useState<number | null>(null);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);
  const lastSyncedBalanceRef = useRef<number | null>(null);

  // Uses the fixed value from WalletContext
  const holdingsValue  = Object.entries(holdings).reduce((sum, [ticker, qty]) => sum + qty * (holdingPrices[ticker] ?? 0), 0);
  const portfolioValue = address ? accountBalance + holdingsValue : 0;

  useEffect(() => {
    if (!address) {
      setStoredPortfolioBalance(null);
      setAccountCreatedAt(null);
      lastSyncedBalanceRef.current = null;
      return;
    }

    let cancelled = false;
    fetch(`${PORTFOLIO_BALANCE_API_URL}/${address}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const value = typeof data?.balance === "number" ? data.balance : null;
        setStoredPortfolioBalance(value);
        setAccountCreatedAt(typeof data?.createdAt === "string" ? data.createdAt : null);
        lastSyncedBalanceRef.current = value;
      })
      .catch(() => { /* keep local value */ });

    return () => { cancelled = true; };
  }, [address]);

  useEffect(() => {
    if (!address) return;
    if (!Number.isFinite(portfolioValue)) return;

    const roundedBalance = Math.round(portfolioValue * 100) / 100;
    if (lastSyncedBalanceRef.current !== null && Math.abs(lastSyncedBalanceRef.current - roundedBalance) < 0.01) {
      return;
    }

    const timer = setTimeout(() => {
      fetch(`${PORTFOLIO_BALANCE_API_URL}/${address}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balance: roundedBalance }),
      })
        .then((r) => r.json())
        .then((data) => {
          const value = typeof data?.balance === "number" ? data.balance : roundedBalance;
          lastSyncedBalanceRef.current = value;
          setStoredPortfolioBalance(value);
          if (typeof data?.createdAt === "string") setAccountCreatedAt(data.createdAt);
        })
        .catch(() => { /* best-effort sync */ });
    }, 600);

    return () => clearTimeout(timer);
  }, [address, portfolioValue]);

  const chartColor =
      chartPoints.length >= 2 &&
      chartPoints[chartPoints.length - 1].value >= chartPoints[0].value
          ? "#00c805"
          : "#ff5000";

  useEffect(() => {
    if (!address) {
      setChartPoints([]);
      setChartLoading(false);
      return;
    }

    const cacheKey = `${address.toLowerCase()}::${selectedRange}`;
    if (chartCache[cacheKey]) {
      setChartPoints(chartCache[cacheKey]);
      setChartLoading(false);
      return;
    }
    setChartPoints([]);
    setChartLoading(true);
    const days = RANGE_DAYS[selectedRange] ?? 1;
    fetch(`${PORTFOLIO_BALANCE_API_URL}/${address}/history?days=${days}`)
        .then(r => r.json())
        .then(data => {
          const points = (data.points ?? []).map(
              (p: { time: string; value: number }) => ({
                time: new Date(p.time).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }),
                value: Math.round(p.value * 100) / 100,
              })
          );
          chartCache[cacheKey] = points;
          setChartPoints(points);
        })
        .catch(() => {})
        .finally(() => setChartLoading(false));
  }, [selectedRange, address]);

  const displayValue = hoveredPrice ?? storedPortfolioBalance ?? portfolioValue;
  const accountAgeDays = accountCreatedAt
    ? Math.max(1, Math.floor((Date.now() - new Date(accountCreatedAt).getTime()) / (24 * 60 * 60 * 1000)) + 1)
    : Number.POSITIVE_INFINITY;
  const hasEnoughHistory = chartPoints.length >= 2;

  useEffect(() => {
    const selectedDays = RANGE_DAYS[selectedRange] ?? 1;
    if (selectedDays <= accountAgeDays) return;
    const fallback = [...timeRanges]
      .reverse()
      .find((range) => (RANGE_DAYS[range] ?? 1) <= accountAgeDays) ?? "1D";
    setSelectedRange(fallback);
  }, [selectedRange, accountAgeDays]);

  return (
      <div className="app-bg app-fg font-sans selection:bg-gray-800">
        <div className="max-w-[1024px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">

          <div className="flex flex-col">
            <header className="mb-6 relative">
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-1 cursor-pointer group w-fit">
                  <h1 className="text-xl font-medium transition-colors">{t("overview.title")}</h1>
                </div>
              </div>

              <div>
                <h2 className="text-4xl font-bold tracking-tight mb-1">
                  ${displayValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h2>
                {hoveredTime && (
                  <p className="text-xs text-muted">At {hoveredTime}</p>
                )}
              </div>
            </header>

            <div className="mb-8 relative">
              {chartLoading ? (
                  <div className="h-[280px] w-full surface-3 animate-pulse rounded-xl" />
              ) : (
                  <>
                    <PortfolioChart
                        color={chartColor}
                        showReferenceLine={false}
                        data={chartPoints}
                        onHover={(v, t) => { setHoveredPrice(v); setHoveredTime(t); }}
                    />
                    {!hasEnoughHistory && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="px-3 py-1.5 rounded-full surface-3 border border-default text-xs text-muted">
                          Not enough history yet for this time range
                        </div>
                      </div>
                    )}
                  </>
              )}
              <div className="flex justify-between items-center mt-6 border-b border-default pb-4">
                <div className="flex gap-1">
                  {timeRanges.map((range) => (
                      (() => {
                        const days = RANGE_DAYS[range] ?? 1;
                        const disabled = days > accountAgeDays;
                        return (
                      <button
                          key={range}
                          disabled={disabled}
                          onClick={() => setSelectedRange(range)}
                          className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                            disabled ? "text-gray-700 cursor-not-allowed" : "hover-surface"
                          }`}
                          style={{ color: disabled ? "#4B5563" : selectedRange === range ? chartColor : "#9CA3AF" }}
                      >
                        {range}
                      </button>
                        );
                      })()
                  ))}
                </div>
              </div>
            </div>

            {showDepositModal && (
              <DepositMethodModal onClose={() => setShowDepositModal(false)} />
            )}

            {address && (
                <div className="mb-8">
                  <div className="flex items-center justify-between py-4 border-b border-default">
                    <div>
                      <p className="text-xs text-soft uppercase tracking-widest mb-0.5">{t("overview.buyingPower")}</p>
                      <p className="text-lg font-bold">
                        ${accountBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <button
                        onClick={() => setShowDepositModal(true)}
                        className="bg-white text-black text-sm font-bold px-4 py-2 rounded-full hover:bg-gray-200 transition-colors"
                    >
                      {t("overview.deposit")}
                    </button>
                  </div>
                </div>
            )}

            {address && Object.keys(holdings).length > 0 && (
                <div className="mb-8">
                  <Link to="/portfolio" className="text-base font-semibold mb-3 text-muted transition-colors inline-block">{t("overview.holdings")}</Link>
                  <div className="space-y-2">
                    {Object.entries(holdings).map(([ticker, qty]) => {
                      const price = holdingPrices[ticker] ?? 0;
                      const total = qty * price;
                      return (
                          <HoldingRow key={ticker} ticker={ticker} qty={qty} price={price} total={total} />
                      );
                    })}
                  </div>
                </div>
            )}

            {!address && (
                <div className="flex flex-col items-center justify-center py-16 text-center border border-default rounded-2xl">
                  <p className="text-muted text-sm mb-4">{t("overview.connectPrompt")}</p>
                </div>
            )}

          </div>

          <div className="hidden lg:block pl-6">
            <div className="sticky top-24">
              <Watchlist />
            </div>
          </div>
        </div>
      </div>
  );
}