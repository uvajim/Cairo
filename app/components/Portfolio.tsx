"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { PortfolioChart } from "./PortfolioChart";
import { Watchlist } from "./Watchlist";
import { useWallet } from "../contexts/WalletContext";
import { BACKEND_URL, ASSETS_URL } from "../lib/config";
import { DepositMethodModal } from "./DepositMethodModal";
import { holdingsCache } from "../lib/holdingsCache";

function HoldingRow({ ticker, qty, price, total }: { ticker: string; qty: number; price: number; total: number }) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  return (
      <Link to={`/stock/${ticker}`} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0 hover:bg-gray-900 -mx-1 px-1 rounded-lg transition-colors">
        <div className="flex items-center gap-3">
          {!imgError ? (
              <Image
                  src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                  alt={ticker}
                  width={36}
                  height={36}
                  unoptimized
                  className="rounded-full bg-gray-800 object-cover"
                  onError={() => setImgError(true)}
              />
          ) : (
              <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold">
                {ticker[0]}
              </div>
          )}
          <div>
            <p className="text-sm font-bold">{ticker}</p>
            <p className="text-xs text-gray-400">{t("portfolio.shares", { count: qty })}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">
            {total > 0 ? `$${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
          </p>
          <p className="text-xs text-gray-400">
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

// Chart cache keyed by range
const chartCache: Record<string, { time: string; value: number }[]> = {};

export function Portfolio() {
  const { t } = useTranslation();
  const [selectedRange, setSelectedRange] = useState("1D");
  const [hoveredPrice, setHoveredPrice]   = useState<number | null>(null);
  const [hoveredTime,  setHoveredTime]    = useState<string | null>(null);
  const [chartPoints,  setChartPoints]    = useState<{ time: string; value: number }[]>(chartCache["1D"] ?? []);
  const [chartLoading, setChartLoading]   = useState(!chartCache["1D"]);

  // Rely strictly on the context!
  const { address, ethBalance, accountBalance, ethPrice } = useWallet();

  // Holdings — seed from shared cache instantly
  const [holdings,      setHoldings]      = useState<Record<string, number>>(holdingsCache.holdings);
  const [holdingPrices, setHoldingPrices] = useState<Record<string, number>>(holdingsCache.prices);

  useEffect(() => {
    if (!address) { setHoldings({}); setHoldingPrices({}); return; }
    let cancelled = false;
    const fetchHoldings = async () => {
      try {
        const res  = await fetch(ASSETS_URL, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ walletAddress: address }),
        });
        const data = await res.json();
        const h: Record<string, number> = data?.holdings ?? {};
        if (cancelled) return;
        setHoldings(h);
        const tickers = Object.keys(h);
        if (tickers.length === 0) return;
        const snapRes  = await fetch(`${BACKEND_URL}/api/market/snapshots?symbols=${tickers.join(",")}`);
        const snapData = await snapRes.json();
        if (cancelled) return;
        const prices: Record<string, number> = {};
        for (const ticker of tickers) {
          prices[ticker] = snapData[ticker]?.price ?? 0;
        }
        setHoldingPrices(prices);
        // Keep shared cache warm for the Portfolio tab
        holdingsCache.address  = address;
        holdingsCache.holdings = h;
        holdingsCache.prices   = prices;
      } catch { /* keep previous */ }
    };
    fetchHoldings();
    const id = setInterval(fetchHoldings, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [address]);

  const [showDepositModal, setShowDepositModal] = useState(false);

  // Uses the fixed value from WalletContext
  const holdingsValue  = Object.entries(holdings).reduce((sum, [ticker, qty]) => sum + qty * (holdingPrices[ticker] ?? 0), 0);
  const portfolioValue = address ? accountBalance + holdingsValue : 0;

  const chartColor =
      chartPoints.length >= 2 &&
      chartPoints[chartPoints.length - 1].value >= chartPoints[0].value
          ? "#00c805"
          : "#ff5000";

  useEffect(() => {
    if (chartCache[selectedRange]) {
      setChartPoints(chartCache[selectedRange]);
      setChartLoading(false);
      return;
    }
    setChartPoints([]);
    setChartLoading(true);
    const days = RANGE_DAYS[selectedRange] ?? 1;
    fetch(`${BACKEND_URL}/api/market/eth-history?days=${days}`)
        .then(r => r.json())
        .then(data => {
          const multiplier = address && ethBalance > 0 ? ethBalance : 1;
          const points = (data.points ?? []).map(
              (p: { time: string; value: number }) => ({
                time:  p.time,
                value: Math.round(p.value * multiplier * 100) / 100,
              })
          );
          chartCache[selectedRange] = points;
          setChartPoints(points);
        })
        .catch(() => {})
        .finally(() => setChartLoading(false));
  }, [selectedRange, address, ethBalance]);

  const displayValue = hoveredPrice ?? portfolioValue;

  return (
      <div className="bg-black text-white font-sans selection:bg-gray-800">
        <div className="max-w-[1024px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">

          <div className="flex flex-col">
            <header className="mb-6 relative">
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-1 cursor-pointer group w-fit">
                  <h1 className="text-xl font-medium group-hover:text-gray-300 transition-colors">{t("overview.title")}</h1>
                </div>
              </div>

              <div>
                <h2 className="text-4xl font-bold tracking-tight mb-1">
                  ${displayValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h2>
              </div>
            </header>

            <div className="mb-8 relative">
              {chartLoading ? (
                  <div className="h-[280px] w-full bg-gray-900/40 animate-pulse rounded-xl" />
              ) : (
                  <PortfolioChart
                      color={chartColor}
                      showReferenceLine={false}
                      data={chartPoints.length > 0 ? chartPoints : undefined}
                      onHover={(v, t) => { setHoveredPrice(v); setHoveredTime(t); }}
                  />
              )}
              <div className="flex justify-between items-center mt-6 border-b border-gray-800 pb-4">
                <div className="flex gap-1">
                  {timeRanges.map((range) => (
                      <button
                          key={range}
                          onClick={() => setSelectedRange(range)}
                          className="px-3 py-1 text-xs font-bold rounded hover:bg-gray-800 transition-colors"
                          style={{ color: selectedRange === range ? chartColor : "#9CA3AF" }}
                      >
                        {range}
                      </button>
                  ))}
                </div>
              </div>
            </div>

            {showDepositModal && (
              <DepositMethodModal onClose={() => setShowDepositModal(false)} />
            )}

            {address && (
                <div className="mb-8">
                  <div className="flex items-center justify-between py-4 border-b border-gray-800">
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-widest mb-0.5">{t("overview.buyingPower")}</p>
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
                  <Link to="/portfolio" className="text-base font-semibold mb-3 text-gray-200 hover:text-white transition-colors inline-block">{t("overview.holdings")}</Link>
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
                <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl">
                  <p className="text-gray-400 text-sm mb-4">{t("overview.connectPrompt")}</p>
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