"use client";

import { useState, useEffect } from "react";
import { Link } from "react-router";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWallet } from "../contexts/WalletContext";
import { BACKEND_URL, ASSETS_URL } from "../lib/config";
import { holdingsCache } from "../lib/holdingsCache";

function HoldingRow({
  ticker,
  qty,
  price,
  total,
}: {
  ticker: string;
  qty: number;
  price: number;
  total: number;
}) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  return (
    <Link
      to={`/stock/${ticker}`}
      className="flex items-center justify-between py-4 border-b border-gray-800 last:border-0 hover:bg-gray-900 -mx-1 px-1 rounded-lg transition-colors"
    >
      <div className="flex items-center gap-3">
        {!imgError ? (
          <Image
            src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
            alt={ticker}
            width={40}
            height={40}
            unoptimized
            className="rounded-full bg-gray-800 object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold">
            {ticker[0]}
          </div>
        )}
        <div>
          <p className="font-bold text-sm">{ticker}</p>
          <p className="text-xs text-gray-400">
            {t("portfolio.shares", { count: qty })}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold text-sm">
          {total > 0
            ? `$${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "—"}
        </p>
        <p className="text-xs text-gray-400">
          {price > 0
            ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t("portfolio.perShare")}`
            : "—"}
        </p>
      </div>
    </Link>
  );
}

export function PortfolioHoldings() {
  const { t } = useTranslation();
  const { address } = useWallet();

  const cached = holdingsCache.address === address;
  const [holdings,      setHoldings]      = useState<Record<string, number>>(cached ? holdingsCache.holdings : {});
  const [holdingPrices, setHoldingPrices] = useState<Record<string, number>>(cached ? holdingsCache.prices   : {});
  const [loading,       setLoading]       = useState(!cached);

  useEffect(() => {
    if (!address) { setHoldings({}); setHoldingPrices({}); return; }

    // Already have fresh data from the Overview poll
    if (holdingsCache.address === address && Object.keys(holdingsCache.holdings).length > 0) {
      setHoldings(holdingsCache.holdings);
      setHoldingPrices(holdingsCache.prices);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

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
        if (tickers.length === 0) { setLoading(false); return; }

        const snapRes  = await fetch(`${BACKEND_URL}/api/market/snapshots?symbols=${tickers.join(",")}`);
        const snapData = await snapRes.json();
        if (cancelled) return;

        const prices: Record<string, number> = {};
        for (const ticker of tickers) {
          prices[ticker] = snapData[ticker]?.price ?? 0;
        }
        setHoldingPrices(prices);
        holdingsCache.address  = address;
        holdingsCache.holdings = h;
        holdingsCache.prices   = prices;
      } catch { /* keep previous */ }
      finally { if (!cancelled) setLoading(false); }
    };

    fetchHoldings();
    return () => { cancelled = true; };
  }, [address]);

  const totalValue = Object.entries(holdings).reduce(
    (sum, [ticker, qty]) => sum + qty * (holdingPrices[ticker] ?? 0),
    0
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-1">{t("portfolio.title")}</h2>
        <p className="text-gray-400 text-sm">{t("portfolio.subtitle")}</p>
      </div>

      {!address && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl">
          <p className="text-gray-400 text-sm">{t("portfolio.connectPrompt")}</p>
        </div>
      )}

      {address && loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t("portfolio.loading")}</span>
        </div>
      )}

      {address && !loading && Object.keys(holdings).length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl">
          <p className="text-gray-400 text-sm">{t("portfolio.empty")}</p>
        </div>
      )}

      {address && !loading && Object.keys(holdings).length > 0 && (
        <>
          {/* Total value card */}
          <div className="bg-[#1E1E24] rounded-2xl px-6 py-5 mb-6 flex items-center justify-between">
            <span className="text-sm text-gray-400">{t("portfolio.totalValue")}</span>
            <span className="text-xl font-bold">
              ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Holdings list */}
          <div className="bg-[#1E1E24] rounded-2xl px-6 py-2">
            {Object.entries(holdings).map(([ticker, qty]) => {
              const price = holdingPrices[ticker] ?? 0;
              return (
                <HoldingRow
                  key={ticker}
                  ticker={ticker}
                  qty={qty}
                  price={price}
                  total={qty * price}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
