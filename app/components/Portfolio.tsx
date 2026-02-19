"use client";

import { useState, useEffect } from "react";
import { PortfolioChart } from "./PortfolioChart";
import { Watchlist } from "./Watchlist";
import { ChevronDown } from "lucide-react";
import { useWallet } from "../contexts/WalletContext";
import { BACKEND_URL } from "../lib/config";

const timeRanges = ["1D", "1W", "1M", "3M", "1Y"];

const RANGE_DAYS: Record<string, number> = {
  "1D": 1, "1W": 7, "1M": 30, "3M": 90, "1Y": 365,
};

export function Portfolio() {
  const [selectedRange, setSelectedRange] = useState("1D");
  const [hoveredPrice, setHoveredPrice]   = useState<number | null>(null);
  const [hoveredTime,  setHoveredTime]    = useState<string | null>(null);
  const [chartPoints,  setChartPoints]    = useState<{ time: string; value: number }[]>([]);
  const [chartLoading, setChartLoading]   = useState(true);

  const { address, ethBalance, usdBalance, ethPrice } = useWallet();

  const portfolioValue = address ? usdBalance : 0;

  // Determine chart color by comparing first vs last chart point
  const chartColor =
    chartPoints.length >= 2 &&
    chartPoints[chartPoints.length - 1].value >= chartPoints[0].value
      ? "#00c805"
      : "#ff5000";

  // Fetch ETH price history; multiply by current ETH balance to get portfolio value history
  useEffect(() => {
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
        setChartPoints(points);
      })
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [selectedRange, address, ethBalance]);

  // The value shown in the header: hovered historical price, or live portfolio value
  const displayValue = hoveredPrice ?? portfolioValue;

  return (
    <div className="bg-black text-white font-sans selection:bg-gray-800">
      <div className="max-w-[1024px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12">

        {/* Main content column */}
        <div className="flex flex-col">

          {/* Header */}
          <header className="mb-6 relative">
            <div className="flex justify-between items-start mb-1">
              <div className="flex items-center gap-1 cursor-pointer group w-fit">
                <h1 className="text-xl font-medium group-hover:text-gray-300 transition-colors">Individual</h1>
                <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
              </div>
              <div className="bg-[#1E1E24] px-3 py-1.5 rounded-full flex items-center gap-2 cursor-pointer hover:bg-gray-800 transition-colors">
                <span className="text-[#FFB119] font-bold text-xs">Earn 3.35% APY</span>
              </div>
            </div>

            <div>
              <h2 className="text-4xl font-bold tracking-tight mb-1">
                ${displayValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
              {hoveredTime ? (
                <p className="text-sm text-gray-400">{hoveredTime}</p>
              ) : address ? (
                <p className="text-sm text-gray-400">
                  {ethBalance.toFixed(6)} ETH
                  {ethPrice > 0 && (
                    <span className="ml-2 text-gray-600">@ ${ethPrice.toLocaleString()} / ETH</span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-gray-500">Connect wallet to see your balance</p>
              )}
            </div>
          </header>

          {/* Chart */}
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

          {/* Empty state */}
          {!address && (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl">
              <p className="text-gray-400 text-sm mb-4">Connect your wallet to see your portfolio</p>
            </div>
          )}

        </div>

        {/* Watchlist sidebar */}
        <div className="hidden lg:block pl-6">
          <div className="sticky top-24">
            <Watchlist />
          </div>
        </div>

      </div>
    </div>
  );
}
