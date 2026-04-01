"use client";

import { Link } from "react-router";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSnapshots } from "../hooks/useSnapshots";

// Indices are displayed by name but priced via their ETF proxies.
const INDICES = [
  { name: "S&P 500", etf: "SPY" },
  { name: "Dow",     etf: "DIA" },
  { name: "Nasdaq",  etf: "QQQ" },
];

const TOP_MOVERS = ["CVNA", "ETSY", "NVDA", "TSLA", "META", "PLTR"];

const POPULAR = [
  { symbol: "VOO",  name: "Vanguard S&P 500 ETF", color: "bg-red-500"   },
  { symbol: "NVDA", name: "NVIDIA Corporation",    color: "bg-green-500" },
  { symbol: "SOFI", name: "SoFi Technologies",     color: "bg-blue-500"  },
  { symbol: "TSLA", name: "Tesla, Inc.",           color: "bg-gray-700"  },
];

// All unique symbols we need quotes for
const ALL_SYMBOLS = [
  ...INDICES.map(i => i.etf),
  ...TOP_MOVERS,
  ...POPULAR.map(p => p.symbol),
].filter((s, i, arr) => arr.indexOf(s) === i); // dedupe

export function Watchlist() {
  const { t } = useTranslation();
  const quotes = useSnapshots(ALL_SYMBOLS);

  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="surface-1 border-l border-default h-full w-full max-w-sm ml-auto">
      <div className="p-6 space-y-8">

        {/* Header */}
        <h2 className="text-xl font-medium app-fg">{t("watchlist.markets")}</h2>

        {/* Indices */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-muted text-sm">{t("watchlist.indices")}</h3>
            <span className="text-xs text-soft">{today}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {INDICES.map(({ name, etf }) => {
              const q    = quotes[etf];
              const isUp = (q?.changePercent ?? 0) >= 0;
              return (
                <Link
                  to={`/stock/${etf}`}
                  key={etf}
                  className="surface-2 rounded-xl p-3 flex flex-col items-center justify-center text-center border border-default hover-surface transition-colors"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-2 ${isUp ? "bg-green-500/10 text-[#00c805]" : "bg-red-500/10 text-[#ff5000]"}`}>
                    {isUp ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  </div>
                  {q ? (
                    <span className={`text-sm font-bold mb-1 ${isUp ? "text-[#00c805]" : "text-[#ff5000]"}`}>
                      {isUp ? "+" : ""}{q.changePercent.toFixed(2)}%
                    </span>
                  ) : (
                    <div className="h-4 w-10 surface-3 animate-pulse rounded mb-1" />
                  )}
                  <span className="text-xs font-medium text-muted">{name}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Top Movers */}
        <div>
          <h3 className="font-medium text-muted text-sm mb-4">{t("watchlist.topMovers")}</h3>
          <div className="flex flex-wrap gap-2">
            {TOP_MOVERS.map((symbol) => {
              const q    = quotes[symbol];
              const isUp = (q?.changePercent ?? 0) >= 0;
              return (
                <Link
                  to={`/stock/${symbol}`}
                  key={symbol}
                  className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full border border-default transition-all surface-2 hover-surface"
                >
                  <span className="font-bold text-sm app-fg">{symbol}</span>
                  {q ? (
                    <span className={`flex items-center text-xs font-bold ${isUp ? "text-[#00c805]" : "text-[#ff5000]"}`}>
                      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(q.changePercent).toFixed(2)}%
                    </span>
                  ) : (
                    <div className="h-3 w-8 surface-3 animate-pulse rounded" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Popular Stocks */}
        <div>
          <h3 className="font-medium text-muted text-sm mb-4">{t("watchlist.popularStocks")}</h3>
          <div className="space-y-3">
            {POPULAR.map((stock) => {
              const q     = quotes[stock.symbol];
              const isUp  = (q?.changePercent ?? 0) >= 0;
              return (
                <Link
                  to={`/stock/${stock.symbol}`}
                  key={stock.symbol}
                  className="surface-2 p-4 rounded-xl flex items-center justify-between border border-default hover-surface transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${stock.color} flex items-center justify-center text-white font-bold text-xs`}>
                      {stock.symbol.slice(0, 1)}
                    </div>
                    <div>
                      <div className="font-bold text-sm app-fg">{stock.symbol}</div>
                      <div className="text-xs text-muted truncate max-w-[160px]">{stock.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {q ? (
                      <>
                        <div className="font-medium text-sm app-fg">
                          ${q.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={`text-xs font-medium ${isUp ? "text-[#00c805]" : "text-[#ff5000]"}`}>
                          {isUp ? "+" : ""}{q.changePercent.toFixed(2)}%
                        </div>
                      </>
                    ) : (
                      <div className="h-8 w-14 surface-3 animate-pulse rounded" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
